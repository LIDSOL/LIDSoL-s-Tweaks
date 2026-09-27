'use strict';

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    QuickSettingsMenuTracker,
} from '../../utils/childrenTracker.js';

const LOG_PREFIX = '[LIDSoL MenuAnimation]';

// 2.4.2 — Animaciones del menú (port de Quick Settings Tweaks,
// src/features/menuAnimation.ts).
//
// Añade animación al menú de ajustes rápidos al abrir/cerrar un toggle:
//   - blur del boxPointer (Shell.BlurEffect, radio y brillo configurables)
//   - ease del contenedor del menú (`menu.box`): escala X/Y + opacidad
//   - ease del grid (`menu._grid`): opacidad del contenido
// Funciona con o sin overlay; QST recomienda activar ambos para mejor resultado.
// Independiente del overlay (mismas keys del menú, sin tocar constraints).

export class MenuAnimationFeature {
    constructor() {
        this._gsettings = null;
        this._enabled = false;
        this._backgroundBlurRadius = 0;
        this._backgroundBrightness = 1;
        this._backgroundOpacity = 255;
        this._backgroundScaleX = 1;
        this._backgroundScaleY = 1;
        this._gridContentOpacity = 255;
        this._openDuration = 380;
        this._closeDuration = 380;
        this._signalIds = [];
        this._reloadId = 0;
        this._tracker = null;
        this._blur = null;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();

        // Handlers conectados SIEMPRE para permitir ON→OFF→ON en caliente.
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
        this._enabled = s.get_boolean('qst-menu-animation-enabled');
        this._backgroundBlurRadius =
            s.get_int('qst-menu-animation-background-blur-radius');
        this._backgroundBrightness =
            s.get_int('qst-menu-animation-background-brightness') / 1000;
        this._backgroundOpacity =
            s.get_int('qst-menu-animation-background-opacity');
        this._backgroundScaleX =
            s.get_int('qst-menu-animation-background-scale-x') / 1000;
        this._backgroundScaleY =
            s.get_int('qst-menu-animation-background-scale-y') / 1000;
        this._gridContentOpacity =
            s.get_int('qst-menu-animation-grid-content-opacity');
        this._openDuration = s.get_int('qst-menu-animation-open-duration');
        this._closeDuration = s.get_int('qst-menu-animation-close-duration');
    }

    _connectHandlers() {
        const keys = [
            'qst-menu-animation-enabled',
            'qst-menu-animation-background-blur-radius',
            'qst-menu-animation-background-brightness',
            'qst-menu-animation-background-opacity',
            'qst-menu-animation-grid-content-opacity',
            'qst-menu-animation-background-scale-x',
            'qst-menu-animation-background-scale-y',
            'qst-menu-animation-open-duration',
            'qst-menu-animation-close-duration',
        ];
        for (const key of keys) {
            const id = this._gsettings.connect(`changed::${key}`, () => {
                this._loadSettings();
                // Cualquier cambio re-aplica el feature completo (el blur se
                // crea en attach; mismo gating que QST FeatureBase.reload).
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

    _attach() {
        const qs = Main.panel.statusArea.quickSettings;
        const menu = qs?.menu;
        if (!menu || !menu._boxPointer) {
            log(`${LOG_PREFIX} quick settings sin menú/_boxPointer; se omite`);
            return;
        }

        if (this._backgroundBlurRadius) {
            this._blur = new Shell.BlurEffect({
                enabled: false,
                mode: Shell.BlurMode.ACTOR,
                radius: this._backgroundBlurRadius,
                brightness: this._backgroundBrightness,
            });
            menu._boxPointer.add_effect_with_name(
                'lidsol-menu-animation-blur', this._blur);
        }

        const tracker = new QuickSettingsMenuTracker();
        tracker.onMenuOpen = this._onOpen.bind(this);
        tracker.load();
        this._tracker = tracker;
    }

    _detach() {
        const tracker = this._tracker;
        this._tracker = null;
        if (!tracker)
            return;
        tracker.unload();

        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (this._blur && menu) {
            try { menu._boxPointer.remove_effect(this._blur); } catch (e) {}
            this._blur = null;
        }
        if (menu) {
            try {
                menu.box.remove_all_transitions();
                menu.box.scaleX = 1;
                menu.box.scaleY = 1;
                menu.box.opacity = 255;
                menu.box.set_pivot_point(0, 0);
            } catch (e) {}
        }
    }

    _onOpen(_maid, _menu, isOpen) {
        if (this._blur)
            this._blur.enabled = isOpen;

        // El marco de referencia es el menú PRINCIPAL de quick settings
        // (Global.QuickSettingsBox/Grid de QST), no el menú del toggle:
        // se animea el panel completo (al abrir un toggle, el grid detrás
        // escala/desvanece). Un QuickToggleMenu no tiene `_grid` (undefined →
        // TypeError) y su box no es el contenedor del panel.
        const qsMenu = Main.panel.statusArea.quickSettings?.menu;
        const box = qsMenu?.box;
        const grid = qsMenu?._grid;
        if (!box || !grid)
            return;

        if (isOpen) {
            box.set_pivot_point(0.5, 0.5);
            box.ease({
                duration: this._openDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                scaleX: this._backgroundScaleX,
                scaleY: this._backgroundScaleY,
                opacity: this._backgroundOpacity,
            });
            grid.ease({
                duration: this._openDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                opacity: this._gridContentOpacity,
            });
        } else {
            box.ease({
                duration: this._closeDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                scaleX: 1,
                scaleY: 1,
                opacity: 255,
                onComplete: () => {
                    try { box.set_pivot_point(0, 0); } catch (e) {}
                },
            });
            // Mismo comportamiento que QST (usa openDuration para el fade del
            // grid en el cierre); se conserva tal cual para paridad.
            grid.ease({
                duration: this._openDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                opacity: 255,
            });
        }
    }
}