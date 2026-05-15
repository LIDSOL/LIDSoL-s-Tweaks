'use strict';

log('[LIDSoL QST FILE] quickToggles.js loaded - START');

import {
    QuickToggle,
    QuickMenuToggle,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GObject from 'gi://GObject';
import Maid from '../../core/maid.js';
import { QuickSettingsToggleTracker } from '../../utils/childrenTracker.js';
import * as ToggleOrderItem from './toggleOrderItem.js';

export class QuickTogglesFeature {
    constructor() {
        this._tracker = null;
        this._maid = new Maid();
        this._enabled = false;
        this._order = [];
        this._unordered = null;
        this._gsettings = null;
        // Signal handler ID for the only setting we watch
        this._signalId = 0;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();

        if (!this._enabled) return;

        this._startTracker();
    }

    // ── Setting listener management (single key) ──────────────
    _connectOrderHandler() {
        log(`[LIDSoL QST] _connectOrderHandler() signalId=${this._signalId}`);
        this._signalId = this._gsettings.connect('changed::qst-toggles-order', () => {
            log('[LIDSoL QST] changed::qst-toggles-order FIRED');
            try {
                this._onOrderChanged();
            } catch (e) {
                console.error('[LIDSoL QST] Error in handler:', e);
            }
        });
    }

    _disconnectOrderHandler() {
        if (this._signalId && this._gsettings) {
            this._gsettings.disconnect(this._signalId);
            this._signalId = 0;
        }
    }

    // ── Tracker lifecycle ─────────────────────────────────────
    _startTracker() {
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

    // ── Reload (mirrors FeatureBase.reload from reference) ────
    _reload() {
        this._stopTracker();
        this._maid.clear();
        if (this._enabled)
            this._startTracker();
    }

    // ── Called when qst-toggles-order changes ─────────────────
    _onOrderChanged() {
        log('[LIDSoL QST] _onOrderChanged()');
        // 1. Disconnect old handler (we're inside it, but that's fine in GJS)
        this._disconnectOrderHandler();

        // 2. Re-read settings — also re-connects the handler
        this._loadSettings();

        // 3. Full reload (stop tracker → maid.clear → start tracker)
        this._reload();
        log('[LIDSoL QST] _onOrderChanged() DONE, new signalId=' + this._signalId);
    }

    disable() {
        this._disconnectOrderHandler();
        this._stopTracker();
        this._maid.clear();
        this._order = [];
        this._unordered = null;
        this._gsettings = null;
    }

    _loadSettings() {
        log('[LIDSoL QST] _loadSettings()');
        // Re-read enabled state
        this._enabled = this._gsettings.get_boolean('qst-toggles-enabled');

        // Re-read order — this is where we ALSO re-connect the handler,
        // mirroring SettingLoader.push() from the reference
        try {
            this._order = this._gsettings.get_value('qst-toggles-order').recursiveUnpack();
            log('[LIDSoL QST] _loadSettings() order has ' + this._order.length + ' items');
        } catch (e) {
            log('[LIDSoL QST] _loadSettings() failed to parse order:', e);
            this._order = [];
        }
        this._connectOrderHandler();

        this._unordered = null;
        for (const item of this._order) {
            if (item.titleRegex)
                item.cachedTitleRegex = new RegExp(item.titleRegex);
            if (item.nonOrdered)
                this._unordered = item;
        }
    }

    _onToggleCreated(maid, toggle) {
        const rule = this._order.find(item => ToggleOrderItem.toggleMatch(item, toggle))
            || this._unordered;
        log(`[LIDSoL QST] Toggle created: ${toggle.constructor.name}, hide=${!!rule?.hide}`);
        if (rule?.hide)
            maid.hideJob(toggle);
    }

    _onUpdate() {
        const grid = Main.panel.statusArea.quickSettings?.menu?._grid;
        if (!grid) return;

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
            const idx = middle.findIndex(t => ToggleOrderItem.toggleMatch(item, t));
            if (idx === -1) continue;
            const toggle = middle[idx];
            middle.splice(idx, 1);
            (overNonOrdered ? tail : head).push(toggle);
        }

        let last = null;
        for (const item of [...head, ...middle, ...tail]) {
            if (last) grid.set_child_above_sibling(item, last);
            last = item;
        }
    }
}
