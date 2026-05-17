'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {
    QuickToggle,
    QuickMenuToggle,
    SystemIndicator,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';
import { QuickSettingsToggleTracker } from '../../utils/childrenTracker.js';
import * as ToggleOrderItem from './toggleOrderItem.js';

const CUSTOM_KB_SLOTS = 10;

// ── Module-level state ───────────────────────────────────────────────
const _toggleState = {}; // { 'custom-N': boolean }
let _debug = false;

// ── GObject classes (registered once) ────────────────────────────────
const LidSolQuickToggle = GObject.registerClass({
    GTypeName: 'LidSolQuickToggle',
}, class LidSolQuickToggle extends QuickToggle {
    constructor(title, icon) {
        super({
            title: title || '',
            iconName: icon || 'preferences-other-symbolic',
            toggleMode: true,
        });
    }
});

const LidSolToggleIndicator = GObject.registerClass({
    GTypeName: 'LidSolToggleIndicator',
}, class LidSolToggleIndicator extends SystemIndicator {
    constructor(config) {
        super();

        this._config = config;
        this._stateId = config._id || config.friendlyName || Math.random().toString();
        this._checkIntervalId = 0;
        this._commandTimeoutIds = [];

        this._indicator = this._addIndicator();
        this._indicator.iconName = config.icon || 'preferences-other-symbolic';

        this.toggle = new LidSolQuickToggle(config.friendlyName, config.icon);
        this.quickSettingsItems.push(this.toggle);

        this.toggle.bind_property('checked', this._indicator, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        // ── Initial state: 0=On, 1=Off, 2=Previous, 3=Command output ──
        const initState = config.initialState ?? 2;
        if (initState === 0) {
            this.toggle.checked = true;
        } else if (initState === 1) {
            this.toggle.checked = false;
        } else if (initState === 2) {
            const gs = config._gsettings;
            const slot = config._kbSlot;
            if (gs != null && slot !== undefined) {
                try {
                    const saved = gs.get_boolean(`qst-custom-state-${slot}`);
                    this.toggle.checked = saved;
                } catch (_) {}
            }
        }
        // initState 3 is handled in _setupCheckSync (delayed check)
        _toggleState[this._stateId] = this.toggle.checked;

        if (!config.showIndicator)
            this._indicator.visible = false;

        // ── Toggle click handler ────────────────────────────────
        this._toggleSignalId = this.toggle.connect('notify::checked', () => {
            this._onToggleClicked();
        });

        // ── Check command / sync ────────────────────────────────
        if (config.checkCommand?.trim()) {
            this._setupCheckSync();
        }

        // ── Run command at boot (after all setup) ───────────────
        if (config.runAtBoot) {
            const delay = Math.max(0, config.delayTime ?? 3);
            const bootCmd = this.toggle.checked ? config.commandOn : config.commandOff;
            if (bootCmd?.trim()) {
                const timeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT, delay, () => {
                        executeCommand(bootCmd, `boot-${config.friendlyName}`);
                        return GLib.SOURCE_REMOVE;
                    });
                this._commandTimeoutIds.push(timeoutId);
            }
        }
    }

    _onToggleClicked() {
        const cfg = this._config;
        const checked = this.toggle.checked;

        _toggleState[this._stateId] = checked;

        // Persist state to GSettings for cross-session "Previous state"
        const gs = cfg._gsettings;
        const slot = cfg._kbSlot;
        const persistState = (val) => {
            if (gs != null && slot !== undefined) {
                try { gs.set_boolean(`qst-custom-state-${slot}`, val); } catch (_) {}
            }
        };
        persistState(checked);

        if (cfg.closeMenu)
            Main.panel.closeQuickSettings();

        const cmd = checked ? cfg.commandOn : cfg.commandOff;
        const clickAction = cfg.buttonClick ?? 2;

        // Always-on / Always-off
        if (clickAction === 0) {
            this.toggle.checked = true;
            _toggleState[this._stateId] = true;
            persistState(true);
            executeCommand(cfg.commandOn, 'custom-on(always-on)');
            return;
        }
        if (clickAction === 1) {
            this.toggle.checked = false;
            _toggleState[this._stateId] = false;
            persistState(false);
            executeCommand(cfg.commandOff, 'custom-off(always-off)');
            return;
        }

        // Toggle mode with optional exit code check
        if (cfg.checkExitCode && cmd?.trim()) {
            checkExitCode(cmd, (ok) => {
                if (!ok) {
                    GObject.signal_handler_block(this.toggle, this._toggleSignalId);
                    this.toggle.checked = !checked;
                    _toggleState[this._stateId] = !checked;
                    persistState(!checked);
                    GObject.signal_handler_unblock(this.toggle, this._toggleSignalId);
                } else {
                    executeCommand(cmd, `custom-${checked ? 'on' : 'off'}`);
                }
            });
        } else {
            executeCommand(cmd, `custom-${checked ? 'on' : 'off'}`);
        }
    }

    _setupCheckSync() {
        const cfg = this._config;
        let isRunning = false;

        const runCheck = () => {
            if (isRunning) return;
            isRunning = true;

            readCommandOutput(cfg.checkCommand, (output) => {
                isRunning = false;
                const regex = cfg.checkRegex || '';
                let match = false;

                if (regex.trim()) {
                    match = outputMatches(output, regex);
                } else {
                    match = output.trim() !== '';
                }

                if (_toggleState[this._stateId] !== match) {
                    _toggleState[this._stateId] = match;
                    this.toggle.checked = match;
                }
            });
        };

        // Periodic polling
        if (cfg.commandSync) {
            const interval = Math.max(2, cfg.pollInterval ?? 10);
            this._checkIntervalId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, interval, () => {
                    runCheck();
                    return GLib.SOURCE_CONTINUE;
                });
        }

        // Initial check at startup (state option 3)
        if (cfg.initialState === 3) {
            const delay = Math.max(0, cfg.delayTime ?? 3);
            const timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, delay, () => {
                    runCheck();
                    return GLib.SOURCE_REMOVE;
                });
            this._commandTimeoutIds.push(timeoutId);
        }
    }

    destroy() {
        if (this._checkIntervalId) {
            try { GLib.source_remove(this._checkIntervalId); } catch (_) {}
            this._checkIntervalId = 0;
        }
        for (const id of this._commandTimeoutIds) {
            try { GLib.source_remove(id); } catch (_) {}
        }
        this._commandTimeoutIds = [];
        super.destroy();
    }
});

