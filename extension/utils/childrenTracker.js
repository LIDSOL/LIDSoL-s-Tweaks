'use strict';

import Maid from '../core/maid.js';
import {
    QuickToggle,
    QuickMenuToggle,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ChildrenTrackerBase {
    constructor() {
        this.appliedChild = null;
        this._addConnection = null;
        this._connectTarget = null;
        this.onUpdate = null;
    }

    getConnectTarget() { return null; }
    catchChild(_child) {}

    load() {
        this._connectTarget = this.getConnectTarget();
        if (!this._connectTarget) return;
        this.appliedChild = new Map();
        this._addConnection = this._connectTarget.connect('child-added', (_o, child) => {
            this.catchChild(child);
            if (this.onUpdate) this.onUpdate();
        });
        for (const child of this._connectTarget.get_children())
            this.catchChild(child);
        if (this.onUpdate) this.onUpdate();
    }

    unload() {
        if (this.appliedChild) {
            for (const maid of this.appliedChild.values())
                maid.destroy();
            this.appliedChild = null;
        }
        if (this._connectTarget && this._addConnection) {
            this._connectTarget.disconnect(this._addConnection);
            this._addConnection = null;
        }
        this._connectTarget = null;
    }
}

export class QuickSettingsToggleTracker extends ChildrenTrackerBase {
    constructor() {
        super();
        this.onToggleCreated = null;
    }

    getConnectTarget() {
        return Main.panel.statusArea.quickSettings?.menu?._grid || null;
    }

    catchChild(child) {
        if (!(child instanceof QuickToggle) && !(child instanceof QuickMenuToggle))
            return;
        if (this.appliedChild.has(child))
            return;

        const toggleMaid = new Maid();
        toggleMaid.functionJob(() => {
            this.appliedChild.delete(child);
        });
        toggleMaid.connectJob(child, 'destroy', () => {
            toggleMaid.destroy();
        });
        if (this.onToggleCreated)
            this.onToggleCreated(toggleMaid, child);
        this.appliedChild.set(child, toggleMaid);
    }
}

export class QuickSettingsMenuTracker {
    constructor() {
        this.onMenuCreated = null;
        this.onMenuOpen = null;
        this.items = [];
        this._tracker = null;
    }

    load() {
        if (this._tracker) return;
        this._tracker = new QuickSettingsToggleTracker();
        this._tracker.onToggleCreated = (maid, toggle) => {
            if (toggle.menu)
                this._trackMenu(maid, toggle.menu);
        };
        this._tracker.load();
    }

    unload() {
        if (this._tracker) {
            this._tracker.unload();
            this._tracker = null;
        }
        this.items = [];
    }

    _trackMenu(toggleMaid, menu) {
        if (this.items.includes(menu)) return;

        const menuMaid = new Maid();
        menuMaid.functionJob(() => {
            const idx = this.items.indexOf(menu);
            if (idx >= 0) this.items.splice(idx, 1);
        });

        toggleMaid.functionJob(() => {
            menuMaid.destroy();
        });

        menuMaid.connectJob(menu, 'notify::isOpen', () => {
            if (this.onMenuOpen)
                this.onMenuOpen(menuMaid, menu, menu.isOpen);
        });

        this.items.push(menu);
        if (this.onMenuCreated)
            this.onMenuCreated(menuMaid, menu);
    }
}
