'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {
    QuickSlider,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';
import { QuickSettingsMenuTracker } from '../../utils/childrenTracker.js';

export class OverlayMenuFeature {
    constructor() {
        this._tracker = null;
        this._maid = new Maid();
        this._gsettings = null;
        this._enabled = false;
        this._signalIds = [];
        this._yconstraint = null;
        this._xconstraint = null;
    }

    enable(gsettings) {
        this._gsettings = gsettings;
        this._loadSettings();
        if (!this._enabled) return;

        const qs = Main.panel.statusArea.quickSettings;
        if (!qs || !qs.menu) return;

        const menu = qs.menu;
        const grid = menu._grid;
        if (!menu._overlay || !grid) return;

        // Y constraint: bind overlay Y to box pointer
        this._yconstraint = new Clutter.BindConstraint({
            coordinate: Clutter.BindCoordinate.Y,
            source: menu._boxPointer,
        });

        // X constraint: bind overlay X to box pointer (same as Y)
        // Using menu.box would give coordinates relative to its parent,
        // not stage-absolute, causing the overlay to appear at x=0
        this._xconstraint = new Clutter.BindConstraint({
            coordinate: Clutter.BindCoordinate.X,
            source: menu._boxPointer,
        });

        // Disable default overlay container constraint
        const overlayConstraints = menu._overlay.get_constraints();
        if (overlayConstraints[0]) {
            this._defaultOverlayConstraint = overlayConstraints[0];
            this._defaultOverlayConstraint.enabled = false;
        }
        menu._overlay.add_constraint(this._yconstraint);
        menu._overlay.add_constraint(this._xconstraint);

        // Disable grid placeholder height sync
        if (grid.layout_manager && grid.layout_manager._overlay) {
            const gridConstraints = grid.layout_manager._overlay.get_constraints();
            if (gridConstraints[0]) {
                this._defaultGridConstraint = gridConstraints[0];
                this._defaultGridConstraint.enabled = false;
            }
        }

        // Start tracking toggle menus
        this._tracker = new QuickSettingsMenuTracker();
        this._tracker.onMenuCreated = (maid, m) => this._onMenuCreated(maid, m);
        this._tracker.onMenuOpen = (maid, m, isOpen) => this._onOpen(maid, m, isOpen);
        this._tracker.load();

        this._connectHandlers();
    }

    disable() {
        this._disconnectHandlers();

        if (this._tracker) {
            // Restore individual menu constraints
            for (const menu of this._tracker.items) {
                try {
                    menu.actor.x_expand = true;
                    const constraints = menu.actor.get_constraints();
                    if (constraints[0]) constraints[0].enabled = true;
                } catch (e) {
                    log('[LIDSoL Overlay] Error restoring menu constraint:', e);
                }
            }
            this._tracker.unload();
            this._tracker = null;
        }

        const qs = Main.panel.statusArea.quickSettings;
        if (qs && qs.menu) {
            const menu = qs.menu;
            // Restore overlay container constraint
            if (this._defaultOverlayConstraint) {
                this._defaultOverlayConstraint.enabled = true;
                this._defaultOverlayConstraint = null;
            }
            // Restore grid constraint
            if (this._defaultGridConstraint) {
                this._defaultGridConstraint.enabled = true;
                this._defaultGridConstraint = null;
            }
            // Remove custom constraints
            if (this._yconstraint) {
                try { menu._overlay.remove_constraint(this._yconstraint); } catch (_) {}
                this._yconstraint = null;
            }
            if (this._xconstraint) {
                try { menu._overlay.remove_constraint(this._xconstraint); } catch (_) {}
                this._xconstraint = null;
            }
        }

        this._maid.clear();
        this._gsettings = null;
    }

    _loadSettings() {
        this._enabled = this._gsettings.get_boolean('qst-overlay-menu-enabled');
        this._width = this._gsettings.get_int('qst-overlay-menu-width');
        this._duration = this._gsettings.get_int('qst-overlay-menu-animate-duration');
        this._animationStyle = this._gsettings.get_string('qst-overlay-menu-animate-style');
        this._overflowAnchor = this._gsettings.get_string('qst-overlay-menu-overflow-anchor');
    }

    _connectHandlers() {
        const reloadKeys = [
            'qst-overlay-menu-enabled',
            'qst-overlay-menu-width',
        ];
        for (const key of reloadKeys) {
            const id = this._gsettings.connect(`changed::${key}`, () => {
                this._loadSettings();
                this._scheduleReload();
            });
            this._signalIds.push(id);
        }
    }

    _disconnectHandlers() {
        for (const id of this._signalIds) {
            try { this._gsettings.disconnect(id); } catch (_) {}
        }
        this._signalIds = [];
    }

