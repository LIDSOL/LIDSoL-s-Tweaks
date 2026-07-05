'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { DashBoardPanelButton } from './dashBoard.js';

const SETTINGS_KEYS = [
    'dashboard-enabled',
    'dashboard-button-enable',
    'dashboard-button-show-icon',
    'dashboard-button-icon-path',
    'dashboard-button-label',
    'dashboard-position',
    'dashboard-offset',
    'dashboard-shortcut',
    'dashboard-x-align',
    'dashboard-y-align',
    'dashboard-x-offset',
    'dashboard-y-offset',
    'dashboard-darken',
    'dashboard-layout-json',
    'dashboard-hide-activities',
];

export class DashboardModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._panelButton = null;
        this._handlerIds = [];
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._loadStylesheet();

        this._handlerIds = SETTINGS_KEYS.map(key =>
            this._settings.connect(`changed::${key}`, () => {
                const gs = this._settings;
                this.disable();
                this.enable(gs, extension);
            })
        );

        this._addPanelButton();

        if (this._settings.get_boolean('dashboard-hide-activities')) {
            this._activities = Main.panel.statusArea.activities.get_parent();
            this._activities.hide();
        }
    }

    _addPanelButton() {
        if (this._panelButton) {
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._panelButton = new DashBoardPanelButton(this._settings);
        const pos = this._settings.get_int('dashboard-position');
        const offset = this._settings.get_int('dashboard-offset');
        const posNames = ['left', 'center', 'right'];
        Main.panel.addToStatusArea('dashboard-button', this._panelButton, offset, posNames[pos]);
    }

    _loadStylesheet() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/dashboard/stylesheet.css'
        );
        themeContext.get_theme().load_stylesheet(stylesheetFile);
        this._stylesheetFile = stylesheetFile;
    }

    disable() {
        this._handlerIds.forEach(id => {
            if (this._settings) this._settings.disconnect(id);
        });
        this._handlerIds = [];

        if (this._panelButton) {
            this._panelButton.destroy();
            this._panelButton = null;
        }

        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }

        if (this._activities) {
            this._activities.show();
            this._activities = null;
        }

        this._extension = null;
        this._settings = null;
    }
}
