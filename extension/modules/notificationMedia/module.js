'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Mpris from 'resource:///org/gnome/shell/ui/mpris.js';
import { MediaNotificationWidget } from './notificationMedia.js';

export class NotificationMediaModule {
    constructor() {
        this._widget = null;
        this._stylesheetFile = null;
        this._settings = null;
        this._extension = null;
        this._origAddPlayer = null;
    }

    enable(gsettings, extension) {
        try {
            this._settings = gsettings;
            this._extension = extension;

            this._loadStylesheet();

            // Hide native media: patch MprisSource._addPlayer (like Dynamic Music Pill)
            this._origAddPlayer = Mpris.MprisSource.prototype._addPlayer;
            Mpris.MprisSource.prototype._addPlayer = function () {};

            // Remove already-discovered players so their MediaMessages disappear
            this._removeExistingMediaPlayers();

            this._widget = new MediaNotificationWidget({ settings: this._settings });

            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                try {
                    let ml = Main.panel.statusArea.dateMenu?._messageList;
                    if (!ml) {
                        console.warn('[NotificationMedia] no dateMenu._messageList');
                        return GLib.SOURCE_REMOVE;
                    }
                    ml.insert_child_at_index(this._widget, 0);
                    // One more pass to catch any players that snuck in
                    this._removeExistingMediaPlayers();
                    console.log('[NotificationMedia] widget inserted');
                } catch (e) {
                    console.error('[NotificationMedia] idle insert error:', e);
                }
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            console.error('[NotificationMedia] enable error:', e);
        }
    }

    _removeExistingMediaPlayers() {
        try {
            // Notification center media source
            let mv = Main.panel.statusArea.dateMenu?._messageList?._messageView;
            let source = mv?._mediaSource;
            if (source && source._players) {
                for (const [busName] of source._players) {
                    source._onNameOwnerChanged(null, null, [busName, busName, '']);
                }
            }

            // Also directly remove any MediaMessage actors still in the list
            if (mv && mv._playerToMessage) {
                for (const [player, message] of mv._playerToMessage) {
                    try {
                        let actor = message.get_child();
                        if (actor && actor.get_parent())
                            actor.get_parent().remove_child(actor);
                        message.destroy();
                    } catch (e) {}
                }
                mv._playerToMessage.clear();
            }
        } catch (e) {
            console.error('[NotificationMedia] _removeExistingMediaPlayers:', e);
        }
    }

    _loadStylesheet() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/notificationMedia/notificationMedia.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    disable() {
        try {
            // Restore original _addPlayer so native media works again
            if (this._origAddPlayer) {
                Mpris.MprisSource.prototype._addPlayer = this._origAddPlayer;
                this._origAddPlayer = null;

                // Re-trigger player discovery in the media source
                let mv = Main.panel.statusArea.dateMenu?._messageList?._messageView;
                let source = mv?._mediaSource;
                if (source && source._onProxyReady)
                    source._onProxyReady();
            }

            if (this._widget) {
                if (this._widget.get_parent())
                    this._widget.get_parent().remove_child(this._widget);
                this._widget.destroy();
                this._widget = null;
            }

            if (this._stylesheetFile) {
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
                this._stylesheetFile = null;
            }

            this._settings = null;
            this._extension = null;
        } catch (e) {
            console.error('[NotificationMedia] disable error:', e);
        }
    }
}
