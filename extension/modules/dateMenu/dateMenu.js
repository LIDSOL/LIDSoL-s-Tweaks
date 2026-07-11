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
        this._mediaLabel = null;
        this._textBox = null;
        this._mediaArt = null;
        this._visualizer = null;
        this._originalClockDisplay = null;
        this._timerId = 0;
        this._service = null;
        this._serviceHandlers = [];
        this._player = null;
        this._lastMediaText = '';
        this._lastCoverUrl = null;
        this._lastPlayingState = false;
        this._settingsChangedId = 0;
        this._showArtChangedId = 0;
        this._pauseDebounceId = 0;
        this._vizStyleChangedId = 0;
        this._vizBarsChangedId = 0;
        this._vizHeightChangedId = 0;
        this._mediaLayoutChangedId = 0;
        this._completeFormatChangedId = 0;
        this._visEnabledChangedId = 0;
        this._artPositionChangedId = 0;
        this._visPositionChangedId = 0;
        this._titleMaxLenChangedId = 0;
        this._artistMaxLenChangedId = 0;
        this._swapTextOrderChangedId = 0;
        this._mediaPlayingOnlyChangedId = 0;
        this._menuOpenId = 0;
        this._playerChangedIds = [];
    }

    enable(gsettings) {
        this._gsettings = gsettings;

        const dateMenu = Main.panel.statusArea.dateMenu;
        const dateMenuButton = dateMenu.get_children()[0];

        this._originalClockDisplay = dateMenu._clockDisplay;

        // Container: [art(if left), vis(if left), textBox, vis(if right), art(if right)]
        this._container = new St.BoxLayout({
            style_class: 'at-a-glance-indicator',
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._container.connect('enter-event', () => {
            this._container.add_style_pseudo_class('hover');
            return Clutter.EVENT_PROPAGATE;
        });
        this._container.connect('leave-event', () => {
            this._container.remove_style_pseudo_class('hover');
            return Clutter.EVENT_PROPAGATE;
        });

        // Album art (always outermost, left or right)
        this._mediaArt = new CrossfadeArt(12);
        this._mediaArt.add_style_class_name('at-a-glance-media-art');
        this._mediaArt.set_width(24);
        this._mediaArt.set_height(24);
        this._container.add_child(this._mediaArt);

        // Visualizer (inner, next to textBox)
        this._visualizer = new VisualizerWidget();
        this._visualizer.setBarCount(this._gsettings.get_int('dm-visualizer-bars'));
        this._visualizer.setVisualizerHeight(this._gsettings.get_int('dm-visualizer-height'));
        this._container.add_child(this._visualizer);

        // Text wrapper: clock + track info
        this._textBox = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._clockLabel = new St.Label({
            style_class: 'clock',
            text: '...',
        });
        this._textBox.add_child(this._clockLabel);

        this._mediaLabel = new St.Label({
            style_class: 'at-a-glance-media-label',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._textBox.add_child(this._mediaLabel);

        this._container.add_child(this._textBox);

        this._reorderContainer();

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
        this._mediaLayoutChangedId = this._gsettings.connect('changed::dm-media-layout', () => {
            this._updateClock();
            this._updateMediaVisibility();
        });
        this._visEnabledChangedId = this._gsettings.connect('changed::dm-visualizer-enabled', () => {
            this._updateVisualizer();
        });
        this._completeFormatChangedId = this._gsettings.connect('changed::dm-complete-format', () => {
            this._updateClock();
        });
        this._artPositionChangedId = this._gsettings.connect('changed::dm-art-position', () => {
            this._updateMediaVisibility();
        });
        this._visPositionChangedId = this._gsettings.connect('changed::dm-visualizer-position', () => {
            this._updateMediaVisibility();
        });
        this._titleMaxLenChangedId = this._gsettings.connect('changed::dm-title-max-length', () => {
            this._updateMedia();
            this._updateMediaVisibility();
        });
        this._artistMaxLenChangedId = this._gsettings.connect('changed::dm-artist-max-length', () => {
            this._updateMedia();
            this._updateMediaVisibility();
        });
        this._swapTextOrderChangedId = this._gsettings.connect('changed::dm-swap-text-order', () => {
            this._updateMediaVisibility();
        });
        this._mediaPlayingOnlyChangedId = this._gsettings.connect('changed::dm-show-media-playing-only', () => {
            this._updateMediaVisibility();
        });

        this._menuOpenId = dateMenu.menu.connect('open-state-changed', (menu, open) => {
            if (open)
                this._container.add_style_pseudo_class('active');
            else
                this._container.remove_style_pseudo_class('active');
        });
    }

    _connectAllPlayers() {
        for (const entry of this._playerChangedIds) {
            entry.player.disconnect(entry.id);
        }
        this._playerChangedIds = [];

        for (const player of this._service.allPlayers) {
            const id = player.connect('changed', () => {
                this._onAnyPlayerUpdate(player);
            });
            this._playerChangedIds.push({ player, id });
        }
    }

    _onPlayerListChanged() {
        const newPlayer = this._service.getActivePlayer();

        this._connectAllPlayers();

        this._player = newPlayer;
        this._lastMediaText = '';
        this._lastCoverUrl = null;

        if (this._player) {
            this._syncPlayerState();
        } else {
            const players = this._service.allPlayers;
            if (players.length > 0) {
                this._player = players[0];
            }
            this._updateMedia();
            this._updateMediaVisibility();
        }
    }

    _onAnyPlayerUpdate(emitter) {
        const activePlayer = this._service.getActivePlayer();

        if (activePlayer && activePlayer !== this._player) {
            this._onPlayerListChanged();
            return;
        }

        if (emitter !== this._player)
            return;

        this._onPlayerUpdate();
    }

    _onPlayerUpdate() {
        if (!this._player) return;

        const nowPlaying = this._player.isPlaying();
        const title = this._player.trackTitle || '';
        const artist = this._player.trackArtists ? this._player.trackArtists.join(', ') : '';
        const text = this._formatMediaText(title, artist);
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

        const mediaLayout = this._gsettings.get_int('dm-media-layout');

        if (textChanged && mediaLayout !== 1)
            this._crossfadeMedia(text, cover);
        else
            this._updateMedia();

        this._updateClock();
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
        this._lastMediaText = this._formatMediaText(title, artist);
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
        this._mediaLabel.text = this._formatMediaText(title, artist);

        const cover = this._player.trackCoverUrl;
        if (cover)
            this._mediaArt.setArt(cover);

        this._updateArtVisibility();
    }

    _updateArtVisibility() {
        const showMedia = this._gsettings.get_boolean('dm-show-media');
        const mediaPlayingOnly = this._gsettings.get_boolean('dm-show-media-playing-only');
        const isPlaying = this._lastPlayingState;
        const showArt = this._gsettings.get_boolean('dm-show-art');
        const hasCover = !!this._player?.trackCoverUrl;
        this._mediaArt.visible = showMedia && (isPlaying || !mediaPlayingOnly) && showArt && hasCover;
    }

    _updateVisualizer() {
        if (!this._visualizer) return;
        const showMedia = this._gsettings.get_boolean('dm-show-media');
        const mediaPlayingOnly = this._gsettings.get_boolean('dm-show-media-playing-only');
        const visEnabled = this._gsettings.get_boolean('dm-visualizer-enabled');
        const style = this._gsettings.get_int('dm-visualizer-style');
        const effectiveMode = visEnabled ? style : 0;
        const showVis = showMedia && (this._lastPlayingState || !mediaPlayingOnly) && effectiveMode > 0;

        this._visualizer.setMode(effectiveMode);
        this._visualizer.setPlaying(this._lastPlayingState);
        this._visualizer.setShowPauseIcon(showVis && !this._lastPlayingState);
        this._visualizer.visible = showVis;
    }

    _formatMediaText(title, artist) {
        const maxTitle = this._gsettings.get_int('dm-title-max-length');
        const maxArtist = this._gsettings.get_int('dm-artist-max-length');
        const t = title.length > maxTitle ? title.substring(0, maxTitle) + '…' : title;
        const a = artist.length > maxArtist ? artist.substring(0, maxArtist) + '…' : artist;
        return t + (a ? ` — ${a}` : '');
    }

    _reorderTextBox() {
        const swap = this._gsettings.get_boolean('dm-swap-text-order');
        const clock = this._clockLabel;
        const media = this._mediaLabel;
        const children = this._textBox.get_children();

        const desired = swap ? [media, clock] : [clock, media];

        for (let i = 0; i < children.length; i++) {
            if (children[i] !== desired[i]) {
                for (const child of children)
                    this._textBox.remove_child(child);
                for (const child of desired)
                    this._textBox.add_child(child);
                return;
            }
        }
    }

    _reorderContainer() {
        const artPos = this._gsettings.get_int('dm-art-position');
        const visPos = this._gsettings.get_int('dm-visualizer-position');

        // Layout: [art(if left), vis(if left), textBox, vis(if right), art(if right)]
        // art is always outermost, vis is between art and text
        const left = [];
        const right = [];

        if (artPos === 0) left.push(this._mediaArt);
        if (visPos === 0) left.push(this._visualizer);
        if (visPos === 1) right.unshift(this._visualizer);
        if (artPos === 1) right.unshift(this._mediaArt);

        const desired = [...left, this._textBox, ...right];
        const current = this._container.get_children();

        for (let i = 0; i < current.length; i++) {
            if (current[i] !== desired[i]) {
                for (const child of current)
                    this._container.remove_child(child);
                for (const child of desired)
                    this._container.add_child(child);
                return;
            }
        }
    }

    _updateMediaVisibility() {
        const showMedia = this._gsettings.get_boolean('dm-show-media');
        const mediaLayout = this._gsettings.get_int('dm-media-layout');
        const mediaPlayingOnly = this._gsettings.get_boolean('dm-show-media-playing-only');
        const isPlaying = this._lastPlayingState;
        const shouldShow = showMedia && (isPlaying || !mediaPlayingOnly);

        this._reorderContainer();
        this._reorderTextBox();

        if (shouldShow) {
            switch (mediaLayout) {
            case 0: // Vista multimedia: text only
                this._clockLabel.visible = false;
                this._mediaLabel.visible = true;
                break;
            case 1: // Vista de reloj: clock + art + vis
                this._clockLabel.visible = true;
                this._mediaLabel.visible = false;
                break;
            case 2: // Vista completa: clock + text + art + vis
                this._clockLabel.visible = true;
                this._mediaLabel.visible = true;
                break;
            }
        } else {
            this._clockLabel.visible = true;
            this._mediaLabel.visible = false;
        }

        this._updateClock();
        this._updateArtVisibility();
        this._updateVisualizer();
    }

    _updateClock() {
        const now = GLib.DateTime.new_now_local();
        const mediaLayout = this._gsettings.get_int('dm-media-layout');
        const showMedia = this._gsettings.get_boolean('dm-show-media');
        const mediaPlayingOnly = this._gsettings.get_boolean('dm-show-media-playing-only');
        let format = this._gsettings.get_string('dm-format');

        if (mediaLayout === 2 && showMedia && (this._lastPlayingState || !mediaPlayingOnly))
            format = this._gsettings.get_string('dm-complete-format');

        this._clockLabel.text = now.format(format);
    }

    disable() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }

        if (this._menuOpenId) {
            const dateMenu = Main.panel.statusArea.dateMenu;
            if (dateMenu && dateMenu.menu)
                dateMenu.menu.disconnect(this._menuOpenId);
            this._menuOpenId = 0;
        }

        for (const entry of this._playerChangedIds) {
            entry.player.disconnect(entry.id);
        }
        this._playerChangedIds = [];

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

        if (this._mediaLayoutChangedId) {
            this._gsettings.disconnect(this._mediaLayoutChangedId);
            this._mediaLayoutChangedId = 0;
        }
        if (this._visEnabledChangedId) {
            this._gsettings.disconnect(this._visEnabledChangedId);
            this._visEnabledChangedId = 0;
        }
        if (this._completeFormatChangedId) {
            this._gsettings.disconnect(this._completeFormatChangedId);
            this._completeFormatChangedId = 0;
        }
        if (this._artPositionChangedId) {
            this._gsettings.disconnect(this._artPositionChangedId);
            this._artPositionChangedId = 0;
        }
        if (this._visPositionChangedId) {
            this._gsettings.disconnect(this._visPositionChangedId);
            this._visPositionChangedId = 0;
        }
        if (this._titleMaxLenChangedId) {
            this._gsettings.disconnect(this._titleMaxLenChangedId);
            this._titleMaxLenChangedId = 0;
        }
        if (this._artistMaxLenChangedId) {
            this._gsettings.disconnect(this._artistMaxLenChangedId);
            this._artistMaxLenChangedId = 0;
        }
        if (this._swapTextOrderChangedId) {
            this._gsettings.disconnect(this._swapTextOrderChangedId);
            this._swapTextOrderChangedId = 0;
        }
        if (this._mediaPlayingOnlyChangedId) {
            this._gsettings.disconnect(this._mediaPlayingOnlyChangedId);
            this._mediaPlayingOnlyChangedId = 0;
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
        this._mediaLabel = null;
        this._textBox = null;
        this._mediaArt = null;
        this._visualizer = null;
        this._gsettings = null;
    }
}
