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
        this._focusNotifyId = null;
        this._entryKeyHandlerId = null;
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
        this.container.add_style_class_name('popup-menu-content');
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
        this._posX = this._settings.get_int('launcher-position-x');
        this._posY = this._settings.get_int('launcher-position-y');
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
        this._entry.opacity = 255;
        this.container.add_child(this._entry);

        if (this._searchParent) {
            this._searchParent.remove_child(this._search);
        }
        this.container.add_child(this._search);

        if (!this._search.__searchCancelled) {
            this._search.__searchCancelled = this._search._searchCancelled;
        }
        this._search._searchCancelled = () => {
            if (this._visible) this.hide();
        };

        this._textChangedEventId = this._search._text.connect('text-changed', () => {
            const text = this._search._text.get_text();
            if (text && !this._expanded) {
                this._expanded = true;
                this._search.show();
                if (this._useAnimations) {
                    this.mainContainer.ease({
                        height: this._height,
                        duration: this._animationSpeed,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    this.container.ease({
                        height: this._height,
                        duration: this._animationSpeed,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                } else {
                    this.container.set_size(this._width, this._height);
                    this.mainContainer.set_size(this._width, this._height);
                }
                this.mainContainer.set_position(
                    this._baseX,
                    this._baseY,
                );
            } else if (!text && this._expanded) {
                this._expanded = false;
                this._search.hide();
                if (this._useAnimations) {
                    this.mainContainer.ease({
                        height: this._initialHeight,
                        duration: this._animationSpeed,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    this.container.ease({
                        height: this._initialHeight,
                        duration: this._animationSpeed,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                } else {
                    this.container.set_size(this._width, this._initialHeight);
                    this.mainContainer.set_size(this._width, this._initialHeight);
                }
            }
        });
        this._entry.grab_key_focus();

        // ── Tab/Shift+Tab: runs after search controller (which doesn't handle Tab) ──
        this._entryKeyHandlerId = this._entry.connect('key-press-event', (_entry, event) => {
            const symbol = event.get_key_symbol();

            if (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_ISO_Left_Tab) {
                if (this._searchResults && this._searchResults._moveSelection) {
                    this._searchResults._moveSelection(symbol === Clutter.KEY_Tab ? 1 : -1);
                    return Clutter.EVENT_STOP;
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });

        // ── auto-close: patch activateDefault for Enter key ──
        if (!this._searchResults.__activateDefault) {
            this._searchResults.__activateDefault = this._searchResults.activateDefault;
        }
        this._searchResults.activateDefault = () => {
            this.mainContainer.opacity = 0;
            this._searchResults.__activateDefault();
        };

        // ── auto-close: patch focus.activate for click activation ──
        this._focusNotifyId = global.stage.connect('notify::key-focus', () => {
            const focus = global.stage.get_key_focus();
            if (!this._visible) return;
            if (!focus || !this.mainContainer.contains(focus)) {
                this.hide();
                return;
            }
            if (focus.activate && !focus.__activate) {
                focus.__activate = focus.activate;
                focus.activate = () => {
                    this.mainContainer.opacity = 0;
                    focus.__activate();
                };
            }
        });
    }

    _releaseUi() {
        // ── restore activateDefault ──
        if (this._searchResults && this._searchResults.__activateDefault) {
            this._searchResults.activateDefault = this._searchResults.__activateDefault;
            this._searchResults.__activateDefault = null;
        }

        // ── disconnect entry key handler ──
        if (this._entryKeyHandlerId) {
            if (this._entry) {
                this._entry.disconnect(this._entryKeyHandlerId);
            }
            this._entryKeyHandlerId = null;
        }
        this._expanded = false;
        this._initialHeight = 50;

        // ── disconnect focus notify ──
        if (this._focusNotifyId) {
            global.stage.disconnect(this._focusNotifyId);
            this._focusNotifyId = null;
        }

        // ── restore current focus activate ──
        const currentFocus = global.stage.get_key_focus();
        if (currentFocus && currentFocus.__activate) {
            currentFocus.activate = currentFocus.__activate;
            currentFocus.__activate = null;
        }

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
            this._search._text.set_text('');
            this._search.hide();
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
        this._expanded = false;
        const [, entryHeight] = this._entry
            ? this._entry.get_preferred_height(-1)
            : [0, 34];
        this._initialHeight = entryHeight + 8; // 8px bottom CSS padding
        this._baseX = monitor.x + Math.floor((monitor.width - this._width) * this._posX / 100);
        this._baseY = monitor.y + Math.floor((monitor.height - this._initialHeight) * this._posY / 100);
        this.container.set_size(this._width, this._initialHeight);
        this.mainContainer.set_size(this._width, this._initialHeight);
        this.mainContainer.set_position(this._baseX, this._baseY);
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
