'use strict';

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';

const SYSTEM_ITEM_KEYS = [
    'qst-system-items-enabled',
    'qst-system-items-hide',
    'qst-system-items-hide-screenshot',
    'qst-system-items-hide-settings',
    'qst-system-items-hide-lock',
    'qst-system-items-hide-shutdown',
    'qst-system-items-hide-battery',
    'qst-system-items-order',
];

export class SystemItemsFeature {
    constructor() {
        this._maid = new Maid();
        this._gsettings = null;
        this._signalIds = [];
        this._enabled = false;
        this._pending = null;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();
        if (!this._enabled) return;
        this._scheduleApply();
    }

    disable() {
        this._cancelPending();
        this._disconnectHandlers();
        this._maid.clear();
        this._gsettings = null;
    }

    _cancelPending() {
        if (this._pending) {
            try { GLib.Source.remove(this._pending); } catch (_) {}
            this._pending = null;
        }
    }

    _loadSettings() {
        const s = this._gsettings;
        if (!s) return;
        this._enabled = s.get_boolean('qst-system-items-enabled');
        this._hideLayout = s.get_boolean('qst-system-items-hide');
        this._hideScreenshot = s.get_boolean('qst-system-items-hide-screenshot');
        this._hideSettings = s.get_boolean('qst-system-items-hide-settings');
        this._hideLock = s.get_boolean('qst-system-items-hide-lock');
        this._hideShutdown = s.get_boolean('qst-system-items-hide-shutdown');
        this._hideBattery = s.get_boolean('qst-system-items-hide-battery');
        this._order = s.get_strv('qst-system-items-order');
        this._connectHandlers();
    }

    _connectHandlers() {
        this._disconnectHandlers();
        for (const key of SYSTEM_ITEM_KEYS) {
            const id = this._gsettings.connect(`changed::${key}`, () => {
                this._loadSettings();
                this._scheduleApply();
            });
            this._signalIds.push(id);
        }
    }

    _disconnectHandlers() {
        if (!this._gsettings) {
            this._signalIds = [];
            return;
        }
        for (const id of this._signalIds) {
            try { this._gsettings.disconnect(id); } catch (_) {}
        }
        this._signalIds = [];
    }

    _getSystemItem() {
        return new Promise((resolve) => {
            const qs = Main.panel.statusArea.quickSettings;
            const system = qs && qs._system;
            const systemItem = system && system._systemItem;
            if (systemItem) {
                resolve(systemItem);
                return;
            }
            const idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                try {
                    const qs2 = Main.panel.statusArea.quickSettings;
                    const sys2 = qs2 && qs2._system;
                    const item2 = sys2 && sys2._systemItem;
                    if (!item2) return GLib.SOURCE_CONTINUE;
                    resolve(item2);
                    return GLib.SOURCE_REMOVE;
                } catch (e) {
                    console.warn('[LIDSoL QST] Waiting for system item...', e);
                    return GLib.SOURCE_CONTINUE;
                }
            });
            this._pending = idleId;
        }).finally(() => { this._pending = null; });
    }

    _scheduleApply() {
        this._cancelPending();
        this._maid.clear();
        if (!this._enabled) return;

        this._getSystemItem().then(systemItem => {
            const children = systemItem.child.get_children();

            let screenshot, settings, lock, shutdown;
            for (const child of children) {
                const name = child.constructor.name;
                if (name === 'ScreenshotItem') screenshot = child;
                else if (name === 'SettingsItem') settings = child;
                else if (name === 'LockItem') lock = child;
                else if (name === 'ShutdownItem') shutdown = child;
            }

            const items = {
                screenshot,
                settings,
                lock,
                shutdown,
                battery: systemItem.powerToggle,
                laptopSpacer: systemItem._laptopSpacer,
                desktopSpacer: systemItem._desktopSpacer,
                box: systemItem,
            };

            if (this._hideLayout) {
                if (items.box)
                    this._maid.hideJob(items.box, () => true);
                return;
            }

            if (this._hideBattery && items.battery)
                this._maid.hideJob(items.battery, (old, obj) => { obj._sync(); });
            if (this._hideScreenshot && items.screenshot)
                this._maid.hideJob(items.screenshot, () => true);
            if (this._hideLock && items.lock)
                this._maid.hideJob(items.lock, () => true);
            if (this._hideShutdown && items.shutdown)
                this._maid.hideJob(items.shutdown, () => true);
            if (this._hideSettings && items.settings)
                this._maid.hideJob(items.settings, () => true);

            let last = null;
            for (const name of this._order) {
                const current = items[name];
                if (current && last)
                    items.box.child.set_child_above_sibling(current, last);
                if (current)
                    last = current;
            }
        }).catch(e => {
            console.error('[LIDSoL QST] SystemItemsFeature error:', e);
        });
    }
}