// ── Command helpers ──────────────────────────────────────────────────
function executeCommand(cmd, logPrefix) {
    if (!cmd?.trim()) return;
    try {
        GLib.spawn_async(null,
            ['/usr/bin/env', 'bash', '-c', cmd],
            null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (e) {
        if (_debug) log('[LIDSoL QST] ' + logPrefix + ' spawn error:', e);
    }
}

function checkExitCode(cmd, callback) {
    if (!cmd?.trim()) { callback(false); return; }
    try {
        const [success, pid] = GLib.spawn_async(null,
            ['/usr/bin/env', 'bash', '-c', cmd],
            null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD
                | GLib.SpawnFlags.STDOUT_TO_DEV_NULL,
            null);
        if (!success) { callback(false); return; }
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (_pid, status) => {
            try {
                callback(GLib.spawn_check_exit_status(status));
            } catch (e) {
                callback(false);
            }
        });
    } catch (e) {
        if (_debug) log('[LIDSoL QST] checkExitCode error:', e);
        callback(false);
    }
}

function readCommandOutput(cmd, callback) {
    if (!cmd?.trim()) { callback(''); return; }
    try {
        const [success, pid, stdinFd, stdoutFd, stderrFd] = GLib.spawn_async_with_pipes(
            null,
            ['/usr/bin/env', 'bash', '-c', cmd],
            null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null);

        try { if (stdinFd >= 0) GLib.close(stdinFd); } catch (_) {}
        try { if (stderrFd >= 0) GLib.close(stderrFd); } catch (_) {}

        if (!success) { callback(''); return; }

        const baseStream = new Gio.UnixInputStream({ fd: stdoutFd, close_fd: true });
        const dataStream = new Gio.DataInputStream({ base_stream: baseStream });

        let didFinish = false;
        let chunks = [];

        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            if (!didFinish) {
                didFinish = true;
                try { dataStream.close(null); } catch (_) {}
                try { baseStream.close(null); } catch (_) {}
                callback('');
            }
            return GLib.SOURCE_REMOVE;
        });

        function finish(output) {
            if (didFinish) return;
            didFinish = true;
            try { GLib.source_remove(timeoutId); } catch (_) {}
            try { dataStream.close(null); } catch (_) {}
            try { baseStream.close(null); } catch (_) {}
            callback(output);
        }

        function readNext() {
            dataStream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null,
                (stream, res) => {
                    try {
                        const bytes = stream.read_bytes_finish(res);
                        if (!bytes || bytes.get_size() === 0) {
                            const output = new TextDecoder().decode(
                                new Uint8Array(chunks.flat())).trim();
                            finish(output);
                            return;
                        }
                        chunks.push([...bytes.get_data()]);
                        readNext();
                    } catch (e) {
                        finish('');
                    }
                });
        }

        readNext();
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (_p, _s) => {
            try { GLib.spawn_close_pid(pid); } catch (_) {}
        });
    } catch (e) {
        if (_debug) log('[LIDSoL QST] readCommandOutput error:', e);
        callback('');
    }
}

