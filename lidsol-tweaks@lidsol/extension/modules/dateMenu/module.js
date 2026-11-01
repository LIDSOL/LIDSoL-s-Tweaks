'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import { AtAGlanceIndicator } from './dateMenu.js';

const SETTINGS_KEYS = [
    'dm-format',
    'dm-show-media',
];

export class DateMenuModule {
    constructor() {
        this._indicator = null;
        this._settings = null;
        this._extension = null;
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

        this._indicator = new AtAGlanceIndicator();
        this._indicator.enable(this._settings);
    }

    _loadStylesheet() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/dateMenu/dateMenu.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    disable() {
        this._handlerIds.forEach(id => {
            if (this._settings) this._settings.disconnect(id);
        });
        this._handlerIds = [];

        if (this._indicator) {
            this._indicator.disable();
            this._indicator = null;
        }

        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }

        this._extension = null;
        this._settings = null;
    }
}
