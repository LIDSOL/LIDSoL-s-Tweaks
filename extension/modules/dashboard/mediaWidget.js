'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';
import { PageIndicators } from 'resource:///org/gnome/shell/ui/pageIndicators.js';
import { MprisService } from '../../utils/mprisService.js';

// #region ProgressControl

const ProgressControl = GObject.registerClass(
class ProgressControl extends St.BoxLayout {
    _init(player) {
        super._init({
            x_expand: true,
            style_class: 'dashboard-media-progress',
        });
        this._positionTracker = null;
        this._dragging = false;

        this._positionLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'dashboard-media-pos-label',
        });
        this._lengthLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'dashboard-media-length-label',
        });
        this._slider = new Slider(0);

        this._slider.connectObject(
            'drag-begin', () => {
                this._dragging = true;
                return Clutter.EVENT_PROPAGATE;
            },
            'drag-end', () => {
                player.position = Math.floor(this._slider.value) * 1000000;
                this._dragging = false;
                return Clutter.EVENT_PROPAGATE;
            },
            'scroll-event', () => Clutter.EVENT_STOP,
            'notify::value', () => {
                if (this._dragging)
                    this._updatePosition(Math.floor(this._slider.value) * 1000000);
            },
            this
        );

        this.add_child(this._positionLabel);
        this.add_child(this._slider);
        this.add_child(this._lengthLabel);

        this.connect('notify::mapped', () => this._updateTracker());
        this.connect('destroy', () => this._dropTracker());
        player.connectObject('changed', () => this._updateStatus(), this);
        this._player = player;
    }

    _updatePosition(current) {
        const currentSeconds = current !== null ? Math.floor(current / 1000000) : 0;
        const lengthSeconds = this._player.length
            ? Math.floor(this._player.length / 1000000)
            : 0;
        this._positionLabel.text = this._formatSeconds(currentSeconds);
        this._lengthLabel.text = this._formatSeconds(lengthSeconds);
        this._slider.overdriveStart = this._slider.maximumValue = lengthSeconds || 1;
        this._slider.value = currentSeconds;
    }

    _trackPosition() {
        this._slider.reactive = this._player.canSeek;
        if (this._player.isPlaying() && !this._dragging) {
            this._player.position
                .then(pos => {
                    if (pos !== null) this._updatePosition(pos);
                })
                .catch(() => {});
        }
        return GLib.SOURCE_CONTINUE;
    }

    _dropTracker() {
        if (this._positionTracker === null) return;
        GLib.source_remove(this._positionTracker);
        this._positionTracker = null;
    }

    _createTracker() {
        if (this._positionTracker !== null) return;
        this._positionTracker = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 1000,
            () => this._trackPosition()
        );
    }

    _updateTracker() {
        if (this.mapped) this._createTracker();
        else this._dropTracker();
    }

    _updateStatus() {
        if (!this.mapped) return;
        if (this._player.isPlaying())
            this._trackPosition();
    }

    _formatSeconds(seconds) {
        const mins = Math.floor(seconds / 60) % 60;
        const hours = Math.floor(seconds / 3600);
        seconds %= 60;
        const sp = seconds.toString().padStart(2, '0');
        const mp = mins.toString().padStart(2, '0');
        if (hours > 0) return `${hours}:${mp}:${sp}`;
        return `${mins}:${sp}`;
    }
});
// #endregion

// #region PlayerView

