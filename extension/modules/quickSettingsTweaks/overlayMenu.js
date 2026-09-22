'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const LOG_PREFIX = '[LIDSoL Overlay]';

// Cache de la subclase de layout registrada, por constructor del layout nativo:
// evita volver a registrar una clase GObject con el mismo nombre en el proceso
// (GJS lanza "Type name ... is already registered") al re-enablear el módulo o
// al alternar el overlay OFF→ON.
const _repartitionedLayoutCache = new WeakMap();

// 2.4.1 — Overlay Mode con desplazamiento nativo arriba/abajo.
//
// Se conserva la animación nativa del shell (QuickToggleMenu.open(): easing de la
// altura del actor + fade del contenido + dim de los quicks) y solo se parchea el
// layout del grid para REPARTIR el hueco que reserva el overlay:
//
//   nativo :  tras la fila del toggle activo  se añade siempre `y += overlayHeight`
//   reparto:  `upShift` px hacia arriba (filas superiores) + `downShift` hacia abajo
//
// Con `upShift = min(overlayHeight, altura de las filas superiores)`, el hueco queda
// centrado en el toggle pulsado: las opciones aparecen donde estaba el toggle y nada
// se desborda por abajo (caso extremo: toggle en la última fila → todo el hueco
// arriba; toggle en la primera → comportamiento nativo).
//
// No se escucha `open-state-changed` (en GNOME 51 cambió el orden de emisión, antes
// de montar la animación): el layout detecta la fila activa por `menu.actor.visible`
// frame a frame, igual en GNOME 50.5 y 51.

export class OverlayMenuFeature {
    constructor() {
        this._gsettings = null;
        this._enabled = false;
        this._signalIds = [];
        this._grid = null;
        this._originalLayout = null;
        this._spans = null;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();

        // Connect handlers BEFORE the enabled check so they stay alive
        // even when overlay is disabled, allowing re-enable via settings.
        this._connectHandlers();
        if (!this._enabled) return;

        const qs = Main.panel.statusArea.quickSettings;
        if (!qs || !qs.menu) return;
        if (!qs.menu._overlay) {
            log(`${LOG_PREFIX} quick settings menu sin overlay; se omite`);
            return;
        }

        const grid = qs.menu._grid;
        if (!grid || !grid.layout_manager) {
            log(`${LOG_PREFIX} grid del menú no disponible; se omite`);
            return;
        }

        this._grid = grid;
        this._originalLayout = grid.layout_manager;
        this._applyRepartitionedLayout();
    }

    disable() {
        this._disconnectHandlers();

        if (this._grid && this._originalLayout) {
            // Reemplazar el layout vuelve a crear los child metas (column-span a 1):
            // restaurar el layout nativo y reaplicar los spans capturados.
            this._grid.layout_manager = this._originalLayout;
            if (this._spans)
                this._restoreSpans(this._originalLayout);
            this._grid.queue_relayout();
        }
        this._grid = null;
        this._originalLayout = null;
        this._spans = null;
        this._gsettings = null;
    }

    _loadSettings() {
        this._enabled = this._gsettings.get_boolean('qst-overlay-menu-enabled');
    }

    _connectHandlers() {
        const id = this._gsettings.connect('changed::qst-overlay-menu-enabled', () => {
            this._loadSettings();
            this._scheduleReload();
        });
        this._signalIds.push(id);
    }

    _disconnectHandlers() {
        for (const id of this._signalIds) {
            try { this._gsettings.disconnect(id); } catch (_) {}
        }
        this._signalIds = [];
    }

