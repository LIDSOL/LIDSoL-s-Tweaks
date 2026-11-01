'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {
    QuickSlider,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { QuickSettingsMenuTracker } from '../../utils/childrenTracker.js';
import * as AdvAni from '../../utils/advani.js';

const LOG_PREFIX = '[LIDSoL Overlay]';

// 2.4.1 — Overlay Mode (port de Quick Settings Tweaks, src/features/overlayMenu.ts).
//
// El menú del toggle NO expande el grid: se muestra como un overlay flotante
// fijado al toggle pulsado (`_boxPointer`), con la altura nativa del menú. Se
// desactivan dos constraints nativos del shell:
//   - menu._overlay.get_constraints()[0]  → sincronización de posición del menu
//   - grid.layout_manager._overlay.get_constraints()[0] → "placeholder" que
//     engorda el grid con la altura del menú
// y en su lugar se ancla el overlay con BindConstraints X/Y → _boxPointer más
// offsets (centrado / ancla de desbordamiento: top|center|bottom).
//
// La animación nativa de apertura se cancela (set_easing_duration(0) /
// remove_all_transitions) y se sustituye por una personalizada según
// `qst-overlay-menu-animate-style`:
//   - flyout: el menú sale desde la posición/tamaño del toggle (`sourceActor`)
//   - dialog: escala desde 0.8 + desplazamiento centrado
// con curva bezier custom (QST "LowBackover"/"MiddleBackover") y duración
// `qst-overlay-menu-animate-duration` (0 = animación nativa).
// El ancho se fija por menú cuando `qst-overlay-menu-width` > 0.
//
// Cero trabajo por frame: solo eventos (open-state-changed del tracker,
// notify::height puntual del box) y eases one-shot de Clutter.

// Curvas bezier de QST (utils/advani.js, port de AdvAni): escape con rebote
// suave. `set_cubic_bezier_progress` espera dos `Graphene.Point` (Clutter-18),
// NO cuatro floats — por eso se usa AdvAni.ease y no un helper inline.
export class OverlayMenuFeature {
    constructor() {
        this._gsettings = null;
        this._enabled = false;
        this._width = 0;
        this._duration = 0;
        this._animationStyle = 'dialog';
        this._overflowAnchor = 'top';
        this._signalIds = [];
        this._reloadId = 0;
        this._tracker = null;
        this._xconstraint = null;
        this._yconstraint = null;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();

        // Handlers conectados SIEMPRE (también con el overlay desactivado) para
        // permitir ON→OFF→ON en caliente vía configuración.
        this._connectHandlers();
        if (!this._enabled)
            return;
        this._attach();
    }

    disable() {
        if (this._reloadId) {
            try { GLib.source_remove(this._reloadId); } catch (e) {}
            this._reloadId = 0;
        }
        this._disconnectHandlers();
        this._detach();
        this._gsettings = null;
    }

    _loadSettings() {
        const s = this._gsettings;
        this._enabled = s.get_boolean('qst-overlay-menu-enabled');
        this._width = s.get_int('qst-overlay-menu-width');
        this._duration = s.get_int('qst-overlay-menu-animate-duration');
        this._animationStyle = s.get_string('qst-overlay-menu-animate-style');
        this._overflowAnchor = s.get_string('qst-overlay-menu-overflow-anchor');
    }

    _connectHandlers() {
        // Claves ESTRUCTURALES → recarga completa (enable/disable).
        // Claves LIVE → solo actualizar el valor cacheado (se leen en vivo en
        // onOpen; recargar destruiría los constraints de forma innecesaria).
        const structural = new Set([
            'qst-overlay-menu-enabled',
            'qst-overlay-menu-width',
        ]);
        for (const key of [
            'qst-overlay-menu-enabled',
            'qst-overlay-menu-width',
            'qst-overlay-menu-animate-duration',
            'qst-overlay-menu-animate-style',
            'qst-overlay-menu-overflow-anchor',
        ]) {
            const id = this._gsettings.connect(`changed::${key}`, () => {
                this._loadSettings();
                if (structural.has(key))
                    this._scheduleReload();
            });
            this._signalIds.push(id);
        }
    }

