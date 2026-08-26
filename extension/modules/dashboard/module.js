'use strict';

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { DashBoardModal } from './dashBoard.js';

const SETTINGS_KEYS = [
    'dashboard-enabled',
    'dashboard-shortcut',
    'dashboard-x-align',
    'dashboard-y-align',
    'dashboard-x-offset',
    'dashboard-y-offset',
    'dashboard-darken',
    'dashboard-container-transparent',
    'dashboard-dialog-scale',
    'dashboard-layout-json',
    'dashboard-grid-spacing',
    'dashboard-grid-columns',
];

export class DashboardModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._dash = null;
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

        this._dash = new DashBoardModal(this._settings);
        this._dash.connectObject(
            'closed', () => { this._opened = false; },
            'opened', () => { this._opened = true; },
            this
        );

        Main.wm.addKeybinding('dashboard-shortcut', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._toggleDash());
    }

    _toggleDash() {
        if (this._opened)
            this._dash.close();
        else
            this._dash.open();
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
        Main.wm.removeKeybinding('dashboard-shortcut');

        if (this._dash) {
            this._dash.destroy();
            this._dash = null;
        }

        this._handlerIds.forEach(id => {
            if (this._settings) this._settings.disconnect(id);
        });
        this._handlerIds = [];

        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }

        this._extension = null;
        this._settings = null;
    }
}
