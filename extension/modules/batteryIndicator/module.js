'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { BatteryIndicatorWidget } from './widget.js';

const SETTINGS_KEYS = [
    'bi-top-bar-style',
    'bi-show-percentage',
    'bi-bar-width',
    'bi-bar-height',
    'bi-bar-radius',
    'bi-color',
    'bi-charging-color',
    'bi-low-color',
    'bi-bg-color',
    'bi-low-threshold',
];

export class BatteryIndicatorModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._systemIndicator = null;
        this._proxy = null;
        this._proxySignalId = 0;
        this._widget = null;
        this._nativeIcon = null;
        this._nativeLabel = null;
        this._patched = false;
        this._settingsIds = [];
        this._stylesheetFile = null;
        this._pendingSetupId = 0;
        this._originalMethod = null;
        this._methodName = null;
    }

    enable(settings, extension) {
        this._settings = settings;
        this._extension = extension;

        this._loadStylesheet();

        this._settingsIds = SETTINGS_KEYS.map(key =>
            this._settings.connect(`changed::${key}`, () => {
                const gs = this._settings;
                const ext = this._extension;
                this.disable();
                this.enable(gs, ext);
            })
        );

        this._scheduleSetup();
    }

    disable() {
        for (const id of this._settingsIds) {
            if (this._settings) this._settings.disconnect(id);
        }
        this._settingsIds = [];

        if (this._pendingSetupId) {
            try { GLib.Source.remove(this._pendingSetupId); } catch (e) {}
            this._pendingSetupId = 0;
        }

        this._restoreMethod();
        this._unpatch();

        if (this._stylesheetFile) {
            const tc = St.ThemeContext.get_for_stage(global.stage);
            tc.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }

        this._systemIndicator = null;
        this._proxy = null;
        this._proxySignalId = 0;
        this._widget = null;
        this._nativeIcon = null;
        this._nativeLabel = null;
        this._extension = null;
        this._settings = null;
    }

    // ── Setup (wait for QuickSettings._system) ─────────────────────
    _scheduleSetup() {
        const qs = Main.panel.statusArea.quickSettings;
        if (qs && '_system' in qs && qs._system) {
            this._setup(qs._system);
            return;
        }

        this._pendingSetupId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._pendingSetupId = 0;
            const qsNow = Main.panel.statusArea.quickSettings;
            if (qsNow && '_system' in qsNow && qsNow._system)
                this._setup(qsNow._system);
            else
                this._injectSetupHook();
            return GLib.SOURCE_REMOVE;
        });
    }

    _injectSetupHook() {
        const qs = Main.panel.statusArea.quickSettings;
        if (!qs) return;

        const methodName = '_addItems' in qs ? '_addItems' : '_addItemsBefore';
        if (this._originalMethod || typeof qs[methodName] !== 'function') return;

        const self = this;
        const original = qs[methodName].bind(qs);
        this._originalMethod = original;
        this._methodName = methodName;

        const wrapped = (...args) => {
            const qsNow = Main.panel.statusArea.quickSettings;
            if (qsNow && '_system' in qsNow && qsNow._system) {
                self._restoreMethod();
                self._setup(qsNow._system);
            }
            return original(...args);
        };
        qs[methodName] = wrapped;
    }

    _restoreMethod() {
        if (!this._originalMethod) return;
        const qs = Main.panel.statusArea.quickSettings;
        if (qs && this._methodName && qs[this._methodName] !== this._originalMethod)
            qs[this._methodName] = this._originalMethod;
        this._originalMethod = null;
        this._methodName = null;
    }

    _setup(systemIndicator) {
        this._systemIndicator = systemIndicator;

        // Reuse the UPower proxy GNOME already uses for the battery.
        const powerToggle = systemIndicator?._systemItem?.powerToggle;
        this._proxy = powerToggle?._proxy ?? null;

        if (this._proxy && !this._proxySignalId) {
            this._proxySignalId = this._proxy.connect('g-properties-changed',
                () => this._sync());
        }

        this._sync();
    }

    // ── Patch: replace the native battery icon in-place ────────────
    _patch() {
        if (this._patched)
            return;
        this._patched = true;

        const sysIndicator = this._systemIndicator;

        this._nativeIcon = sysIndicator._indicator ?? null;
        this._nativeLabel = sysIndicator._percentageLabel ?? null;

        if (this._nativeIcon) {
            this._widget = new BatteryIndicatorWidget(this._settings);
            sysIndicator.replace_child(this._nativeIcon, this._widget);
        }

        // Our widget renders its own percentage; hide the native label
        // to avoid duplication.
        if (this._nativeLabel)
            this._nativeLabel.hide();

        this._sync();
    }

    _unpatch() {
        if (!this._patched)
            return;
        this._patched = false;

        const sysIndicator = this._systemIndicator;

        if (sysIndicator && this._widget && this._nativeIcon) {
            try {
                sysIndicator.replace_child(this._widget, this._nativeIcon);
            } catch (e) {}
        }

        if (this._widget) {
            try { this._widget.destroy(); } catch (e) {}
        }
        this._widget = null;
        this._nativeIcon = null;

        if (this._nativeLabel) {
            this._nativeLabel.show();
            this._nativeLabel = null;
        }

        if (sysIndicator && typeof sysIndicator._sync === 'function')
            sysIndicator._sync();
    }

    // ── Sync ────────────────────────────────────────────────────────
    _sync() {
        const proxy = this._proxy;
        if (!proxy)
            return;

        if (proxy.IsPresent === undefined)
            return;

        const present = proxy.IsPresent === true;

        if (present && !this._patched)
            this._patch();

        if (!present && this._patched)
            this._unpatch();

        if (!this._patched)
            return;

        if (this._widget)
            this._widget.sync(proxy);
    }

    _loadStylesheet() {
        if (!this._extension) return;
        const tc = St.ThemeContext.get_for_stage(global.stage);
        const file = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/batteryIndicator/stylesheet.css'
        );
        tc.get_theme().load_stylesheet(file);
        this._stylesheetFile = file;
    }
}