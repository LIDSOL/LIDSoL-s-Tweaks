'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';
import { PageIndicators } from 'resource:///org/gnome/shell/ui/pageIndicators.js';

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;

const formatTime = (micros) => {
    if (!micros || micros <= 0)
        return '0:00';
    const totalSec = Math.floor(micros / 1000000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
};

export const MediaWidgetBase = GObject.registerClass(
    class MediaWidgetBase extends St.BoxLayout {
        _init(settings, mpris) {
            super._init({
                vertical: true,
                x_expand: true,
                visible: true,
            });

            this._settings = settings;
            this._mpris = mpris;
            this._players = [];
            this._currentIndex = -1;
            this._userSelected = false;
            this._prevStatuses = new Map();
            this._playerProgress = new Map();

            this._positionTimer = null;
            this._isDragging = false;

            this._player = null;
            this._lastTitle = '';
            this._lastArtist = '';
            this._lastCoverUrl = '';

            this._slider = null;

            // Built by subclasses
            this._appIcon = null;
            this._playerName = null;
            this._titleLabel = null;
            this._artistLabel = null;
            this._art = null;
            this._header = null;

            this._buildCommonUI();
            this._buildCustomUI();
            this._applySettings();
        }

        // #region Common UI

        _buildCommonUI() {
            this._header = new St.BoxLayout({
                style_class: this._getStyle('header'),
                x_align: Clutter.ActorAlign.FILL,
            });

            this._appIcon = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: 16,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: this._getStyle('app-icon'),
            });
            this._appIcon.opacity = 153;
            this._header.add_child(this._appIcon);

            this._playerName = new St.Label({
                style_class: this._getStyle('player-name'),
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._playerName.opacity = 153;
            this._header.add_child(this._playerName);

            this._pageIndicator = new PageIndicators(Clutter.Orientation.HORIZONTAL);
            this._pageIndicator.x_align = Clutter.ActorAlign.END;
            this._pageIndicator.y_align = Clutter.ActorAlign.CENTER;
            this._pageIndicator.connectObject(
                'page-activated', (_ind, page) => {
                    this._userSelected = true;
                    this._setCurrentPlayer(page);
                },
                this
            );
            this._header.add_child(this._pageIndicator);

            this.add_child(this._header);

            // Title + artist labels (not parented until subclass layout)
            this._titleLabel = new St.Label({
                style_class: this._getStyle('title'),
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
                y_expand: true,
            });
            this._artistLabel = new St.Label({
                style_class: this._getStyle('artist'),
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
                y_expand: true,
            });

            // Controls
            this._controls = new St.BoxLayout({
                style_class: this._getStyle('controls'),
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._prevBtn = this._makeControlButton('media-skip-backward-symbolic', () => {
                this._player?.prev();
            });
            this._controls.add_child(this._prevBtn);

            this._pauseBtn = this._makeControlButton('media-playback-start-symbolic', () => {
                this._player?.playPause();
            });
            this._controls.add_child(this._pauseBtn);

            this._nextBtn = this._makeControlButton('media-skip-forward-symbolic', () => {
                this._player?.next();
            });
            this._controls.add_child(this._nextBtn);

            // Progress bar (hidden until needed)
            this._progress = new St.BoxLayout({
                style_class: this._getStyle('progress'),
                visible: false,
            });
            this.add_child(this._progress);

            this._timeLabel = new St.Label({
                style_class: this._getStyle('time'),
                text: '0:00',
            });
            this._progress.add_child(this._timeLabel);

            this._slider = new Slider(0);
            this._slider.x_expand = true;
            this._slider.reactive = true;
            this._progress.add_child(this._slider);

            this._slider.connectObject(
                'drag-begin', () => {
                    this._isDragging = true;
                    return Clutter.EVENT_PROPAGATE;
                },
                'drag-end', () => {
                    if (this._player && this._player._length) {
                        const lengthSec = this._player._length / 1000000;
                        const pos = Math.floor(this._slider.value * lengthSec) * 1000000;
                        this._player.position = pos;
                        this._playerProgress.set(this._player, {
                            position: pos,
                            length: this._player._length,
                        });
                    }
                    this._isDragging = false;
                    return Clutter.EVENT_PROPAGATE;
                },
                'notify::value', () => {
                    if (this._isDragging && this._player?._length) {
                        const lengthSec = this._player._length / 1000000;
                        const pos = Math.floor(this._slider.value * lengthSec) * 1000000;
                        this._timeLabel.text = formatTime(pos);
                    }
                },
                'scroll-event', () => Clutter.EVENT_STOP,
                this
            );

            this._durationLabel = new St.Label({
                style_class: this._getStyle('duration'),
                text: '0:00',
            });
            this._progress.add_child(this._durationLabel);
        }

        _makeControlButton(iconName, callback) {
            const btn = new St.Button({
                style_class: 'message-media-control',
                child: new St.Icon({ icon_name: iconName, icon_size: 14 }),
                reactive: true,
                can_focus: true,
                track_hover: true,
            });
            btn.connect('button-press-event', () => Clutter.EVENT_STOP);
            btn.connect('button-release-event', () => {
                callback();
                return Clutter.EVENT_STOP;
            });
            return btn;
        }

        // Override in subclass to provide style class prefix (e.g. 'dmm-', 'dashboard-media-')
        _getStyle(name) {
            return this._stylePrefix ? `${this._stylePrefix}-${name}` : '';
        }

        // #endregion

        // #region Hooks for subclasses

        _buildCustomUI() {}
        _onPlayerChanged(player) {}
        _onSync(player) {}
        _applyCustomSettings() {}

        // #endregion

        // #region Player Management

        setPlayers(players) {
            const oldCount = this._players.length;
            this._players = players || [];

            for (const player of this._prevStatuses.keys()) {
                if (!this._players.includes(player)) {
                    this._prevStatuses.delete(player);
                    this._playerProgress.delete(player);
                }
            }

            this._updatePageIndicator();
            if (this._currentIndex < 0 || this._currentIndex >= this._players.length) {
                this._userSelected = false;
                this._showLastActive();
            } else {
                this._updateHeader();
                if (this._players.length > oldCount) {
                    const autoSwitch = this._autoSwitchEnabled();
                    if (autoSwitch) {
                        const best = this._findLastActiveIndex();
                        if (best >= 0 && best !== this._currentIndex) {
                            const bestScore = this._scorePlayer(this._players[best]);
                            const curScore = this._scorePlayer(this._player);
                            if (bestScore > curScore)
                                this._setCurrentPlayer(best, true);
                        }
                    }
                }
            }
        }

        onPlayerDataChanged(player) {
            const prevStatus = this._prevStatuses.get(player);
            const currStatus = player.playbackStatus;
            this._prevStatuses.set(player, currStatus);

            if (player === this._player) {
                this.sync(this._player);
                return;
            }

            const autoSwitch = this._autoSwitchEnabled();
            if (!autoSwitch)
                return;

            const startedPlaying = currStatus === 'Playing' && prevStatus !== 'Playing';
            const hasRealTitle = !!player.trackTitle && player.trackTitle !== 'Unknown title';

            if (this._userSelected) {
                if (!startedPlaying || !hasRealTitle)
                    return;
                const idx = this._players.indexOf(player);
                if (idx >= 0)
                    this._setCurrentPlayer(idx, true);
                return;
            }

            const changedScore = this._scorePlayer(player);
            const currentScore = this._scorePlayer(this._player);
            if (changedScore > currentScore) {
                const idx = this._players.indexOf(player);
                if (idx >= 0)
                    this._setCurrentPlayer(idx, true);
            }
        }

        _scorePlayer(p) {
            if (!p) return -1;
            const hasTitle = !!p.trackTitle && p.trackTitle !== 'Unknown title';
            if (p.isPlaying() && hasTitle) return 500;
            if (p.playbackStatus === 'Paused' && hasTitle) return 100;
            return 0;
        }

        _findLastActiveIndex() {
            if (this._players.length === 0)
                return -1;
            let bestIdx = 0;
            let bestScore = -1;
            let bestTime = 0;
            for (let i = 0; i < this._players.length; i++) {
                const p = this._players[i];
                const score = this._scorePlayer(p);
                const time = p.lastPlayingTime || 0;
                if (score > bestScore || (score === bestScore && time > bestTime)) {
                    bestScore = score;
                    bestTime = time;
                    bestIdx = i;
                }
            }
            if (this._players[bestIdx].playbackStatus !== 'Playing') {
                const playingIdx = this._players.findIndex(
                    p => p.isPlaying() && !!p.trackTitle && p.trackTitle !== 'Unknown title'
                );
                if (playingIdx >= 0)
                    return playingIdx;
            }
            return bestScore > 0 ? bestIdx : 0;
        }

        _showLastActive() {
            if (this._players.length === 0) {
                this._currentIndex = -1;
                this.sync(null);
                return;
            }
            this._setCurrentPlayer(this._findLastActiveIndex(), true);
        }

        _setCurrentPlayer(index, auto = false) {
            if (index < 0 || index >= this._players.length)
                return;
            if (this._currentIndex === index && this._player === this._players[index])
                return;

            this._saveCurrentProgress();

            this._currentIndex = index;
            this._player = this._players[index];
            this._pageIndicator.setCurrentPosition(index);
            this._updateHeader();
            this._onPlayerChanged(this._player);
            this.sync(this._player);
            if (!auto)
                this._userSelected = true;
        }

        _updatePageIndicator() {
            const n = this._players.length;
            this._pageIndicator.setNPages(n);
            this._pageIndicator.visible = n > 1;
        }

        _updateHeader() {
            const player = this._player;
            if (!player) {
                this._playerName.text = '';
                this._appIcon.icon_name = 'audio-x-generic-symbolic';
                return;
            }
            const entry = player.entry;
            if (entry)
                this._appIcon.icon_name = entry + '-symbolic';
            else
                this._appIcon.icon_name = 'audio-x-generic-symbolic';
            this._playerName.text = player.identity || player.busName.replace('org.mpris.MediaPlayer2.', '');
        }

        // #endregion

        // #region Sync

        sync(player) {
            if (!player) {
                this.visible = false;
                this._stopPositionTimer();
                return;
            }

            if (player !== this._player)
                return;

            this.visible = true;

            const title = player.trackTitle || '';
            const artist = player.trackArtists ? player.trackArtists.join(', ') : '';

            if (title !== this._lastTitle || artist !== this._lastArtist) {
                this._lastTitle = title;
                this._lastArtist = artist;
                if (this._titleLabel) {
                    this._titleLabel.text = title;
                    this._artistLabel.text = artist;
                }
                const saved = this._playerProgress.get(player);
                if (saved) {
                    saved.position = 0;
                    saved.length = player._length || 0;
                }
            }

            this._updateCover(player);
            this._updateControls(player);

            const saved = this._playerProgress.get(player);
            const length = player._length || 0;
            const position = saved ? saved.position : 0;
            this._updateProgressDisplay(position, length);

            if (this._isProgressEnabled() && length > 0)
                this._startPositionTimer();
            else
                this._stopPositionTimer();

            this._onSync(player);
        }

        _updateCover(player) {}
        _updateControls(player) {
            if (!player)
                return;
            const iconName = player.isPlaying()
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            const icon = this._pauseBtn.get_child();
            if (icon && icon.icon_name !== iconName)
                icon.icon_name = iconName;
            this._prevBtn.reactive = !!player.canGoPrevious;
            this._nextBtn.reactive = !!player.canGoNext;
        }

        // #endregion

        // #region Settings hooks (override in subclass)

        _isProgressEnabled() { return false; }
        _autoSwitchEnabled() { return true; }

        _applySettings() {
            this._applyControlVisibility();
            this._applyControlOpacity();
        }

        _applyControlVisibility() {}
        _applyControlOpacity() {}

        // #endregion

        // #region Progress Tracking

        _saveCurrentProgress() {
            if (!this._player)
                return;
            const saved = this._playerProgress.get(this._player);
            const pos = saved ? saved.position : 0;
            this._playerProgress.set(this._player, {
                position: pos,
                length: this._player._length || 0,
            });
        }

        _startPositionTimer() {
            if (this._positionTimer)
                return;
            this._updatePosition();
            this._positionTimer = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                1000,
                () => {
                    this._updatePosition();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _stopPositionTimer() {
            if (this._positionTimer) {
                GLib.source_remove(this._positionTimer);
                this._positionTimer = null;
            }
        }

        async _updatePosition() {
            const promises = this._players.map(async (p) => {
                try {
                    const pos = await p.position;
                    if (pos !== null && !this._isDragging) {
                        this._playerProgress.set(p, {
                            position: pos,
                            length: p._length || 0,
                        });
                        if (p === this._player)
                            this._updateProgressDisplay(pos, p._length || 0);
                    }
                } catch (_) { }
            });
            await Promise.all(promises);
        }

        _updateProgressDisplay(pos, length) {
            if (!this._isProgressEnabled()) {
                this._progress.visible = false;
                return;
            }

            this._timeLabel.text = formatTime(pos);
            this._durationLabel.text = formatTime(length);
            const currentSec = pos / 1000000;
            const lengthSec = length / 1000000;
            const ratio = lengthSec > 0 ? Math.min(currentSec / lengthSec, 1) : 0;
            this._slider.value = ratio;
            this._progress.visible = true;
        }

        // #endregion

        // #region Lifecycle

        updateSettings(settings) {
            this._settings = settings;
            this._applySettings();
            this.sync(this._player);
        }

        destroy() {
            this._stopPositionTimer();
            this._playerProgress.clear();
            if (this._slider)
                this._slider.disconnectObject(this);
            super.destroy();
        }

        // #endregion
    }
);

export { formatTime };
