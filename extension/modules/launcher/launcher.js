'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SearchLight = GObject.registerClass({}, class SearchLight extends St.Widget {
    _init() {
        super._init();
        this.name = 'searchLight';
        this.layout_manager = new Clutter.BinLayout();
    }
});

export class Launcher {
    constructor(settings) {
        this._settings = settings;
        this._visible = false;
        this._entry = null;
        this._search = null;
        this._entryParent = null;
        this._searchParent = null;
        this._searchResults = null;
        this._textChangedEventId = null;
        this._keybindingId = null;
        this._stageEventId = null;
    }

    enable() {
        this.mainContainer = new SearchLight();
        Main.layoutManager.addChrome(this.mainContainer, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this.mainContainer.hide();
        this.container = new St.BoxLayout({
            name: 'searchLightBox',
            vertical: true,
        });
        this.mainContainer.add_child(this.container);
        this._updateSettings();
        this._registerKeybinding();
    }

    disable() {
        this.hide();
        this._unregisterKeybinding();
        if (this.mainContainer) {
            this.mainContainer.destroy();
            this.mainContainer = null;
            this.container = null;
        }
    }

    _updateSettings() {
        this._width = this._settings.get_int('launcher-width');
        this._height = this._settings.get_int('launcher-height');
        this._animationSpeed = this._settings.get_int('launcher-animation-speed');
        this._useAnimations = this._settings.get_boolean('launcher-use-animations');
    }

    _registerKeybinding() {
        Main.wm.addKeybinding(
            'launcher-hotkey',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.toggle(),
        );
        this._keybindingId = 'launcher-hotkey';
    }

    _unregisterKeybinding() {
        if (this._keybindingId) {
            Main.wm.removeKeybinding(this._keybindingId);
            this._keybindingId = null;
        }
    }

    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (this._visible) return;
        if (Main.overview.visible) return;
        this._updateSettings();
        this._acquireUi();
        this._layout();
        global.compositor.disable_unredirect();
        this.mainContainer.show();
        this.container.show();
        this._connectStageEvents();
        this._visible = true;

        if (this._useAnimations) {
            this.mainContainer.opacity = 0;
            this.mainContainer.scale_x = 0.9;
            this.mainContainer.scale_y = 0.9;
            this.mainContainer.ease({
                opacity: 255,
                scale_x: 1.0,
                scale_y: 1.0,
                duration: this._animationSpeed,
                mode: Clutter.AnimationMode.EASE_OUT,
            });
        } else {
            this.mainContainer.opacity = 255;
            this.mainContainer.scale_x = 1.0;
            this.mainContainer.scale_y = 1.0;
        }
    }

    hide() {
        if (!this._visible) return;
        this._visible = false;
        this._disconnectStageEvents();
        this._releaseUi();

        if (this._useAnimations) {
            this.mainContainer.ease({
                opacity: 0,
                scale_x: 0.9,
                scale_y: 0.9,
                duration: this._animationSpeed,
                mode: Clutter.AnimationMode.EASE_OUT,
                onComplete: () => {
                    global.compositor.enable_unredirect();
                    this.mainContainer.hide();
                },
            });
        } else {
            global.compositor.enable_unredirect();
            this.mainContainer.hide();
        }
    }

    _acquireUi() {
        if (this._entry) return;

        this._entry = Main.overview.searchEntry;
        this._entryParent = this._entry.get_parent();
        this._search = Main.overview.searchController;
        this._search.hide();
        this._searchResults = this._search._searchResults;
        this._searchParent = this._search.get_parent();

        if (this._entryParent) {
            this._entryParent.remove_child(this._entry);
        }
        this.container.add_child(this._entry);

        if (this._searchParent) {
            this._searchParent.remove_child(this._search);
        }
        this.container.add_child(this._search);

        if (!this._search.__searchCancelled) {
            this._search.__searchCancelled = this._search._searchCancelled;
            this._search._searchCancelled = () => {};
        }

        this._textChangedEventId = this._search._text.connect('text-changed', () => {
            this.container.set_size(this._width, this._height);
            this.mainContainer.set_size(this._width, this._height);
            this._search.show();
        });
        this._search._text.get_parent().grab_key_focus();
    }

    _releaseUi() {
        if (this._entry) {
            if (this._entry.get_parent()) {
                this._entry.get_parent().remove_child(this._entry);
            }
            if (this._entryParent) {
                this._entryParent.add_child(this._entry);
            }
            this._entry = null;
        }
        if (this._search) {
            if (this._search.get_parent()) {
                this._search.get_parent().remove_child(this._search);
            }
            if (this._searchParent) {
                this._searchParent.add_child(this._search);
            }
            if (this._textChangedEventId) {
                this._search._text.disconnect(this._textChangedEventId);
                this._textChangedEventId = null;
            }
            if (this._search.__searchCancelled) {
                this._search._searchCancelled = this._search.__searchCancelled;
                this._search.__searchCancelled = null;
            }
            this._search = null;
        }
    }

    _layout() {
        const monitor = Main.layoutManager.primaryMonitor;
        const sf = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.container.set_size(this._width, this._height);
        this.mainContainer.set_size(this._width, this._height);
        this.mainContainer.set_position(
            monitor.x + Math.floor((monitor.width - this._width) / 2),
            monitor.y + Math.floor(monitor.height * 0.18),
        );
    }

    _connectStageEvents() {
        if (!this._stageEventId) {
            this._stageEventId = global.stage.connect('key-press-event', (_stage, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    this.hide();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }
    }

    _disconnectStageEvents() {
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = null;
        }
    }
}
