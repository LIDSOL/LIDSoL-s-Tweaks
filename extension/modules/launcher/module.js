'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Launcher } from './launcher.js';

export class LauncherModule {
    constructor() {
        this._launcher = null;
        this._settings = null;
        this._extension = null;
        this._stylesheetFile = null;
        this._settingsChangedId = null;
        this._hideSearchChangedId = null;
        this._searchActiveId = null;
        this._searchEntry = null;
        this._searchBarContainer = null;
        this._searchController = null;
        this._searchBarSavedOpacity = 255;
        this._savedContainerHeight = -1;
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

        try {
            this._setupSearchBarHiding();
        } catch (e) {
            log(`[LIDSoL] Search bar hiding setup failed: ${e}`);
        }
    }

    disable() {
        if (this._hideSearchChangedId) {
            this._settings.disconnect(this._hideSearchChangedId);
            this._hideSearchChangedId = null;
        }
        this._destroySearchBarHiding();
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

    _setupSearchBarHiding() {
        const entry = Main.overview?.searchEntry;
        if (!entry) return;

        this._searchEntry = entry;
        this._searchBarContainer = entry.get_parent();
        if (!this._searchBarContainer) return;

        this._searchBarSavedOpacity = this._searchBarContainer.opacity;
        this._savedContainerHeight = this._searchBarContainer.height;

        this._searchController = Main.overview.searchController;
        if (!this._searchController) return;

        this._applySearchBarVisibility();

        this._searchActiveId = this._searchController.connect('notify::search-active', () => {
            if (!this._settings.get_boolean('launcher-hide-search')) return;
            const active = this._searchController.searchActive;
            if (active) {
                this._showSearchBar();
            } else {
                this._hideSearchBar();
            }
        });

        this._hideSearchChangedId = this._settings.connect('changed::launcher-hide-search', () => {
            this._applySearchBarVisibility();
        });
    }

    _applySearchBarVisibility() {
        if (!this._searchBarContainer) return;
        const hide = this._settings.get_boolean('launcher-hide-search');
        if (hide) {
            this._hideSearchBar();
        } else {
            this._searchEntry.opacity = 255;
            this._searchBarContainer.opacity = 255;
            this._searchBarContainer.height = -1;
        }
    }

    _hideSearchBar() {
        if (!this._searchEntry || !this._searchBarContainer) return;
        this._searchEntry.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE,
            duration: 50,
            onComplete: () => {
                this._searchBarContainer.ease({
                    height: 0,
                    opacity: 0,
                    mode: Clutter.AnimationMode.EASE,
                    duration: 120,
                });
            },
        });
    }

    _showSearchBar() {
        if (!this._searchEntry || !this._searchBarContainer) return;
        this._searchBarContainer.ease({
            height: this._searchEntry.height,
            opacity: 255,
            mode: Clutter.AnimationMode.EASE,
            duration: 110,
            onComplete: () => {
                this._searchBarContainer.height = -1;
                this._searchEntry.ease({
                    opacity: 255,
                    mode: Clutter.AnimationMode.EASE,
                    duration: 700,
                });
            },
        });
    }

    _destroySearchBarHiding() {
        if (this._searchActiveId && this._searchController) {
            this._searchController.disconnect(this._searchActiveId);
            this._searchActiveId = null;
            this._searchController = null;
        }
        if (this._searchBarContainer) {
            this._searchBarContainer.ease({
                height: this._savedContainerHeight,
                opacity: this._searchBarSavedOpacity,
                mode: Clutter.AnimationMode.EASE,
                duration: 120,
                onComplete: () => {
                    if (this._searchBarContainer)
                        this._searchBarContainer.height = -1;
                },
            });
            this._searchBarContainer = null;
        }
        if (this._searchEntry) {
            this._searchEntry.opacity = 255;
            this._searchEntry = null;
        }
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
