'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const LOG_PREFIX = '[LIDSoL Overlay]';

// Duración del easing de altura del menú del toggle (QuickToggleMenu.open()/close()
// usan POPUP_ANIMATION_TIME/2). Import del namespace completo (un import con nombre
// lanzaría si el export cambiara de nombre en alguna versión): con fallback 400.
const MENU_EASE_MS = (QuickSettings.POPUP_ANIMATION_TIME ?? 400) / 2;

// Cache de la subclase de layout registrada, por constructor del layout nativo:
// evita volver a registrar una clase GObject con el mismo nombre en el proceso
// (GJS lanza "Type name ... is already registered") al re-enablear el módulo o
// al alternar el overlay OFF→ON.
const _accordionLayoutCache = new WeakMap();

// 2.4.1 — Overlay Mode "acordeón + fade".
//
// Se conserva la animación nativa del shell (QuickToggleMenu: easing de la altura
// del actor + fade del contenido + dim de los quicks) y SOLO se parchea el layout
// del grid. Mientras el menú del toggle pulsado crece, todas las filas salvo la
// pulsada se desvanecen y colapsan su altura hacia 0 con EL MISMO ease del menú
// (POPUP_ANIMATION_TIME/2, easeOutCubic):
//
//   fila activa  → altura natural, totalmente visible
//   otras filas  → `alturaNatural * (1 - p)` y opacidad `255 * (1 - p)`, p ∈ [0,1]
//
// Resultado: el toggle sube suavemente con el acordeón (las filas de arriba ceden
// su altura), las opciones aparecen donde estaba el toggle (menú nativo, dim
// intacto), nada se desborda fuera del contenedor y no queda banda vacía: el
// contenedor termina envolviendo solo "fila del toggle + menú". Al cerrar, en
// espejo (el progreso vuelve a 0 mientras el menú baja su altura y se oculta).
//
// El progreso p se ANIMA (0→1 al abrir, 1→0 al cerrar) y es estado decidido UNA
// vez por apertura: una "sesión" se crea al detectar la fila activa por
// `menu.actor.visible` (no se escucha `open-state-changed`: en GNOME 51 cambió el
// orden de emisión, antes de montar la animación — esta detección es idéntica en
// GNOME 50.5 y 51) y se destruye cuando el menú se oculta y el progreso llega a 0.
// El cierre se detecta además cuando la altura del menú empieza a decrecer (el
// shell baja la altura del actor antes de ocultarlo).
//
// Lecciones de perf (lag del enfoque "banda esencial", preservado en la rama
// banda-esencial):
//   - sin get_transformed_position por frame
//   - sin preferred height caro por frame (las alturas naturales se capturan una
//     sola vez por apertura; el override de preferred es aritmética barata)
//   - sin ocultar/restaurar filas a mitad de animación (solo fade + altura)

export class OverlayMenuFeature {
    constructor() {
        this._gsettings = null;
        this._enabled = false;
        this._signalIds = [];
        this._grid = null;
        this._layout = null;
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
        this._applyAccordionLayout();
    }