    _scheduleReload() {
        if (this._reloadId) {
            try { GLib.source_remove(this._reloadId); } catch (_) {}
        }
        const gsettings = this._gsettings;
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._reloadId = null;
            this.disable();
            this.enable(gsettings);
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── Reparto del hueco del overlay ────────────────────────────────────
    //
    // `QuickSettingsLayout` es una clase JS registrada NO exportada: se obtiene con
    // `grid.layout_manager.constructor`. Se crea una subclase que sobreescribe solo
    // `vfunc_allocate` (el resto —preferred height, agrupación en filas, spans— se
    // hereda) y se sustituye el layout_manager del grid por una instancia de ella.
    //
    // La altura TOTAL del grid no cambia (misma preferred height), así que no se
    // toca `vfunc_get_preferred_height`.

    _applyRepartitionedLayout() {
        const grid = this._grid;
        const nativeLayout = this._originalLayout;
        if (nativeLayout._lidsolRepartitioned)
            return;

        const NativeLayout = nativeLayout.constructor;
        if (!NativeLayout)
            return;

        // Capturar los column-span ANTES de reemplazar (se recrean los child metas).
        const spans = [];
        for (const child of grid) {
            const meta = nativeLayout.get_child_meta(grid, child);
            spans.push([child, meta.columnSpan]);
        }
        this._spans = spans;

        // Registrar la subclase del layout UNA sola vez por constructor nativo:
        // GJS lanza "Type name 'Gjs_LayoutWithRepartition' is already registered"
        // si se vuelve a registrar una clase con el mismo nombre dentro del
        // proceso, lo que impedía recargar el módulo/toggle (OFF→ON).
        let LayoutWithRepartition = _repartitionedLayoutCache.get(NativeLayout);
        if (!LayoutWithRepartition) {
            LayoutWithRepartition = GObject.registerClass(
                class LayoutWithRepartition extends NativeLayout {
                    vfunc_allocate(container, box) {
                        const rows = this._getRows(container);

                        const [, overlayHeight] =
                            this._overlay.get_preferred_height(box.get_width());

                        const availWidth =
                            box.get_width() - (this.nColumns - 1) * this.column_spacing;
                        const childWidth = Math.floor(availWidth / this.nColumns);

                        this._overlay.allocate_available_size(
                            0, 0, box.get_width(), overlayHeight);

                        const isRtl =
                            container.text_direction === Clutter.TextDirection.RTL;

                        // Fila del toggle con el menú abierto (-1 si ninguno: allocate
                        // idéntico al nativo, sin sesgo).
                        let activeIndex = -1;
                        for (let i = 0; i < rows.length; i++) {
                            if (rows[i].some(c => c.menu?.actor.visible)) {
                                activeIndex = i;
                                break;
                            }
                        }

                        // upShift: porción del hueco absorbida por las filas superiores
                        // (limitada al espacio que realmente ocupan); downShift = el resto.
                        let upShift = 0;
                        if (activeIndex !== -1) {
                            let spaceAbove = 0;
                            for (let i = 0; i < activeIndex; i++) {
                                const [, rowNat] = this._getRowHeight(rows[i]);
                                spaceAbove += rowNat + this.row_spacing;
                            }
                            upShift = Math.min(overlayHeight, spaceAbove);
                        }

                        const childBox = new Clutter.ActorBox();
                        let y = box.y1 - upShift;
                        rows.forEach(row => {
                            const [, rowNat] = this._getRowHeight(row);

                            let lineIndex = 0;
                            row.forEach(child => {
                                const colSpan = this._getColSpan(container, child);
                                const width = childWidth * colSpan +
                                    this.column_spacing * (colSpan - 1);
                                let x =
                                    box.x1 + lineIndex * (childWidth + this.column_spacing);
                                if (isRtl)
                                    x = box.x2 - width - x;

                                childBox.set_origin(x, y);
                                childBox.set_size(width, rowNat);
                                child.allocate(childBox);

                                lineIndex = (lineIndex + colSpan) % this.nColumns;
                            });

                            y += rowNat + this.row_spacing;

                            if (row.some(c => c.menu?.actor.visible))
                                y += overlayHeight;
                        });
                    }
                });
            _repartitionedLayoutCache.set(NativeLayout, LayoutWithRepartition);
        }

        const repartitioned = new LayoutWithRepartition(nativeLayout._overlay, {
            nColumns: nativeLayout.nColumns,
        });
        repartitioned._lidsolRepartitioned = true;

        grid.layout_manager = repartitioned;
        this._restoreSpans(repartitioned);
        grid.queue_relayout();
    }

    _restoreSpans(layout) {
        for (const [child, span] of this._spans)
            layout.child_set_property(this._grid, child, 'column-span', span);
    }
}