    _scheduleReload() {
        if (this._reloadId) {
            try { GLib.source_remove(this._reloadId); } catch (_) {}
        }
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._reloadId = null;
            this.disable();
            this.enable(this._gsettings);
            return GLib.SOURCE_REMOVE;
        });
    }

    _getCoords(menu) {
        menu.actor.height = -1;
        let [outerHeight] = menu.actor.get_preferred_height(-1);
        const targetWidth = menu.actor.width - menu.box.marginLeft - menu.box.marginRight;
        const targetHeight = outerHeight - menu.box.marginTop;

        const qs = Main.panel.statusArea.quickSettings;
        const qsBox = qs.menu.box;
        const grid = qs.menu._grid;

        let offsetY;
        if (qsBox.height < targetHeight && this._overflowAnchor !== 'center') {
            offsetY = this._overflowAnchor === 'top' ? 0 : qsBox.height - targetHeight;
        } else {
            offsetY = Math.floor((qsBox.height - targetHeight) / 2);
        }

        const isSlider = menu.sourceActor instanceof QuickSlider;
        const sourceHeight = Math.floor(menu.sourceActor.height + 0.5);
        const sourceBaseWidth = Math.floor(menu.sourceActor.width + 0.5);
        const sourceWidth = isSlider ? sourceHeight : sourceBaseWidth;
        const sourceBaseX = Math.floor(grid.x + menu.sourceActor.x + 0.5);
        const sourceY = Math.floor(grid.y + menu.sourceActor.y + 0.5);
        const sourceX = sourceBaseX + (isSlider ? (sourceBaseWidth - sourceWidth) : 0);
        const offsetX = Math.floor((qsBox.width - targetWidth) / 2);

        return {
            outerHeight,
            targetHeight,
            targetWidth,
            sourceX,
            sourceY,
            sourceHeight,
            sourceWidth,
            offsetY,
            offsetX,
        };
    }

    _onOpen(_maid, menu, isOpen) {
        if (!isOpen || !this._duration) {
            menu.actor.set_easing_duration(0);
        } else {
            menu.actor.remove_all_transitions();
        }
        if (!isOpen) return;

        const coords = this._getCoords(menu);
        if (this._yconstraint)
            this._yconstraint.offset = coords.offsetY;
        if (this._xconstraint)
            this._xconstraint.offset = coords.offsetX;

        if (this._duration) {
            // Fade in the content
            menu.box.opacity = 0;
            menu.box.ease({
                opacity: 255,
                duration: Math.floor(this._duration / 3),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            if (this._animationStyle === 'flyout') {
                // Animate from source toggle position/size
                menu.box.translation_x = Math.floor(
                    coords.sourceX - coords.offsetX + menu.box.marginLeft);
                menu.box.translation_y = Math.floor(
                    coords.sourceY - coords.offsetY + menu.box.marginTop);
                menu.box.scale_x = coords.sourceWidth / coords.targetWidth;
                menu.box.scale_y = coords.sourceHeight / coords.targetHeight;
                menu.box.ease({
                    translation_x: 0,
                    translation_y: 0,
                    scale_x: 1,
                    scale_y: 1,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    duration: this._duration,
                });
            } else if (this._animationStyle === 'dialog') {
                // Scale up from center
                menu.box.translation_x = 0.2 * coords.targetWidth * 0.5;
                menu.box.translation_y = 0.2 * coords.targetHeight * 0.5;
                menu.box.scale_x = 0.8;
                menu.box.scale_y = 0.8;
                menu.box.ease({
                    translation_x: 0,
                    translation_y: 0,
                    scale_x: 1,
                    scale_y: 1,
                    mode: Clutter.AnimationMode.EASE_OUT_EXPO,
                    duration: this._duration,
                });
            }
        }
    }

    _onMenuCreated(maid, menu) {
        // Disable individual menu's first constraint (usually a width/position constraint)
        const constraints = menu.actor.get_constraints();
        if (constraints[0]) {
            constraints[0].enabled = false;
        }

        if (this._width) {
            menu.actor.width = this._width;
            menu.actor.x_expand = false;
            menu.actor.x_align = Clutter.ActorAlign.CENTER;
        }

        // Recalculate Y offset when menu height changes
        maid.connectJob(menu.box, 'notify::height', () => {
            if (!menu.isOpen) return;
            const coords = this._getCoords(menu);
            if (this._yconstraint)
                this._yconstraint.offset = coords.offsetY;
            if (this._xconstraint)
                this._xconstraint.offset = coords.offsetX;
        });
    }
}