    disable() {
        this._disconnectHandlers();

        // Cerrar la sesión de acordeón viva (timer + clips + opacidades) antes de
        // reemplazar el layout.
        this._layout?._lidsolEndSession();

        if (this._grid && this._originalLayout) {
            // Reemplazar el layout vuelve a crear los child metas (column-span a 1):
            // restaurar el layout nativo y reaplicar los spans capturados.
            this._grid.layout_manager = this._originalLayout;
            if (this._spans)
                this._restoreSpans(this._originalLayout);
            this._grid.queue_relayout();
        }
        this._grid = null;
        this._layout = null;
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

    // ── "Acordeón + fade" sobre el layout del grid ──────────────────────
    //
    // `QuickSettingsLayout` es una clase JS registrada NO exportada: se obtiene con
    // `grid.layout_manager.constructor`. Se crea una subclase que sobreescribe
    // `vfunc_allocate` y `vfunc_get_preferred_height` (con sesión) y se sustituye el
    // layout_manager del grid por una instancia de ella. Sin sesión, ambos vfuncs
    // delegran en el nativo (`super`), con lo que el modo cerrado es idéntico.
    //
    // El grid nativo tiene como primer hijo un "placeholder" (Clutter.Actor con
    // BindConstraint HEIGHT → overlay) que actúa de fila espaciadora: su altura es
    // la altura actual del menú. Durante una sesión se excluye de las filas (esa
    // altura es justo lo que estamos plegando) y se descartan las filas vacías.

    _applyAccordionLayout() {
        const grid = this._grid;
        const nativeLayout = this._originalLayout;
        if (nativeLayout._lidsolAccordion)
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
        // GJS lanza "Type name 'Gjs_LayoutWithAccordion' is already registered"
        // si se vuelve a registrar una clase con el mismo nombre dentro del
        // proceso, lo que impedía recargar el módulo/toggle (OFF→ON).
        let LayoutWithAccordion = _accordionLayoutCache.get(NativeLayout);
        if (!LayoutWithAccordion) {
            LayoutWithAccordion = GObject.registerClass(
                class LayoutWithAccordion extends NativeLayout {
                    // ── Sesión de apertura ────────────────────────────────
                    //
                    // state capturado UNA vez por apertura:
                    //   rows:             filas SIN el placeholder (fila espaciadora)
                    //   naturalHeights[]: alturas naturales por fila (una sola vez)
                    //   activeIndex:      fila del toggle pulsado (menú visible)
                    //   clipped[]:        hijos con clip_to_allocation activado
                    //   progress:         0..1 (cerrado→abierto), ANIMADO
                    //   closing:          true cuando el menú se está cerrando
                    //   ease / timerId:   animador del progreso (easeOutCubic)

                    _lidsolBeginSession(container, rowsAll) {
                        if (this._lidsolSession)
                            this._lidsolEndSession();

                        const placeholder = container.get_first_child();
                        const rows = rowsAll
                            .map(r => r.filter(c => c !== placeholder))
                            .filter(r => r.length > 0);

                        let activeIndex = -1;
                        for (let i = 0; i < rows.length; i++) {
                            if (rows[i].some(c => c.menu?.actor.visible)) {
                                activeIndex = i;
                                break;
                            }
                        }
                        if (activeIndex === -1)
                            return null;

                        const naturalHeights = rows.map(r => this._getRowHeight(r)[1]);
                        const clipped = [];

                        for (let i = 0; i < rows.length; i++) {
                            if (i === activeIndex)
                                continue;
                            for (const c of rows[i]) {
                                try { c.clip_to_allocation = true; } catch (_) {}
                                clipped.push(c);
                            }
                        }

                        const session = {
                            rows,
                            naturalHeights,
                            activeIndex,
                            clipped,
                            progress: 0,
                            closing: false,
                            ease: null,
                            timerId: 0,
                        };
                        this._lidsolSession = session;
                        this._lidsolStartEase(session, 1, MENU_EASE_MS);
                        return session;
                    }

                    _lidsolEndSession() {
                        const session = this._lidsolSession;
                        this._lidsolSession = null;
                        if (!session)
                            return;

                        if (session.timerId) {
                            try { GLib.source_remove(session.timerId); } catch (_) {}
                        }
                        for (const c of session.clipped) {
                            try { c.clip_to_allocation = false; } catch (_) {}
                            c.opacity = 255;
                        }
                    }

                    // Anima el progreso hacia `target` (1 = abierto, 0 = cerrado) con
                    // la misma duración y curva (easeOutCubic) que el ease de altura
                    // del menú. Un único timeout de 60 Hz por sesión re-lee el ease
                    // actual, así que re-encaminar (1→0 o 0→1) es suave.
                    _lidsolStartEase(session, target, duration) {
                        const now = GLib.get_monotonic_time() / 1000;
                        session.ease = {
                            start: now,
                            from: session.progress,
                            to: target,
                            duration,
                        };
                        if (session.timerId)
                            return;

                        session.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                            const e = session.ease;
                            const t = e
                                ? (GLib.get_monotonic_time() / 1000 - e.start) / e.duration
                                : 1;
                            const k = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
                            session.progress = e
                                ? e.from + (e.to - e.from) * k
                                : session.progress;

                            if (this._container)
                                this._container.queue_relayout();

                            if (t < 1)
                                return GLib.SOURCE_CONTINUE;

                            session.timerId = 0;
                            return GLib.SOURCE_REMOVE;
                        });
                    }

                    vfunc_get_preferred_height(container, forWidth) {
                        const session = this._lidsolSession;
                        if (!session)
                            return super.vfunc_get_preferred_height(container, forWidth);

                        const [, overlayHeight] =
                            this._overlay.get_preferred_height(forWidth);
                        const p = session.progress;

                        let minH = 0;
                        let natH = 0;
                        for (let i = 0; i < session.rows.length; i++) {
                            const active = i === session.activeIndex;
                            const h = active
                                ? session.naturalHeights[i]
                                : session.naturalHeights[i] * (1 - p);
                            minH += h;
                            natH += h;
                            if (i < session.rows.length - 1) {
                                const sp = this.row_spacing * (active ? 1 : 1 - p);
                                minH += sp;
                                natH += sp;
                            }
                        }

                        // Reserva para envolver el menú del toggle (las opciones).
                        minH += overlayHeight;
                        natH += overlayHeight;
                        return [minH, natH];
                    }

                    vfunc_allocate(container, box) {
                        const [, overlayHeight] =
                            this._overlay.get_preferred_height(box.get_width());

                        this._overlay.allocate_available_size(
                            0, 0, box.get_width(), overlayHeight);

                        const rowsAll = this._getRows(container);

                        // Fila con algún menú visible (-1 si ninguno).
                        let openRow = -1;
                        for (let i = 0; i < rowsAll.length; i++) {
                            if (rowsAll[i].some(c => c.menu?.actor.visible)) {
                                openRow = i;
                                break;
                            }
                        }

                        let session = this._lidsolSession;

                        if (!session) {
                            if (openRow === -1) {
                                this._lidsolAllocateNative(
                                    container, box, rowsAll, overlayHeight);
                                return;
                            }
                            session = this._lidsolBeginSession(container, rowsAll);
                            if (!session) {
                                // Sin fila visible tras filtrar el placeholder
                                // (salvaguarda): comportamiento nativo.
                                this._lidsolAllocateNative(
                                    container, box, rowsAll, overlayHeight);
                                return;
                            }
                        }

                        // Si la fila visible cambió (otro toggle), re-empezar sesión.
                        if (openRow !== -1) {
                            let liveActive = -1;
                            for (let i = 0; i < session.rows.length; i++) {
                                if (session.rows[i].some(c => c.menu?.actor.visible)) {
                                    liveActive = i;
                                    break;
                                }
                            }
                            if (liveActive !== -1 && liveActive !== session.activeIndex) {
                                this._lidsolEndSession();
                                session = this._lidsolBeginSession(container, rowsAll);
                                if (!session) {
                                    this._lidsolAllocateNative(
                                        container, box, rowsAll, overlayHeight);
                                    return;
                                }
                            }
                        }

                        // Detección de cierre: menú oculto o altura del menú bajando
                        // (la fase final del close nativo: fades el contenido y luego
                        // baja la altura del actor antes de ocultarlo).
                        if (openRow === -1 || overlayHeight < session.lastH) {
                            if (!session.closing)
                                this._lidsolStartEase(session, 0, MENU_EASE_MS);
                            session.closing = true;
                        }
                        session.lastH = Math.max(session.lastH, overlayHeight);

                        // Cierre completado: restaurar filas y volver al nativo.
                        if (session.closing && session.progress <= 0.005) {
                            this._lidsolEndSession();
                            this._lidsolAllocateNative(
                                container, box, rowsAll, overlayHeight);
                            return;
                        }

                        this._lidsolAllocateSession(container, box, session);
                    }

                    // allocate idéntico al nativo del shell (sin ninguna alteración).
                    _lidsolAllocateNative(container, box, rowsAll, overlayHeight) {
                        const isRtl =
                            container.text_direction === Clutter.TextDirection.RTL;

                        const availWidth =
                            box.get_width() - (this.nColumns - 1) * this.column_spacing;
                        const childWidth = Math.floor(availWidth / this.nColumns);
                        const childBox = new Clutter.ActorBox();
                        let y = box.y1;

                        rowsAll.forEach(row => {
                            const [, rowNat] = this._getRowHeight(row);

                            let lineIndex = 0;
                            row.forEach(child => {
                                const colSpan = this._getColSpan(container, child);
                                const width = childWidth * colSpan +
                                    this.column_spacing * (colSpan - 1);
                                let x = box.x1 +
                                    lineIndex * (childWidth + this.column_spacing);
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

                    // allocate "acordeón + fade": filas no activas colapsan su altura
                    // y opacidad con el progreso; la fila activa queda natural.
                    _lidsolAllocateSession(container, box, session) {
                        const isRtl =
                            container.text_direction === Clutter.TextDirection.RTL;
                        const p = session.progress;

                        const availWidth =
                            box.get_width() - (this.nColumns - 1) * this.column_spacing;
                        const childWidth = Math.floor(availWidth / this.nColumns);
                        const childBox = new Clutter.ActorBox();
                        let y = box.y1;

                        session.rows.forEach((row, i) => {
                            const active = i === session.activeIndex;
                            const rowH = active
                                ? session.naturalHeights[i]
                                : session.naturalHeights[i] * (1 - p);

                            let lineIndex = 0;
                            row.forEach(child => {
                                if (!active)
                                    child.opacity = Math.round(255 * (1 - p));

                                const colSpan = this._getColSpan(container, child);
                                const width = childWidth * colSpan +
                                    this.column_spacing * (colSpan - 1);
                                let x = box.x1 +
                                    lineIndex * (childWidth + this.column_spacing);
                                if (isRtl)
                                    x = box.x2 - width - x;

                                childBox.set_origin(x, y);
                                childBox.set_size(width, rowH);
                                child.allocate(childBox);

                                lineIndex = (lineIndex + colSpan) % this.nColumns;
                            });

                            y += rowH + (i < session.rows.length - 1
                                ? this.row_spacing * (active ? 1 : 1 - p)
                                : 0);
                        });
                    }
                });
            _accordionLayoutCache.set(NativeLayout, LayoutWithAccordion);
        }

        const accordion = new LayoutWithAccordion(nativeLayout._overlay, {
            nColumns: nativeLayout.nColumns,
        });
        accordion._lidsolAccordion = true;

        grid.layout_manager = accordion;
        this._layout = accordion;
        this._restoreSpans(accordion);
        grid.queue_relayout();
    }

    _restoreSpans(layout) {
        for (const [child, span] of this._spans)
            layout.child_set_property(this._grid, child, 'column-span', span);
    }
}