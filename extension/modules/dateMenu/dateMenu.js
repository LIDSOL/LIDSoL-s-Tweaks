'use strict';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { MprisService } from '../../utils/mprisService.js';
import { CrossfadeArt } from './crossfadeArt.js';
import { VisualizerWidget } from './visualizer.js';

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
        this._showArtChangedId = 0;
        this._pauseDebounceId = 0;
        this._visualizer = null;
        this._vizStyleChangedId = 0;
        this._vizBarsChangedId = 0;
        this._vizHeightChangedId = 0;
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

        this._mediaArt = new CrossfadeArt(12);
        this._mediaArt.add_style_class_name('at-a-glance-media-art');
        this._mediaArt.set_width(24);
        this._mediaArt.set_height(24);
        this._mediaPill.add_child(this._mediaArt);

        this._mediaLabel = new St.Label({
            style_class: 'at-a-glance-media-label',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._mediaPill.add_child(this._mediaLabel);

        this._visualizer = new VisualizerWidget();
        this._visualizer.setBarCount(this._gsettings.get_int('dm-visualizer-bars'));
        this._visualizer.setVisualizerHeight(this._gsettings.get_int('dm-visualizer-height'));
        this._mediaPill.add_child(this._visualizer);

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
        this._showArtChangedId = this._gsettings.connect('changed::dm-show-art', () => {
            this._updateArtVisibility();
        });
        this._vizStyleChangedId = this._gsettings.connect('changed::dm-visualizer-style', () => {
            this._updateVisualizer();
        });
        this._vizBarsChangedId = this._gsettings.connect('changed::dm-visualizer-bars', () => {
            this._visualizer?.setBarCount(this._gsettings.get_int('dm-visualizer-bars'));
        });
        this._vizHeightChangedId = this._gsettings.connect('changed::dm-visualizer-height', () => {
            this._visualizer?.setVisualizerHeight(this._gsettings.get_int('dm-visualizer-height'));
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

        if (nowPlaying) {
            if (this._pauseDebounceId) {
                GLib.Source.remove(this._pauseDebounceId);
                this._pauseDebounceId = 0;
            }
            this._onMediaUpdate(text, cover, true);
            return;
        }

        if (!this._pauseDebounceId) {
            this._pauseDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._pauseDebounceId = 0;
                this._lastPlayingState = false;
                this._lastMediaText = '';
                this._lastCoverUrl = null;
                this._updateMedia();
                this._updateMediaVisibility();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _onMediaUpdate(text, cover, nowPlaying) {
        const textChanged = text !== this._lastMediaText;
        const coverChanged = cover !== this._lastCoverUrl;
        const stateChanged = nowPlaying !== this._lastPlayingState;

        if (!textChanged && !coverChanged && !stateChanged)
            return;

        this._lastPlayingState = nowPlaying;
        this._lastMediaText = text;
        this._lastCoverUrl = cover;

        if (textChanged)
            this._crossfadeMedia(text, cover);
        else
            this._updateMedia();

        this._updateMediaVisibility();
    }

    _crossfadeMedia(text, cover) {
        if (this._mediaLabel.text !== text) {
            this._mediaLabel.remove_all_transitions();
            this._mediaLabel.ease({
                opacity: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    this._mediaLabel.text = text;
                    this._mediaLabel.ease({
                        opacity: 255,
                        duration: 300,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                },
            });
        }

        if (cover)
            this._mediaArt.setArt(cover);

        this._updateArtVisibility();
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

        if (this._player.trackCoverUrl)
            this._mediaArt.setArt(this._player.trackCoverUrl);

        this._updateArtVisibility();
    }

    _updateArtVisibility() {
        const showArt = this._gsettings.get_boolean('dm-show-art');
        const hasCover = !!this._player?.trackCoverUrl;
        this._mediaArt.visible = showArt && hasCover;
    }

    _updateVisualizer() {
        if (!this._visualizer) return;
        const style = this._gsettings.get_int('dm-visualizer-style');
        this._visualizer.setMode(style);
        this._visualizer.visible = style > 0 && this._lastPlayingState;
        this._visualizer.setPlaying(style > 0 && this._lastPlayingState);
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

        this._updateVisualizer();
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

        if (this._showArtChangedId) {
            this._gsettings.disconnect(this._showArtChangedId);
            this._showArtChangedId = 0;
        }

        if (this._pauseDebounceId) {
            GLib.Source.remove(this._pauseDebounceId);
            this._pauseDebounceId = 0;
        }

        if (this._vizStyleChangedId) {
            this._gsettings.disconnect(this._vizStyleChangedId);
            this._vizStyleChangedId = 0;
        }
        if (this._vizBarsChangedId) {
            this._gsettings.disconnect(this._vizBarsChangedId);
            this._vizBarsChangedId = 0;
        }
        if (this._vizHeightChangedId) {
            this._gsettings.disconnect(this._vizHeightChangedId);
            this._vizHeightChangedId = 0;
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
        this._visualizer = null;
        this._gsettings = null;
    }
}
