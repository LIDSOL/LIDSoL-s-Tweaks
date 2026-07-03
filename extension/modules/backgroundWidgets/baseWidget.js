'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WorkspaceBackground} from 'resource:///org/gnome/shell/ui/workspace.js';

const _widgets = new Set();
let _origBgInit = null;
let _patchCount = 0;
const _allConns = [];

function _connectAdjustment(adj) {
    const id = adj.connect('notify::value', () => {
        const val = adj.value;
        const newOpacity = Math.round(255 * (1 - val));
        console.warn(`[LIDSoL] adj.value=${val} opacity=${newOpacity}`);
        for (const w of _widgets)
            w.opacity = newOpacity;
    });
    _allConns.push([adj, id]);
}

function _walkAndConnect(actor, visited) {
    if (actor._stateAdjustment && !visited.has(actor._stateAdjustment)) {
        visited.add(actor._stateAdjustment);
        _connectAdjustment(actor._stateAdjustment);
    }
    if (typeof actor.foreach === 'function')
        actor.foreach(child => _walkAndConnect(child, visited));
    else if (actor.get_children)
        actor.get_children().forEach(child => _walkAndConnect(child, visited));
}

function _patchBgInit() {
    if (_origBgInit)
        return;
    const bgGroup = Main.layoutManager._backgroundGroup;
    if (bgGroup)
        _walkAndConnect(bgGroup, new Set());
    _origBgInit = WorkspaceBackground.prototype._init;
    WorkspaceBackground.prototype._init = function (...args) {
        _origBgInit.call(this, ...args);
        if (this._stateAdjustment)
            _connectAdjustment(this._stateAdjustment);
    };
}

function _unpatchBgInit() {
    for (const [adj, id] of _allConns)
        adj.disconnect(id);
    _allConns.length = 0;
    if (_origBgInit) {
        WorkspaceBackground.prototype._init = _origBgInit;
        _origBgInit = null;
    }
}

const DesktopWidget = GObject.registerClass(
class DesktopWidget extends St.Widget {
    _init(settings) {
        super._init({ reactive: false });

        this._settings = settings;
        this._raiseIdleId = 0;

        Main.layoutManager.uiGroup.add_child(this);
        this._raiseToTop();
        this._setupOverviewFade();

        if (Main.overview.visible)
            this.opacity = 0;

        this.connect('destroy', () => {
            this._removeOverviewFade();
            this._cancelRaiseIdle();
        });
    }

    _raiseToTop() {
        this._cancelRaiseIdle();
        this._raiseIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._raiseIdleId = 0;
            const parent = this.get_parent();
            if (parent)
                parent.set_child_above_sibling(this, null);
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelRaiseIdle() {
        if (this._raiseIdleId) {
            GLib.source_remove(this._raiseIdleId);
            this._raiseIdleId = 0;
        }
    }

    _setupOverviewFade() {
        _widgets.add(this);
        _patchCount++;
        if (_patchCount === 1)
            _patchBgInit();
    }

    _removeOverviewFade() {
        _widgets.delete(this);
        _patchCount--;
        if (_patchCount <= 0) {
            _patchCount = 0;
            _unpatchBgInit();
        }
    }
});

export { DesktopWidget };
