'use strict';

import GObject from 'gi://GObject';
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
