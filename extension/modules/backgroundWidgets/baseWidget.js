'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';

let _containerGroup = null;

function _ensureContainer() {
    if (_containerGroup)
        return _containerGroup;

    const wg = global.window_group;
    const bgGroup = Main.layoutManager._backgroundGroup;
    if (!wg || !bgGroup || bgGroup.get_parent() !== wg) {
        console.log('[LIDSoL] cannot create container, fallback');
        return null;
    }

    _containerGroup = new St.Widget({ name: 'lidsol-widget-container' });

    // Strategy: use set_child_below_sibling to place container BELOW the
    // first non-bg child (which is always a window actor).
    // This puts us between bg and window actors.

    // First, add as a child
    wg.add_child(_containerGroup);
    // Move to right above bgGroup
    wg.set_child_above_sibling(_containerGroup, bgGroup);

    console.log('[LIDSoL] Container created above bgGroup');

    return _containerGroup;
}

const DesktopWidget = GObject.registerClass(
class DesktopWidget extends St.Widget {
    _init(settings) {
        super._init({ reactive: false });

        this._settings = settings;
        this._adjSignalId = 0;
        this._stateAdj = null;

        this._addToDesktopContainer();
        this._connectOverviewFade();

        this.connect('destroy', () => {
            this._disconnectOverviewFade();
        });
    }

    _addToDesktopContainer() {
        const container = _ensureContainer();
        if (container) {
            container.add_child(this);
            console.log('[LIDSoL] Widget in lidSol container');
        } else {
            const bgGroup = Main.layoutManager._backgroundGroup;
            if (bgGroup) {
                bgGroup.add_child(this);
                console.log('[LIDSoL] Widget in _backgroundGroup (fallback)');
            } else {
                console.log('[LIDSoL] Widget in uiGroup');
                Main.layoutManager.uiGroup.add_child(this);
            }
        }
    }

    _connectOverviewFade() {
        try {
            const o = Main.overview;
            const adj = o?._overview?._controls?._stateAdjustment;

            if (adj) {
                console.log(`[LIDSoL] adj found, initial=${adj.value}`);
                this._stateAdj = adj;
                this._adjSignalId = adj.connect('notify::value', () => {
                    const v = adj.value;
                    this.set_opacity(Math.round(255 * (1 - Math.min(v, 1))));
                });

                if (adj.value >= 1)
                    this.set_opacity(0);
            } else {
                console.log('[LIDSoL] No adj, using showing/hiding');
                this._showingId = o.connect('showing', () => {
                    console.log('[LIDSoL] showing signal');
                    this.ease({
                        opacity: 0,
                        duration: Overview.ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                });
                this._hidingId = o.connect('hiding', () => {
                    console.log('[LIDSoL] hiding signal');
                    this.ease({
                        opacity: 255,
                        duration: Overview.ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                });
            }
        } catch (e) {
            console.log(`[LIDSoL] Fade err: ${e}`);
        }
    }

    _disconnectOverviewFade() {
        if (this._adjSignalId && this._stateAdj) {
            this._stateAdj.disconnect(this._adjSignalId);
            this._adjSignalId = 0;
            this._stateAdj = null;
        }
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = 0;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = 0;
        }
    }
});

export {DesktopWidget};
