'use strict';

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
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();

        if (!this._enabled) return;

        this._tracker = new QuickSettingsToggleTracker();
        this._tracker.onToggleCreated = (maid, toggle) => this._onToggleCreated(maid, toggle);
        this._tracker.onUpdate = () => this._onUpdate();
        this._tracker.load();

        this._registerOrderHandler();
    }

    _registerOrderHandler() {
        this._maid.connectJob(this._gsettings, 'changed::qst-toggles-order', () => {
            this._onOrderChanged();
        });
    }

    _onOrderChanged() {
        this._maid.clear();
        this._tracker?.unload();
        this._loadSettings();
        if (this._enabled) {
            this._tracker = new QuickSettingsToggleTracker();
            this._tracker.onToggleCreated = (maid, toggle) => this._onToggleCreated(maid, toggle);
            this._tracker.onUpdate = () => this._onUpdate();
            this._tracker.load();
        }
        this._registerOrderHandler();
    }

    disable() {
        if (this._tracker) {
            this._tracker.unload();
            this._tracker = null;
        }
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
            this._order = [];
        }
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
