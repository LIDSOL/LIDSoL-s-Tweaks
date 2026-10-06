'use strict';

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { MprisService } from '../mprisService.js';

var MediaPlayerManager = GObject.registerClass({
    Signals: {
        'player-changed': { param_types: [GObject.TYPE_STRING] },
        'media-changed': {},
        'screen-unlocked': {},
    },
}, class MediaPlayerManager extends GObject.Object {
    static _instance = null;

    static getDefault() {
        if (!MediaPlayerManager._instance) {
            MediaPlayerManager._instance = new MediaPlayerManager();
            MediaPlayerManager._instance._initManager();
        }
        return MediaPlayerManager._instance;
    }

    constructor() {
        super();
        this._service = null;
        this._activePlayer = null;
        this._lastActivePlayer = null;
        this._lastTrackId = null;
        this._started = false;
        this._screenSaverSubId = 0;
        this._lastKnownCover = null;
    }

    _initManager() {
        if (this._started) return;
        this._started = true;

        this._service = MprisService.getDefault();

        this._service.connectObject(
            'player-added', () => this._onPlayerListChanged(),
            'player-removed', () => this._onPlayerListChanged(),
            'players-changed', () => this._onFilterChanged(),
            this
        );

        this._connectAllPlayers();
        this._selectActivePlayer({ silent: true });

        this._subscribeScreenSaver();
    }

    _subscribeScreenSaver() {
        try {
            this._screenSaverSubId = Gio.DBus.session.signal_subscribe(
                'org.gnome.ScreenSaver',
                'org.gnome.ScreenSaver',
                'ActiveChanged',
                '/org/gnome/ScreenSaver',
                null,
                Gio.DBusSignalFlags.NONE,
                (conn, sender, path, iface, signal, params) => {
                    let [isActive] = params.deepUnpack();
                    if (!isActive)
                        this._onScreenUnlock();
                }
            );
        } catch (e) {
            console.error('[MediaPlayerManager] Failed to subscribe ScreenSaver:', e);
        }
    }

    _onScreenUnlock() {
        this.emit('screen-unlocked');
        if (this._activePlayer)
            this._emitMediaChanged();
    }

    _connectAllPlayers() {
        for (const player of this._service.allPlayers) {
            if (!player._mpmConnected) {
                player.connectObject('changed', () => {
                    this._onAnyPlayerUpdate(player);
                }, this);
                player._mpmConnected = true;
            }
        }
    }

    _onPlayerListChanged() {
        this._connectAllPlayers();
        this._selectActivePlayer();
    }

    // The player filter (blacklist/whitelist) may have excluded the currently
    // active player. Re-select so the change is applied immediately instead of
    // waiting for the player to quit/restart. _selectActivePlayer revalidates
    // against the allowed list and emits 'player-changed' if it dropped it.
    _onFilterChanged() {
        this._selectActivePlayer();
    }

    _onAnyPlayerUpdate(player) {
        const wasActive = player === this._activePlayer;

        if (wasActive || player.isPlaying()) {
            if (wasActive) {
                // When the active player pauses/stops, immediately check
                // if another player is still playing and switch to it
                if (!player.isPlaying()) {
                    const otherPlaying = this._service.players.find(
                        p => p !== player && p.isPlaying()
                    );
                    if (otherPlaying) {
                        this._selectActivePlayer();
                        return;
                    }
                }
                this._emitMediaChanged();
            } else {
                this._selectActivePlayer();
            }
        }
    }

    _selectActivePlayer(opts = {}) {
        // Capture before the filter validation below so a player dropped by
        // the filter still counts as a change and emits 'player-changed'.
        const previous = this._activePlayer;

        // The player filter may have excluded the previously active player,
        // so never keep a player that is no longer in the allowed list.
        const allowed = this._service.players;
        if (this._activePlayer && !allowed.includes(this._activePlayer))
            this._activePlayer = null;
        if (this._lastActivePlayer && !allowed.includes(this._lastActivePlayer))
            this._lastActivePlayer = null;

        const active = this._service.getActivePlayer();
        const lastActive = this._lastActivePlayer;

        this._activePlayer = active || lastActive || null;

        if (!this._activePlayer || !this._activePlayer.isPlaying()) {
            const playing = this._service.players.find(p => p.isPlaying());
            if (playing)
                this._activePlayer = playing;
        }

        if (this._activePlayer && this._activePlayer.isPlaying())
            this._lastActivePlayer = this._activePlayer;

        if (this._activePlayer !== previous) {
            if (opts.silent) return;
            this.emit('player-changed', this._activePlayer?.busName || '');
            if (this._activePlayer)
                this._emitMediaChanged();
        }
    }

    _emitMediaChanged() {
        if (!this._activePlayer) return;
        this.emit('media-changed');
    }

    getActivePlayer() {
        return this._activePlayer;
    }

    getLastKnownCover() {
        return this._lastKnownCover;
    }

    getActivePlayerMeta() {
        if (!this._activePlayer) return null;
        const p = this._activePlayer;
        return {
            title: p.trackTitle || '',
            artist: p.trackArtists ? p.trackArtists.join(', ') : '',
            coverUrl: p.trackCoverUrl || '',
            isPlaying: p.isPlaying(),
            playbackStatus: p.playbackStatus,
            canGoNext: p.canGoNext,
            canGoPrevious: p.canGoPrevious,
            canSeek: p.canSeek,
            busName: p.busName,
        };
    }

    destroy() {
        if (this._screenSaverSubId) {
            Gio.DBus.session.signal_unsubscribe(this._screenSaverSubId);
            this._screenSaverSubId = 0;
        }
        if (this._service)
            this._service.disconnectObject(this);
        for (const player of this._service?.allPlayers || [])
            player.disconnectObject(this);
        this._activePlayer = null;
        this._lastActivePlayer = null;
        MediaPlayerManager._instance = null;
        this._started = false;
    }
});

export { MediaPlayerManager };