const PlayerView = GObject.registerClass(
class PlayerView extends St.BoxLayout {
    _init(player, settings) {
        super._init({
            x_expand: true,
            y_expand: true,
            style_class: 'dashboard-media-player',
        });
        this._player = player;
        this._settings = settings;

        this._coverBin = new St.Bin({
            style_class: 'dashboard-media-cover',
        });
        this.add_child(this._coverBin);

        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style_class: 'dashboard-media-info',
        });

        this._titleLabel = new St.Label({
            style_class: 'dashboard-media-title',
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        this._artistLabel = new St.Label({
            style_class: 'dashboard-media-artist',
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });

        this._progressControl = new ProgressControl(player);

        const controlsBox = new St.BoxLayout({
            style_class: 'dashboard-media-controls',
            x_align: Clutter.ActorAlign.START,
        });
        this._prevBtn = this._createButton(
            'media-skip-backward-symbolic',
            () => this._player.prev()
        );
        this._playPauseBtn = this._createButton(
            'media-playback-start-symbolic',
            () => this._player.playPause()
        );
        this._nextBtn = this._createButton(
            'media-skip-forward-symbolic',
            () => this._player.next()
        );

        controlsBox.add_child(this._prevBtn);
        controlsBox.add_child(this._playPauseBtn);
        controlsBox.add_child(this._nextBtn);

        infoBox.add_child(this._titleLabel);
        infoBox.add_child(this._artistLabel);
        infoBox.add_child(this._progressControl);
        infoBox.add_child(controlsBox);

        this.add_child(infoBox);

        player.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _createButton(iconName, callback) {
        const btn = new St.Button({
            style_class: 'dashboard-media-control-button',
        });
        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 16,
        });
        btn.set_child(icon);
        btn.connect('clicked', callback);
        return btn;
    }

    _sync() {
        const coverSize = this._settings.get_int('dashboard-media-cover-width');
        const roundness = this._settings.get_int('dashboard-media-cover-roundness');

        this._coverBin.set_style(`
            min-width: ${coverSize}px;
            min-height: ${coverSize}px;
            width: ${coverSize}px;
            height: ${coverSize}px;
            border-radius: ${roundness}px;
        `);

        if (this._player.coverArt && this._player.coverArt !== '') {
            const file = Gio.File.new_for_uri(this._player.coverArt);
            this._coverBin.set_child(new St.Icon({
                gicon: new Gio.FileIcon({ file }),
                icon_size: coverSize,
            }));
        } else {
            this._coverBin.set_child(new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: Math.round(coverSize * 0.6),
                style_class: 'dashboard-media-cover-fallback',
            }));
        }

        this._titleLabel.text = this._player.title || 'Unknown';
        this._artistLabel.text = this._player.artist || 'Unknown Artist';
        if (!this._player.trackArtists || this._player.trackArtists.length === 0)
            this._artistLabel.visible = false;
        else
            this._artistLabel.visible = true;

        const playing = this._player.playbackStatus === 'Playing';
        const icon = this._playPauseBtn.get_child();
        if (icon)
            icon.icon_name = playing
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';

        this._prevBtn.reactive = this._player.canGoPrevious;
        this._nextBtn.reactive = this._player.canGoNext;
    }

    destroy() {
        if (this._player)
            this._player.disconnectObject(this);
        super.destroy();
    }
});
// #endregion

// #region DashboardMediaWidget

