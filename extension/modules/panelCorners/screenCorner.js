'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';
import Cairo from 'cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Utils from './utils.js';

const CornersList = [
    Meta.DisplayCorner.TOPLEFT, Meta.DisplayCorner.TOPRIGHT,
    Meta.DisplayCorner.BOTTOMLEFT, Meta.DisplayCorner.BOTTOMRIGHT
];

export class ScreenCorners {
    constructor(settings, connections) {
        this._settings = settings;
        this._connections = connections;
    }

    update() {
        this._log('updating screen corners...');

        const layoutManager = Main.layoutManager;
        this.remove();

        for (const monitor of layoutManager.monitors) {
            for (const corner of CornersList) {
                const actor = new ScreenCorner(corner, monitor, this._settings);
                layoutManager.addTopChrome(actor, { trackFullscreen: true });

                if (!layoutManager._screenCorners)
                    layoutManager._screenCorners = [];
                layoutManager._screenCorners.push(actor);

                this._settings._keys.forEach(key => {
                    this._connections.connect(
                        this._settings._settings,
                        'changed::' + key.name,
                        actor.vfunc_style_changed.bind(actor)
                    );
                });
            }
        }
        this._log('corners updated.');
    }

    remove() {
        this._connections.disconnectAll();

        const layoutManager = Main.layoutManager;

        if (layoutManager._screenCorners)
            layoutManager._screenCorners.forEach(corner => {
                if (corner) {
                    corner.destroy();
                }
            });

        layoutManager._screenCorners = [];
    }

    _log(str) {
        if (this._settings.DEBUG.get())
            console.log(`[LIDSoL - Screen Corners] ${str}`);
    }
}

export class ScreenCorner extends St.DrawingArea {
    static {
        GObject.registerClass(this);
    }

    constructor(corner, monitor, settings) {
        super({ style_class: 'screen-corner' });

        this._corner = corner;
        this._settings = settings;
        this._monitor = monitor;

        this._updateAllocation();
    }

    _updateAllocation() {
        const cornerRadius = Utils.lookupForLength(null, '-screen-corner-radius', this._settings);

        switch (this._corner) {
            case Meta.DisplayCorner.TOPLEFT:
                this.set_position(
                    this._monitor.x,
                    this._monitor.y
                );
                break;

            case Meta.DisplayCorner.TOPRIGHT:
                this.set_position(
                    this._monitor.x + this._monitor.width - cornerRadius,
                    this._monitor.y
                );
                break;

            case Meta.DisplayCorner.BOTTOMLEFT:
                this.set_position(
                    this._monitor.x,
                    this._monitor.y + this._monitor.height - cornerRadius
                );
                break;

            case Meta.DisplayCorner.BOTTOMRIGHT:
                this.set_position(
                    this._monitor.x + this._monitor.width - cornerRadius,
                    this._monitor.y + this._monitor.height - cornerRadius
                );
                break;
        }
    }

    vfunc_repaint() {
        const cornerRadius = Utils.lookupForLength(null, '-screen-corner-radius', this._settings);
        const backgroundColor = Utils.lookupForColor(null, '-screen-corner-background-color', this._settings);

        const cr = this.get_context();
        cr.setOperator(Cairo.Operator.SOURCE);

        switch (this._corner) {
            case Meta.DisplayCorner.TOPLEFT:
                cr.arc(cornerRadius, cornerRadius,
                    cornerRadius, Math.PI, 3 * Math.PI / 2);
                cr.lineTo(0, 0);
                break;

            case Meta.DisplayCorner.TOPRIGHT:
                cr.arc(0, cornerRadius,
                    cornerRadius, 3 * Math.PI / 2, 2 * Math.PI);
                cr.lineTo(cornerRadius, 0);
                break;

            case Meta.DisplayCorner.BOTTOMLEFT:
                cr.arc(cornerRadius, 0,
                    cornerRadius, Math.PI / 2, Math.PI);
                cr.lineTo(0, cornerRadius);
                break;

            case Meta.DisplayCorner.BOTTOMRIGHT:
                cr.arc(0, 0,
                    cornerRadius, 0, Math.PI / 2);
                cr.lineTo(cornerRadius, cornerRadius);
                break;
        }

        cr.closePath();
        cr.setSourceColor(backgroundColor);
        cr.fill();

        cr.$dispose();
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();

        const cornerRadius = Utils.lookupForLength(null, '-screen-corner-radius', this._settings);
        const opacity = Utils.lookupForDouble(null, '-screen-corner-opacity', this._settings);

        this.set_opacity(opacity * 255);
        this.set_size(cornerRadius, cornerRadius);
        this._updateAllocation();
    }
}
