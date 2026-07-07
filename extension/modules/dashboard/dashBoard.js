'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {
    AppsWidget,
    ClockWidget,
    LevelsWidget,
    LinksWidget,
    MediaWidget,
    SettingsWidget,
    SystemWidget,
    UserWidget,
} from './widgets.js';

const DashBoardModal = GObject.registerClass(
class DashBoardModal extends ModalDialog.ModalDialog {
    _init(settings) {
        super._init({
            destroyOnClose: false,
            shellReactive: true,
        });
        this._settings = settings;

        const closeBtn = this.addButton({
            action: () => this.close(),
            label: '×',
            key: Clutter.KEY_Escape,
        });
        closeBtn.hide();

        this.contentLayout.reactive = true;
        this.contentLayout.connect('button-press-event', (self, event) => {
            if (this._isOnMediaWidget(event))
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });
        this.connect('button-press-event', () => this.close());

        this.dialogLayout._dialog.add_style_class_name('dashboard');

        this._settings.connectObject(
            'changed::dashboard-x-align', () => this._syncStyle(),
            'changed::dashboard-y-align', () => this._syncStyle(),
            'changed::dashboard-x-offset', () => this._syncStyle(),
            'changed::dashboard-y-offset', () => this._syncStyle(),
            'changed::dashboard-darken', () => this._syncStyle(),
            'changed::dashboard-layout-json', () => this._buildUI(),
            this
        );
        this.connectObject(
            'opened', () => {
                if (this._levelsWidget)
                    this._levelsWidget.startTimeout();
            },
            'closed', () => {
                if (this._levelsWidget)
                    this._levelsWidget.stopTimeout();
            },
            'destroy', () => {
                this._settings.disconnectObject(this);
            },
            this
        );

        this._buildUI();
    }

    _syncStyle() {
        this.dialogLayout._dialog.x_align = this._parseAlign(this._settings.get_int('dashboard-x-align'));
        this.dialogLayout._dialog.y_align = this._parseAlign(this._settings.get_int('dashboard-y-align'));
        this.dialogLayout._dialog.x_expand = true;
        this.dialogLayout._dialog.y_expand = true;
        const xOffset = this._settings.get_int('dashboard-x-offset');
        const yOffset = this._settings.get_int('dashboard-y-offset');

        this.dialogLayout.set_style(`
            padding-top: ${yOffset < 0 ? yOffset * -1 : 0}px;
            padding-bottom: ${yOffset > 0 ? yOffset : 0}px;
            padding-right: ${xOffset < 0 ? xOffset * -1 : 0}px;
            padding-left: ${xOffset > 0 ? xOffset : 0}px;
        `);

        if (this._settings.get_boolean('dashboard-darken'))
            this.set_style('background-color: rgba(0,0,0,0.6);');
        else
            this.set_style('background-color: transparent');
    }

    _isOnMediaWidget(event) {
        if (!this._mediaWidget)
            return false;
        const source = event.get_source();
        return source ? this._mediaWidget.contains(source) : false;
    }

    _buildUI() {
        if (this._mainBox) {
            this._mainBox.destroy();
            this._mainBox = null;
            this._mediaWidget = null;
            this._levelsWidget = null;
        }

        this._widgetList = {
            apps: () => new AppsWidget(this._settings, this),
            clock: () => new ClockWidget(this._settings, this),
            levels: () => {
                this._levelsWidget = new LevelsWidget(this._settings, this);
                return this._levelsWidget;
            },
            links: () => new LinksWidget(this._settings, this),
            media: () => {
                this._mediaWidget = new MediaWidget(this._settings, this);
                return this._mediaWidget;
            },
            settings: () => new SettingsWidget(this._settings, this),
            system: () => new SystemWidget(this._settings, this),
            user: () => new UserWidget(this._settings, this),
        };

        this._mainBox = new St.BoxLayout({ vertical: true });
        try {
            const layout = JSON.parse(this._settings.get_string('dashboard-layout-json'));
            this._mainBox = this._parseJson(layout);
        } catch (e) {
            console.error('[LIDSoL Dashboard] Error building layout:', e);
        }
        this.contentLayout.add_child(this._mainBox);
        this._syncStyle();
    }

    _parseJson(obj) {
        if (typeof obj === 'string' && this._widgetList[obj]) {
            try {
                return this._widgetList[obj]();
            } catch (e) {
                console.error(`[LIDSoL Dashboard] Error creating widget '${obj}':`, e);
                return new St.BoxLayout({ style_class: 'container' });
            }
        }
        const box = new St.BoxLayout({
            style_class: 'container',
            vertical: obj.vertical || false,
            y_expand: obj.y_expand || false,
            x_expand: obj.x_expand || false,
            y_align: this._parseAlign(obj.y_align),
            x_align: this._parseAlign(obj.x_align),
        });
        if (obj.width)
            box.set_style(`width: ${obj.width}px;`);
        if (obj.height)
            box.set_style(`${box.get_style() || ''} height: ${obj.height}px;`);
        if (obj.children) {
            for (const ch of obj.children) {
                try {
                    box.add_child(this._parseJson(ch));
                } catch (e) {
                    console.error('[LIDSoL Dashboard] Error parsing child:', e);
                }
            }
        }
        return box;
    }

    _parseAlign(align) {
        switch (align) {
        case 'START': return Clutter.ActorAlign.START;
        case 'CENTER': return Clutter.ActorAlign.CENTER;
        case 'END': return Clutter.ActorAlign.END;
        case 1: return Clutter.ActorAlign.START;
        case 2: return Clutter.ActorAlign.CENTER;
        case 3: return Clutter.ActorAlign.END;
        default: return Clutter.ActorAlign.FILL;
        }
    }
});