var DashboardMediaWidget = GObject.registerClass({
    Signals: {
        'empty-changed': { param_types: [GObject.TYPE_BOOLEAN] },
    },
}, class DashboardMediaWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style_class: 'dashboard-media-widget',
        });
        this._settings = settings;
        this._players = [];
        this._playerViews = [];
        this._currentIndex = -1;
        this._mpris = null;

        try {
            this._mpris = MprisService.getDefault();
        } catch (e) {
            console.error('[LIDSoL Dashboard] MprisService not available:', e);
        }

        // Header with player name + page dots
        this._headerBox = new St.BoxLayout({
            style_class: 'dashboard-media-header',
            x_expand: true,
        });
        this._playerNameLabel = new St.Label({
            style_class: 'dashboard-media-player-name',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            text: 'Media',
        });
        this._headerBox.add_child(this._playerNameLabel);

        this._pageIndicator = new PageIndicators(Clutter.Orientation.HORIZONTAL);
        this._pageIndicator.x_align = Clutter.ActorAlign.END;
        this._pageIndicator.y_align = Clutter.ActorAlign.CENTER;
        this._pageIndicator.connectObject(
            'page-activated',
            (_indicator, page) => this._setCurrentPage(page),
            this
        );
        this._headerBox.add_child(this._pageIndicator);
        this.add_child(this._headerBox);

        // Content stack
        this._contentBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
        });
        this._emptyLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            x_expand: true,
            text: 'Nothing Playing',
            style_class: 'dim-label',
        });
        this._contentBox.add_child(this._emptyLabel);
        this.add_child(this._contentBox);

        this.connect('destroy', () => this._onDestroy());

        if (this._mpris) {
            this._mpris.connectObject(
                'player-added', (_mpris, player) => this._onPlayerAdded(player),
                'player-removed', (_mpris, player) => this._onPlayerRemoved(player),
                this
            );
            this._syncPlayers();
        } else {
            this._showEmpty();
        }
    }

    _onDestroy() {
        if (this._mpris)
            this._mpris.disconnectObject(this);
        for (const view of this._playerViews) {
            view.destroy();
        }
        this._playerViews = [];
        this._players = [];
    }

    _syncPlayers() {
        if (!this._mpris) {
            this._showEmpty();
            return;
        }
        for (const player of this._mpris.players) {
            if (!this._players.includes(player))
                this._addPlayerView(player);
        }
        this._updatePageIndicator();
        if (this._players.length > 0) {
            if (this._currentIndex < 0 || this._currentIndex >= this._players.length)
                this._showFirstPlaying();
            else
                this._showCurrent();
        } else {
            this._showEmpty();
        }
    }

    _onPlayerAdded(player) {
        if (this._players.includes(player))
            return;
        this._addPlayerView(player);
        this._updatePageIndicator();
        if (this._players.length === 1)
            this._setCurrentPage(0);
        this._emitEmpty();
    }

    _onPlayerRemoved(player) {
        const idx = this._players.indexOf(player);
        if (idx < 0) return;
        const view = this._playerViews[idx];
        if (view) {
            this._contentBox.remove_child(view);
            view.destroy();
        }
        this._players.splice(idx, 1);
        this._playerViews.splice(idx, 1);
        this._updatePageIndicator();
        if (this._players.length > 0) {
            if (this._currentIndex >= this._players.length)
                this._currentIndex = this._players.length - 1;
            this._showCurrent();
        } else {
            this._showEmpty();
        }
        this._emitEmpty();
    }

    _addPlayerView(player) {
        const view = new PlayerView(player, this._settings);
        this._players.push(player);
        this._playerViews.push(view);
        this._contentBox.add_child(view);
        view.hide();
    }

    _showFirstPlaying() {
        const idx = this._players.findIndex(p => p.isPlaying());
        this._setCurrentPage(idx >= 0 ? idx : 0);
    }

    _setCurrentPage(index) {
        if (index < 0 || index >= this._players.length)
            return;
        if (this._currentIndex === index)
            return;

        // Hide current
        if (this._currentIndex >= 0 && this._currentIndex < this._playerViews.length) {
            const oldView = this._playerViews[this._currentIndex];
            oldView.remove_all_transitions();
            oldView.hide();
        }

        this._currentIndex = index;
        this._emptyLabel.hide();

        const view = this._playerViews[index];
        view.remove_all_transitions();
        view.opacity = 0;
        view.show();
        view.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Update header
        const player = this._players[index];
        const appName = player.app ? player.app.get_name() : null;
        this._playerNameLabel.text = appName || player.busName.replace('org.mpris.MediaPlayer2.', '');

        this._pageIndicator.setCurrentPosition(index);
        this._updatePageIndicator();
    }

    _showCurrent() {
        this._emptyLabel.hide();
        for (let i = 0; i < this._playerViews.length; i++) {
            if (i === this._currentIndex) {
                this._playerViews[i].show();
                this._playerViews[i].opacity = 255;
            } else {
                this._playerViews[i].hide();
            }
        }
        if (this._currentIndex >= 0 && this._currentIndex < this._players.length) {
            const player = this._players[this._currentIndex];
            const appName = player.app ? player.app.get_name() : null;
            this._playerNameLabel.text = appName || player.busName.replace('org.mpris.MediaPlayer2.', '');
        }
    }

    _showEmpty() {
        this._currentIndex = -1;
        this._playerNameLabel.text = 'Media';
        for (const view of this._playerViews)
            view.hide();
        this._emptyLabel.show();
        this._pageIndicator.visible = false;
    }

    _updatePageIndicator() {
        const n = this._players.length;
        this._pageIndicator.setNPages(n);
        this._pageIndicator.visible = n > 1;
    }

    _emitEmpty() {
        this.emit('empty-changed', this._players.length === 0);
    }
});

export { DashboardMediaWidget };
// #endregion