function outputMatches(output, searchTerm) {
    if (!searchTerm?.trim()) return false;
    const cleaned = output.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ').trim();
    const cleanedSearch = searchTerm.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ').trim();
    if (!cleanedSearch) return false;
    if (!cleanedSearch.includes(' ')) {
        return new RegExp(`\\b${cleanedSearch}\\b`, 'i').test(cleaned);
    }
    return cleaned.includes(cleanedSearch);
}

// ── QuickTogglesFeature ─────────────────────────────────────────────
export class QuickTogglesFeature {
    constructor() {
        this._tracker = null;
        this._maid = new Maid();
        this._enabled = false;
        this._order = [];
        this._unordered = null;
        this._gsettings = null;
        this._signalId = 0;
        this._customToggles = []; // { item, indicator, toggle, maid }
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        _debug = this._gsettings.get_boolean('debug') || false;
        this._loadSettings();
        if (!this._enabled) return;
        this._startTracker();
        this._createCustomToggles();
        log('[LIDSoL QST] enable() complete: ' + this._customToggles.length + ' custom toggles created');
    }

    // ── Setting listener management ────────────────────────────
    _connectOrderHandler() {
        if (this._signalId && this._gsettings) {
            this._gsettings.disconnect(this._signalId);
            this._signalId = 0;
        }
        this._signalId = this._gsettings.connect('changed::qst-toggles-order', () => {
            try {
                this._onOrderChanged();
            } catch (e) {
                console.error('[LIDSoL QST] Error in order handler:', e);
            }
        });
    }

    _disconnectOrderHandler() {
        if (this._signalId && this._gsettings) {
            this._gsettings.disconnect(this._signalId);
            this._signalId = 0;
        }
    }

    // ── Tracker lifecycle ──────────────────────────────────────
    _startTracker() {
        const grid = Main.panel.statusArea.quickSettings?.menu?._grid;
        log(`[LIDSoL QST] _startTracker() grid=${!!grid}`);
        this._tracker = new QuickSettingsToggleTracker();
        this._tracker.onToggleCreated = (maid, toggle) => this._onToggleCreated(maid, toggle);
        this._tracker.onUpdate = () => this._onUpdate();
        this._tracker.load();
    }

    _stopTracker() {
        if (this._tracker) {
            this._tracker.unload();
            this._tracker = null;
        }
    }

    // ── Custom toggle management ───────────────────────────────
    _destroyCustomToggles() {
        for (const ct of this._customToggles) {
            try {
                const slotKey = `qst-custom-kb-${ct.kbSlot}`;
                if (ct.kbRegistered)
                    Main.wm.removeKeybinding(slotKey);
                this._gsettings?.set_strv(slotKey, ['']);
                if (ct.maid) ct.maid.destroy();
                if (ct.indicator) {
                    ct.indicator.quickSettingsItems.forEach(item => {
                        try { item.destroy(); } catch (_) {}
                    });
                    try { ct.indicator.destroy(); } catch (_) {}
                }
            } catch (e) {
                console.error('[LIDSoL QST] Error destroying custom toggle:', e);
            }
        }
        this._customToggles = [];
    }

    _createCustomToggles() {
        let count = 0;
        for (const item of this._order) {
            if (item.isSystem || item.nonOrdered) continue;
            if (item.hide) continue;
            if (!item.commandOn?.trim() && !item.commandOff?.trim()) continue;

            try {
                this._createOneCustomToggle(item);
                count++;
            } catch (e) {
                console.error('[LIDSoL QST] Error creating custom toggle:', e);
            }
        }
        log(`[LIDSoL QST] _createCustomToggles() created ${count} custom toggles`);
    }

