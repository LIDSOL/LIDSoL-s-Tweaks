'use strict';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { MprisService } from '../../utils/mprisService.js';

export class AtAGlanceIndicator {
    constructor() {
        this._gsettings = null;
        this._container = null;
        this._clockLabel = null;
        this._mediaPill = null;
        this._mediaArt = null;
        this._mediaLabel = null;
        this._originalClockDisplay = null;
        this._timerId = 0;
        this._service = null;
        this._serviceHandlers = [];
        this._playerChangedId = 0;
        this._player = null;
        this._lastMediaText = '';
        this._lastCoverUrl = null;
        this._lastPlayingState = false;
        this._settingsChangedId = 0;
    }

    enable(gsettings) {
        this._gsettings = gsettings;

        const dateMenu = Main.panel.statusArea.dateMenu;
        const dateMenuButton = dateMenu.get_children()[0];

        this._originalClockDisplay = dateMenu._clockDisplay;

        this._container = new St.BoxLayout({
            style_class: 'at-a-glance-indicator',
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._clockLabel = new St.Label({
            style_class: 'clock',
            text: '...',
        });
        this._container.add_child(this._clockLabel);

        this._mediaPill = new St.BoxLayout({
            style_class: 'at-a-glance-media',
            visible: false,
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._mediaArt = new St.Widget({
            style_class: 'at-a-glance-media-art',
            width: 24,
            height: 24,
        });
        this._mediaPill.add_child(this._mediaArt);

        this._mediaLabel = new St.Label({
            style_class: 'at-a-glance-media-label',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._mediaPill.add_child(this._mediaLabel);

        this._container.add_child(this._mediaPill);

        dateMenuButton.insert_child_at_index(this._container, 1);
        if (this._originalClockDisplay.get_parent())
            dateMenuButton.remove_child(this._originalClockDisplay);

        this._service = MprisService.getDefault();
        this._serviceHandlers = [
            this._service.connect('player-added', this._onPlayerListChanged.bind(this)),
            this._service.connect('player-removed', this._onPlayerListChanged.bind(this)),
        ];
        this._onPlayerListChanged();

        this._updateClock();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateClock();
            return GLib.SOURCE_CONTINUE;
        });

        this._settingsChangedId = this._gsettings.connect('changed::dm-show-media', () => {
            this._updateMediaVisibility();
        });
    }

    _onPlayerListChanged() {
        const newPlayer = this._service.getActivePlayer();

        if (newPlayer && newPlayer === this._player)
            return;

        if (this._playerChangedId && this._player) {
            this._player.disconnect(this._playerChangedId);
            this._playerChangedId = 0;
        }

        this._player = newPlayer;
        this._lastMediaText = '';
        this._lastCoverUrl = null;

        if (this._player) {
            this._playerChangedId = this._player.connect('changed', () => {
                this._onPlayerUpdate();
            });
            this._syncPlayerState();
        } else {
            const players = this._service.players;
            if (players.length > 0) {
                this._player = players[0];
                this._playerChangedId = this._player.connect('changed', () => {
                    this._onPlayerUpdate();
                });
            }
            this._updateMedia();
            this._updateMediaVisibility();
        }
    }

    _onPlayerUpdate() {
        if (!this._player) return;

        const activePlayer = this._service.getActivePlayer();
        if (activePlayer && activePlayer !== this._player) {
            this._onPlayerListChanged();
            return;
        }

        const nowPlaying = this._player.isPlaying();
        const title = this._player.trackTitle || '';
        const artist = this._player.trackArtists ? this._player.trackArtists.join(', ') : '';
        const text = title + (artist ? ` — ${artist}` : '');
        const cover = this._player.trackCoverUrl;

        if (nowPlaying !== this._lastPlayingState ||
            text !== this._lastMediaText ||
            cover !== this._lastCoverUrl) {
            this._lastPlayingState = nowPlaying;
            this._lastMediaText = text;
            this._lastCoverUrl = cover;
            this._updateMedia();
            this._updateMediaVisibility();
        }
    }

    _syncPlayerState() {
        if (!this._player) return;
        const title = this._player.trackTitle || '';
        const artist = this._player.trackArtists ? this._player.trackArtists.join(', ') : '';
        this._lastMediaText = title + (artist ? ` — ${artist}` : '');
        this._lastCoverUrl = this._player.trackCoverUrl;
        this._lastPlayingState = this._player.isPlaying();
        this._updateMedia();
        this._updateMediaVisibility();
    }

    _updateMedia() {
        if (!this._player) {
            this._mediaLabel.text = '';
            return;
        }

        const title = this._player.trackTitle || '';
        const artist = this._player.trackArtists ? this._player.trackArtists.join(', ') : '';
        const text = title + (artist ? ` — ${artist}` : '');
        this._mediaLabel.text = text;

        if (this._player.trackCoverUrl) {
            this._mediaArt.style = `background-image: url('${this._player.trackCoverUrl}'); background-size: cover;`;
        } else {
            this._mediaArt.style = '';
        }
    }

    _updateMediaVisibility() {
        const showMedia = this._gsettings.get_boolean('dm-show-media');

        if (showMedia && this._lastPlayingState) {
            this._clockLabel.visible = false;
            this._mediaPill.visible = true;
        } else {
            this._clockLabel.visible = true;
            this._mediaPill.visible = false;
        }
    }

    _updateClock() {
        const now = GLib.DateTime.new_now_local();
        const format = this._gsettings.get_string('dm-format');
        this._clockLabel.text = now.format(format);
    }

    disable() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }

        if (this._playerChangedId && this._player) {
            this._player.disconnect(this._playerChangedId);
            this._playerChangedId = 0;
        }

        if (this._settingsChangedId) {
            this._gsettings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        if (this._service) {
            this._serviceHandlers.forEach(h => this._service.disconnect(h));
            this._serviceHandlers = [];
            this._service = null;
        }

        this._player = null;

        if (this._originalClockDisplay) {
            const dateMenuButton = Main.panel.statusArea.dateMenu.get_children()[0];
            if (this._container && this._container.get_parent())
                dateMenuButton.remove_child(this._container);
            if (!this._originalClockDisplay.get_parent())
                dateMenuButton.insert_child_at_index(this._originalClockDisplay, 1);
            this._originalClockDisplay = null;
        }

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
        this._clockLabel = null;
        this._mediaPill = null;
        this._mediaArt = null;
        this._mediaLabel = null;
        this._gsettings = null;
    }
}
