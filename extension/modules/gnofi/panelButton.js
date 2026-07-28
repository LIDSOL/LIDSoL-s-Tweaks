'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export var GnofiPanelButton = GObject.registerClass(
class GnofiPanelButton extends PanelMenu.Button {
    _init(settings, gnofiWindow) {
        super._init(0.0, 'Gnofi', true);

        this._settings = settings;
        this._gnofiWindow = gnofiWindow;
        this._handlerIds = [];

        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this.add_child(this._box);

        this._icon = new St.Icon({
            icon_name: this._settings.get_string('gnofi-panel-icon'),
            style_class: 'system-status-icon',
        });
        this._box.add_child(this._icon);

        this._label = new St.Label({
            text: this._settings.get_string('gnofi-panel-label'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._label);

        if (!this._settings.get_string('gnofi-panel-label'))
            this._label.hide();

        this._handlerIds.push(
            this._settings.connect('changed::gnofi-panel-icon', () => this._syncIcon())
        );
        this._handlerIds.push(
            this._settings.connect('changed::gnofi-panel-label', () => this._syncLabel())
        );

        this._addToPanel();
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === Clutter.BUTTON_PRIMARY ||
                event.get_button() === Clutter.BUTTON_SECONDARY) {
                this._gnofiWindow.toggle();
                return Clutter.EVENT_STOP;
            }
        }
        return super.vfunc_event(event);
    }

    _addToPanel() {
        const position = this._settings.get_int('gnofi-panel-position');
        const index = this._settings.get_int('gnofi-panel-index');
        const boxes = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
        Main.panel.addToStatusArea('gnofi-panel-button', this, index, boxes[position] ?? boxes[2]);
    }

    _syncIcon() {
        this._icon.icon_name = this._settings.get_string('gnofi-panel-icon');
    }

    _syncLabel() {
        const label = this._settings.get_string('gnofi-panel-label');
        this._label.text = label;
        if (label)
            this._label.show();
        else
            this._label.hide();
    }

    show() {
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }

    destroy() {
        for (const id of this._handlerIds) {
            if (this._settings)
                this._settings.disconnect(id);
        }
        this._handlerIds = [];
        if (this.get_parent())
            this.get_parent().remove_child(this);
        super.destroy();
    }
});