    _createOneCustomToggle(item) {
        const maid = new Maid();
        const kbSlot = this._customToggles.length;
        item._gsettings = this._gsettings;
        item._kbSlot = kbSlot;
        const indicator = new LidSolToggleIndicator(item);
        const toggle = indicator.toggle;

        // Connect toggle to maid for lifecycle management
        maid.connectJob(toggle, 'destroy', () => {
            maid.destroy();
        });

        log(`[LIDSoL QST] Custom toggle: "${item.friendlyName}" icon="${item.icon || '(empty)'}" showIndicator=${item.showIndicator}`);

        // ── Keybinding via Main.wm.addKeybinding (GSettings slots) ─
        let kbRegistered = false;

        if (item.keybinding?.trim()) {
            const slotKey = `qst-custom-kb-${kbSlot}`;
            this._gsettings.set_strv(slotKey, [item.keybinding]);
            Main.wm.addKeybinding(
                slotKey,
                this._gsettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.ALL,
                () => { toggle.checked = !toggle.checked; },
            );
            kbRegistered = true;
            log(`[LIDSoL QST] KB registered: "${item.keybinding}" on ${slotKey} for "${item.friendlyName}"`);
        } else {
            this._gsettings.set_strv(`qst-custom-kb-${kbSlot}`, ['']);
        }

        // Register in Quick Settings
        Main.panel.statusArea.quickSettings.addExternalIndicator(indicator);

        this._customToggles.push({ item, indicator, toggle, maid, kbSlot, kbRegistered });
    }

    // ── Reload ─────────────────────────────────────────────────
    _reload() {
        log('[LIDSoL QST] _reload() started');
        this._stopTracker();
        this._destroyCustomToggles();
        this._maid.clear();
        if (this._enabled) {
            this._startTracker();
            this._createCustomToggles();
        }
        log('[LIDSoL QST] _reload() complete');
    }

    // ── Called when qst-toggles-order changes ──────────────────
    _onOrderChanged() {
        log('[LIDSoL QST] _onOrderChanged() triggered');
        this._disconnectOrderHandler();
        this._loadSettings();
        this._reload();
        log('[LIDSoL QST] _onOrderChanged() complete');
    }

    // ── Lifecycle ──────────────────────────────────────────────
    disable() {
        this._disconnectOrderHandler();
        this._stopTracker();
        this._destroyCustomToggles();
        this._maid.clear();
        this._order = [];
        this._unordered = null;
        this._gsettings = null;
    }

    _loadSettings() {
        this._enabled = this._gsettings.get_boolean('qst-toggles-enabled');

        try {
            this._order = this._gsettings.get_value('qst-toggles-order').recursiveUnpack();
        } catch (e) {
            log('[LIDSoL QST] _loadSettings() failed to parse order:', e);
            this._order = [];
        }
        this._connectOrderHandler();

        this._unordered = null;
        let sysCount = 0, custCount = 0;
        for (const item of this._order) {
            if (item.titleRegex)
                item.cachedTitleRegex = new RegExp(item.titleRegex);
            if (item.nonOrdered)
                this._unordered = item;
            else if (item.isSystem)
                sysCount++;
            else
                custCount++;
        }
        log(`[LIDSoL QST] _loadSettings() done: enabled=${this._enabled}, system=${sysCount}, custom=${custCount}, nonOrdered=${!!this._unordered}`);
    }

    _onToggleCreated(maid, toggle) {
        const rule = this._order.find(item => ToggleOrderItem.toggleMatch(item, toggle))
            || this._unordered;
        const matched = rule ? (rule.constructorName || rule.friendlyName || 'nonOrdered') : 'none';
        const willHide = rule?.hide ? ' (HIDING)' : ' (visible)';
        log(`[LIDSoL QST] _onToggleCreated: toggle=${toggle.constructor?.name || '?'} matched=${matched}${willHide}`);
        if (rule?.hide)
            maid.hideJob(toggle);
    }

    _onUpdate() {
        const grid = Main.panel.statusArea.quickSettings?.menu?._grid;
        if (!grid) {
            log('[LIDSoL QST] _onUpdate() grid not found');
            return;
        }

        const children = grid.get_children();
        const middle = children.filter(child =>
            (child instanceof QuickMenuToggle || child instanceof QuickToggle)
            && child.constructor.name !== 'BackgroundAppsToggle'
        );

        const head = [];
        const tail = [];
        let overNonOrdered = false;

        for (const item of this._order) {
            if (item.nonOrdered) {
                overNonOrdered = true;
                continue;
            }

            let found = null;

            if (item.isSystem) {
                const idx = middle.findIndex(t => ToggleOrderItem.toggleMatch(item, t));
                if (idx !== -1) {
                    found = middle[idx];
                    middle.splice(idx, 1);
                }
            } else {
                const ct = this._customToggles.find(c => c.item === item);
                if (ct) {
                    found = ct.toggle;
                    const mi = middle.indexOf(ct.toggle);
                    if (mi !== -1) middle.splice(mi, 1);
                }
            }

            if (found)
                (overNonOrdered ? tail : head).push(found);
        }

        let last = null;
        for (const item of [...head, ...middle, ...tail]) {
            if (last) grid.set_child_above_sibling(item, last);
            last = item;
        }
    }
}
