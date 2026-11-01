'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Mpris from 'resource:///org/gnome/shell/ui/mpris.js';

export class NotificationMediaModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._origAddPlayer = null;
    }

    enable(gsettings, extension) {
        try {
            this._settings = gsettings;
            this._extension = extension;

            // Hide native media: patch MprisSource._addPlayer
            this._origAddPlayer = Mpris.MprisSource.prototype._addPlayer;
            Mpris.MprisSource.prototype._addPlayer = function () {};

            // Remove already-discovered players so their MediaMessages disappear
            this._removeExistingMediaPlayers();

            console.log('[NotificationMedia] Native media indicators hidden');
        } catch (e) {
            console.error('[NotificationMedia] enable error:', e);
        }
    }

    _removeExistingMediaPlayers() {
        try {
            let mv = Main.panel.statusArea.dateMenu?._messageList?._messageView;
            let source = mv?._mediaSource;
            if (source && source._players) {
                for (const [busName] of source._players) {
                    source._onNameOwnerChanged(null, null, [busName, busName, '']);
                }
            }

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

    _reloadSettings() {}

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

            this._settings = null;
            this._extension = null;

            console.log('[NotificationMedia] Native media indicators restored');
        } catch (e) {
            console.error('[NotificationMedia] disable error:', e);
        }
    }
}
