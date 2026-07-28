'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Launcher } from './launcher.js';

export class LauncherModule {
    constructor() {
        this._launcher = null;
        this._settings = null;
        this._extension = null;
        this._stylesheetFile = null;
        this._settingsChangedId = null;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._loadStylesheet();
        this._launcher = new Launcher(this._settings);
        this._launcher.enable();

        this._settingsChangedId = this._settings.connect('changed::launcher-hotkey', () => {
            this._launcher.disable();
            this._launcher = new Launcher(this._settings);
            this._launcher.enable();
        });
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._launcher) {
            this._launcher.disable();
            this._launcher = null;
        }
        this._unloadStylesheet();
        this._settings = null;
        this._extension = null;
    }

    _loadStylesheet() {
        if (!this._extension) return;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/launcher/stylesheet.css'
        );
        if (this._stylesheetFile.query_exists(null)) {
            themeContext.get_theme().load_stylesheet(this._stylesheetFile);
        }
    }

    _unloadStylesheet() {
        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }
    }
}
