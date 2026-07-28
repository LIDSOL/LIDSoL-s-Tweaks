'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { GnofiWindow } from './gnofiWindow.js';
import { GnofiPanelButton } from './panelButton.js';

export class GnofiModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._window = null;
        this._panelButton = null;
        this._stylesheetFile = null;
        this._handlerIds = [];
        this._workspaceChangedId = 0;
        this._overviewChangedIds = [];
        this._overviewSearchOriginal = null;
        this._overviewEntryParent = null;
        this._overviewEntryVisible = true;
        this._startupId = 0;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._loadStylesheet();

        this._window = new GnofiWindow(this._settings);
        this._window.setExtension(extension);

        this._panelButton = new GnofiPanelButton(this._settings, this._window);

        Main.wm.addKeybinding(
            'gnofi-hotkey',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => {
                try {
                    const w = global.display.get_focus_window();
                    if (w && w.is_fullscreen() && w.showing_on_its_workspace())
                        return;
                    if (this._window)
                        this._window.open('');
                } catch (e) {
                    console.error('[LIDSoL Gnofi] hotkey error:', e);
                }
            }
        );

        this._handlerIds.push(
            this._settings.connect('changed::gnofi-close-on-workspace-switch', () => {
                this._syncWorkspaceHandler();
            })
        );
        this._syncWorkspaceHandler();

        this._syncOverviewClose();
        this._syncOverviewSearch();

        this._handlerIds.push(
            this._settings.connect('changed::gnofi-replace-overview-search', () => {
                this._syncOverviewSearch();
            })
        );
        this._handlerIds.push(
            this._settings.connect('changed::gnofi-close-overview', () => {
                this._syncOverviewClose();
            })
        );

        if (this._settings.get_boolean('gnofi-open-at-startup')) {
            this._startupId = Main.layoutManager.connect('startup-complete', () => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    this._window.open('');
                    return GLib.SOURCE_REMOVE;
                });
            });
        }

        if (this._settings.get_boolean('gnofi-panel-visible'))
            this._panelButton.show();
        else
            this._panelButton.hide();

        this._handlerIds.push(
            this._settings.connect('changed::gnofi-panel-visible', () => {
                if (this._settings.get_boolean('gnofi-panel-visible'))
                    this._panelButton.show();
                else
                    this._panelButton.hide();
            })
        );
    }

    disable() {
        Main.wm.removeKeybinding('gnofi-hotkey');

        for (const id of this._handlerIds) {
            if (this._settings)
                this._settings.disconnect(id);
        }
        this._handlerIds = [];

        if (this._workspaceChangedId) {
            global.workspace_manager.disconnect(this._workspaceChangedId);
            this._workspaceChangedId = 0;
        }

        for (const id of this._overviewChangedIds)
            Main.overview.disconnect(id);
        this._overviewChangedIds = [];

        this._restoreOverviewSearch();

        if (this._window) {
            this._window.destroy();
            this._window = null;
        }

        if (this._panelButton) {
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._unloadStylesheet();

        this._settings = null;
        this._extension = null;
    }

    _syncWorkspaceHandler() {
        if (this._workspaceChangedId) {
            global.workspace_manager.disconnect(this._workspaceChangedId);
            this._workspaceChangedId = 0;
        }
        if (this._settings.get_boolean('gnofi-close-on-workspace-switch')) {
            this._workspaceChangedId = global.workspace_manager.connect('active-workspace-changed', () => {
                if (this._window)
                    this._window.close();
            });
        }
    }

    _syncOverviewClose() {
        for (const id of this._overviewChangedIds)
            Main.overview.disconnect(id);
        this._overviewChangedIds = [];

        if (this._settings.get_boolean('gnofi-close-overview')) {
            this._overviewChangedIds.push(
                Main.overview.connect('hiding', () => {
                    if (this._window)
                        this._window.close();
                })
            );
        }
        this._overviewChangedIds.push(
            Main.overview.connect('showing', () => {
                if (this._window)
                    this._window.close();
            })
        );
    }

    _syncOverviewSearch() {
        if (this._settings.get_boolean('gnofi-replace-overview-search'))
            this._replaceOverviewSearch();
        else
        this._restoreOverviewSearch();

        if (this._startupId) {
            Main.layoutManager.disconnect(this._startupId);
            this._startupId = 0;
        }
    }

    _replaceOverviewSearch() {
        try {
            const controller = Main.overview._overview._controls;
            const searchEntry = Main.overview.searchEntry;
            if (!searchEntry) return;

            this._overviewEntryParent = searchEntry.get_parent();
            this._overviewEntryVisible = searchEntry.visible;

            if (searchEntry.visible) {
                searchEntry.visible = false;
                searchEntry.height = 0;
            }

            if (this._overviewSearchOriginal === null) {
                const proto = controller.constructor.prototype;
                this._overviewSearchOriginal = proto.startSearch;
                proto.startSearch = (event) => {
                    try {
                        if (this._window) {
                            const char = event?.get_key_symbol
                                ? String.fromCharCode(event.get_key_symbol())
                                : '';
                            this._window.open(char);
                        }
                    } catch (e) {
                        console.error('[LIDSoL Gnofi] startSearch override error:', e);
                    }
                };
            }
        } catch (e) {
            console.error('[LIDSoL Gnofi] Failed to replace overview search:', e);
        }
    }

    _restoreOverviewSearch() {
        try {
            const searchEntry = Main.overview.searchEntry;
            if (searchEntry && !searchEntry.visible && this._overviewEntryParent) {
                searchEntry.visible = this._overviewEntryVisible;
                searchEntry.height = -1;
            }

            if (this._overviewSearchOriginal !== null) {
                const controller = Main.overview._overview._controls;
                controller.constructor.prototype.startSearch = this._overviewSearchOriginal;
                this._overviewSearchOriginal = null;
            }
        } catch (e) {
            console.error('[LIDSoL Gnofi] Failed to restore overview search:', e);
        }
    }

    _loadStylesheet() {
        if (!this._extension) return;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/gnofi/stylesheet.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    _unloadStylesheet() {
        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }
    }
}