    _disconnectHandlers() {
        for (const id of this._signalIds) {
            try { this._gsettings.disconnect(id); } catch (e) {}
        }
        this._signalIds = [];
    }

    _scheduleReload() {
        if (this._reloadId) {
            try { GLib.source_remove(this._reloadId); } catch (e) {}
        }
        const gsettings = this._gsettings;
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._reloadId = 0;
            this.disable();
            this.enable(gsettings);
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── aplicado / desaplicado del overlay ────────────────────────────

    _attach() {
        const qs = Main.panel.statusArea.quickSettings;
        const menu = qs?.menu;
        if (!menu || !menu._overlay || !menu._boxPointer) {
            log(`${LOG_PREFIX} quick settings sin overlay/_boxPointer; se omite`);
            return;
        }
        const grid = menu._grid;
        if (!grid?.layout_manager?._overlay) {
            log(`${LOG_PREFIX} grid del menú sin placeholder; se omite`);
            return;
        }

        // Manejadores de offset Y/X anclados al box pointer del menú.
        this._yconstraint = new Clutter.BindConstraint({
            coordinate: Clutter.BindCoordinate.Y,
            source: menu._boxPointer,
        });
        this._xconstraint = new Clutter.BindConstraint({
            coordinate: Clutter.BindCoordinate.X,
            source: menu._boxPointer,
        });

        // Desactivar la sincronización nativa del overlay (posiciona el menú
        // sobre el grid) y fijarlo con nuestros constraints.
        try { menu._overlay.get_constraints()[0].enabled = false; } catch (e) {}
        menu._overlay.add_constraint(this._yconstraint);
        menu._overlay.add_constraint(this._xconstraint);

        // Desactivar la sincronización de altura del placeholder del grid
        // (el grid ya no engorda con el menú).
        try {
            grid.layout_manager._overlay.get_constraints()[0].enabled = false;
        } catch (e) {}

        const tracker = new QuickSettingsMenuTracker();
        tracker.onMenuCreated = this._onMenuCreated.bind(this);
        tracker.onMenuOpen = this._onOpen.bind(this);
        tracker.load();
        this._tracker = tracker;
    }

    _detach() {
        const tracker = this._tracker;
        this._tracker = null;
        if (!tracker)
            return;

        for (const menu of tracker.menus) {
            try {
                menu.actor.x_expand = true;
                menu.actor.get_constraints()[0].enabled = true;
            } catch (e) {}
        }
        tracker.unload();

        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (menu) {
            try {
                menu._overlay.get_constraints()[0].enabled = true;
            } catch (e) {}
            const gridLayoutOverlay = menu._grid?.layout_manager?._overlay;
            try {
                if (gridLayoutOverlay)
                    gridLayoutOverlay.get_constraints()[0].enabled = true;
            } catch (e) {}
            if (this._yconstraint) {
                try { menu._overlay.remove_constraint(this._yconstraint); } catch (e) {}
            }
            if (this._xconstraint) {
                try { menu._overlay.remove_constraint(this._xconstraint); } catch (e) {}
            }
        }
        this._yconstraint = null;
        this._xconstraint = null;
    }

    // ── coordenadas del overlay (port QST getCoords) ─────────────────

    _getCoords(menu) {
        menu.actor.height = -1;
        const [outerHeight] = menu.actor.get_preferred_height(-1);
        const targetWidth =
            menu.actor.width - menu.box.marginLeft - menu.box.marginRight;
        const targetHeight = outerHeight - menu.box.marginTop;

        // El marco de referencia es el menú PRINCIPAL de quick settings
        // (Global.QuickSettingsBox/Grid de QST), no el menú del toggle.
        // Un QuickToggleMenu no tiene `_grid` (undefined → TypeError) y su box
        // es la popup del toggle, no el contenedor del panel.
        const qs = Main.panel.statusArea.quickSettings;
        const qsBox = qs.menu.box;
        const grid = qs.menu._grid;

        let offsetY;
        if (qsBox.height < targetHeight && this._overflowAnchor !== 'center') {
            offsetY = this._overflowAnchor === 'top'
                ? 0
                : qsBox.height - targetHeight;
        } else {
            offsetY = Math.floor((qsBox.height - targetHeight) / 2);
        }
        const isSlider = menu.sourceActor instanceof QuickSlider;
        const sourceHeight = Math.floor(menu.sourceActor.height + 0.5);
        const sourceBaseWidth = Math.floor(menu.sourceActor.width + 0.5);
        const sourceWidth = isSlider ? sourceHeight : sourceBaseWidth;
        const sourceBaseX =
            Math.floor(grid.x + menu.sourceActor.x + 0.5);
        const sourceY =
            Math.floor(grid.y + menu.sourceActor.y + 0.5);
        const sourceX = sourceBaseX + (isSlider ? sourceBaseWidth - sourceWidth : 0);
        const offsetX = Math.floor((qsBox.width - targetWidth) / 2);
        return {
            outerHeight,
            targetHeight,
            targetWidth,
            sourceX,
            sourceY,
            sourceHeight,
            sourceWidth,
            offsetY,
            offsetX,
        };
    }

    // ── hooks del tracker ────────────────────────────────────────────

    _onOpen(_maid, menu, isOpen) {
        // Cancelar la animación nativa de apertura/cierre del actor del menú:
        // sin duración personalizada se deja la nativa intacta.
        if (!isOpen || !this._duration)
            menu.actor.set_easing_duration(0);
        else
            menu.actor.remove_all_transitions();
        if (!isOpen)
            return;

        const coords = this._getCoords(menu);
        if (this._xconstraint)
            this._xconstraint.offset = coords.offsetX;
        if (this._yconstraint)
            this._yconstraint.offset = coords.offsetY;

        if (!this._duration)
            return;

        menu.box.opacity = 0;
        menu.box.ease({
            opacity: 255,
            duration: Math.floor(this._duration / 3),
        });

        if (this._animationStyle === 'flyout') {
            menu.box.translation_x = Math.floor(
                coords.sourceX - coords.offsetX + menu.box.marginLeft);
            menu.box.translation_y = Math.floor(
                coords.sourceY - coords.offsetY + menu.box.marginTop);
            menu.box.scale_x = coords.sourceWidth / coords.targetWidth;
            menu.box.scale_y = coords.sourceHeight / coords.targetHeight;
            AdvAni.ease(menu.box, {
                translation_x: 0,
                translation_y: 0,
                scale_x: 1,
                scale_y: 1,
                mode: AdvAni.AdvAnimationMode.LowBackover,
                duration: this._duration,
            });
        } else if (this._animationStyle === 'dialog') {
            menu.box.translation_x = 0.2 * coords.targetWidth * .5;
            menu.box.translation_y = 0.2 * coords.targetHeight * .5;
            menu.box.scale_x = 0.8;
            menu.box.scale_y = 0.8;
            AdvAni.ease(menu.box, {
                translation_x: 0,
                translation_y: 0,
                scale_x: 1,
                scale_y: 1,
                mode: AdvAni.AdvAnimationMode.MiddleBackover,
                duration: this._duration,
            });
        }
    }

    _onMenuCreated(maid, menu) {
        // La sincronización de posición de ESTE menú la hacen nuestros
        // constraints del overlay.
        try { menu.actor.get_constraints()[0].enabled = false; } catch (e) {}
        if (this._width) {
            menu.actor.width = this._width;
            menu.actor.x_expand = false;
            menu.actor.x_align = Clutter.ActorAlign.CENTER;
        }
        // Al cambiar la altura del menú (contenido), re-anclar los offsets.
        maid.connectJob(menu.box, 'notify::height', () => {
            if (!menu.isOpen)
                return;
            const coords = this._getCoords(menu);
            if (this._yconstraint)
                this._yconstraint.offset = coords.offsetY;
            if (this._xconstraint)
                this._xconstraint.offset = coords.offsetX;
        });
    }
}