export var DashBoardPanelButton = GObject.registerClass(
class DashBoardPanelButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0, 'Dash Board', true);
        this._settings = settings;
        this.add_style_class_name('dashboard-button');
        const box = new St.BoxLayout();
        this.add_child(box);

        this._buttonIcon = new St.Icon({ style_class: 'system-status-icon' });
        this._buttonLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        box.add_child(this._buttonIcon);
        box.add_child(this._buttonLabel);

        this._settings.connectObject(
            'changed::dashboard-button-enable', () => this._sync(),
            'changed::dashboard-button-show-icon', () => this._sync(),
            'changed::dashboard-button-icon-path', () => this._sync(),
            'changed::dashboard-button-label', () => this._sync(),
            this
        );

        this._opened = false;
        this.connect('destroy', () => this._onDestroy());
        this.connect('button-press-event', () => this._toggleDash());
        this._sync();

        Main.wm.addKeybinding('dashboard-shortcut', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._toggleDash());
    }

    _onDestroy() {
        this._settings.disconnectObject(this);
        Main.wm.removeKeybinding('dashboard-shortcut');
        if (this._dash)
            this._dash.destroy();
    }

    _openDash() {
        this._opened = true;
        this._dash.open();
        this.add_style_pseudo_class('active');
    }

    _closeDash() {
        this._opened = false;
        this._dash.close();
        this.remove_style_pseudo_class('active');
    }

    _toggleDash() {
        this._opened ? this._closeDash() : this._openDash();
    }

    _sync() {
        this.visible = this._settings.get_boolean('dashboard-button-enable');
        this._buttonIcon.visible = this._settings.get_boolean('dashboard-button-show-icon');

        const iconPath = this._settings.get_string('dashboard-button-icon-path');
        if (iconPath && iconPath !== '') {
            try {
                this._buttonIcon.gicon = Gio.icon_new_for_string(iconPath);
            } catch (e) {
                this._buttonIcon.icon_name = 'view-grid-symbolic';
            }
        } else {
            this._buttonIcon.icon_name = 'view-grid-symbolic';
        }
        this._buttonLabel.text = this._settings.get_string('dashboard-button-label');

        if (this._dash) {
            this._dash.destroy();
            this._dash = null;
        }
        this._dash = new DashBoardModal(this._settings);
        this._dash.connectObject(
            'closed', () => {
                this.remove_style_pseudo_class('active');
                this._opened = false;
            },
            'opened', () => {
                this.add_style_pseudo_class('active');
                this._opened = true;
            },
            'destroy', () => {
                this._dash.disconnectObject(this);
            },
            this
        );
    }
});
