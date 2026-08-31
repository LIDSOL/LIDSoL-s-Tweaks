'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Cairo from 'cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Utils from './utils.js';
import { ANIMATION_TIME } from 'resource:///org/gnome/shell/ui/overview.js';

const SYNC_CREATE = GObject.BindingFlags.SYNC_CREATE;

export class PanelCorners {
    constructor(settings, connections) {
        this._settings = settings;
        this._connections = connections;
    }

    update() {
        this.remove();

        Main.panel._leftCorner = new PanelCorner(
            St.Side.LEFT, this._settings
        );
        Main.panel._rightCorner = new PanelCorner(
            St.Side.RIGHT, this._settings
        );

        this._updateCorner(Main.panel._leftCorner);
        this._updateCorner(Main.panel._rightCorner);
    }

    _updateCorner(corner) {
        Main.panel.bind_property('style', corner, 'style', SYNC_CREATE);
        Main.panel.add_child(corner);
        corner.vfunc_style_changed();

        const actor = this._settings._settings;

        this._settings._keys.forEach(key => {
            this._connections.connect(
                actor,
                'changed::' + key.name,
                corner.vfunc_style_changed.bind(corner)
            );
        });
    }

    remove() {
        this._connections.disconnectAll();

        const panel = Main.panel;

        if (panel._leftCorner) {
            this._removeCorner(panel._leftCorner);
            delete panel._leftCorner;
        }

        if (panel._rightCorner) {
            this._removeCorner(panel._rightCorner);
            delete panel._rightCorner;
        }
    }

    _removeCorner(corner) {
        corner.removeConnections();
        Main.panel.remove_child(corner);
        corner.destroy();
    }
}

export class PanelCorner extends St.DrawingArea {
    static {
        GObject.registerClass(this);
    }

    constructor(side, settings) {
        super({ style_class: 'panel-corner' });

        this._side = side;
        this._settings = settings;

        this._positionChangedId = Main.panel.connect(
            'notify::position',
            this._updateAllocation.bind(this)
        );

        this._sizeChangedId = Main.panel.connect(
            'notify::size',
            this._updateAllocation.bind(this)
        );

        this._updateAllocation();
    }

    removeConnections() {
        if (this._positionChangedId) {
            Main.panel.disconnect(this._positionChangedId);
            this._positionChangedId = null;
        }
        if (this._sizeChangedId) {
            Main.panel.disconnect(this._sizeChangedId);
            this._sizeChangedId = null;
        }
    }

    _updateAllocation() {
        const childBox = new Clutter.ActorBox();

        let cornerWidth, cornerHeight;
        [, cornerWidth] = this.get_preferred_width(-1);
        [, cornerHeight] = this.get_preferred_height(-1);

        const allocWidth = Main.panel.width;
        const allocHeight = Main.panel.height;

        switch (this._side) {
            case St.Side.LEFT:
                childBox.x1 = 0;
                childBox.x2 = cornerWidth;
                childBox.y1 = allocHeight;
                childBox.y2 = allocHeight + cornerHeight;
                break;

            case St.Side.RIGHT:
                childBox.x1 = allocWidth - cornerWidth;
                childBox.x2 = allocWidth;
                childBox.y1 = allocHeight;
                childBox.y2 = allocHeight + cornerHeight;
                break;
        }

        this.allocate(childBox);
    }

    vfunc_repaint() {
        const node = this.get_theme_node();

        const cornerRadius = Utils.lookupForLength(node, '-panel-corner-radius', this._settings);
        const borderWidth = Utils.lookupForLength(node, '-panel-corner-border-width', this._settings);
        const backgroundColor = Utils.lookupForColor(node, '-panel-corner-background-color', this._settings);

        const cr = this.get_context();
        cr.setOperator(Cairo.Operator.SOURCE);

        cr.moveTo(0, 0);
        if (this._side == St.Side.LEFT) {
            cr.arc(cornerRadius,
                borderWidth + cornerRadius,
                cornerRadius, Math.PI, 3 * Math.PI / 2);
        } else {
            cr.arc(0,
                borderWidth + cornerRadius,
                cornerRadius, 3 * Math.PI / 2, 2 * Math.PI);
        }
        cr.lineTo(cornerRadius, 0);
        cr.closePath();

        cr.setSourceColor(backgroundColor);
        cr.fill();

        cr.$dispose();
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();
        const node = this.get_theme_node();

        const cornerRadius = Utils.lookupForLength(node, '-panel-corner-radius', this._settings);
        const borderWidth = Utils.lookupForLength(node, '-panel-corner-border-width', this._settings);
        let opacity = Utils.lookupForDouble(node, '-panel-corner-opacity', this._settings);

        if (
            this._settings.FORCE_EXTENSION_VALUES.get() &&
            Main.panel.get_style_pseudo_class() &&
            Main.panel.get_style_pseudo_class().includes('overview')
        )
            opacity = 0.;

        this._updateAllocation();
        this.set_size(cornerRadius, borderWidth + cornerRadius);
        this.translation_y = -borderWidth;

        this.remove_transition('opacity');
        this.ease({
            opacity: opacity * 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        });
    }
}
