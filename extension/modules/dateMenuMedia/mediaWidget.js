'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';
import { PageIndicators } from 'resource:///org/gnome/shell/ui/pageIndicators.js';

import { CrossfadeArt } from '../dateMenu/crossfadeArt.js';

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

export const MediaWidget = GObject.registerClass(
    class MediaWidget extends St.BoxLayout {
        _init(settings, mpris) {
            super._init({
                vertical: true,
                style_class: 'dmm-widget',
                visible: true,
            });

            this._settings = settings;
            this._mpris = mpris;
            this._player = null;
            this._lastTitle = '';
            this._lastArtist = '';
            this._lastCoverUrl = '';
            this._positionTimer = null;
            this._isDragging = false;
            this._cachedColors = new Map();

            this._slider = null;
            this._gradientStyle = '';
            this._roundClipRadius = 0;
            this._players = [];
            this._currentIndex = -1;
            this._userSelected = false;

            this._buildUI();
            this._applySettings();
        }

        _buildUI() {
            // Header row: app icon + player name + page indicators
            this._header = new St.BoxLayout({
                style_class: 'dmm-header',
                x_align: Clutter.ActorAlign.FILL,
            });

            this._appIcon = new St.Icon({
                icon_name: 'application-x-executable-symbolic',
                icon_size: 16,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'dmm-app-icon',
            });
            this._header.add_child(this._appIcon);

            this._playerName = new St.Label({
                style_class: 'dmm-player-name',
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });
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

            // Art + Info row
            const bodyRow = new St.BoxLayout({
                style_class: 'dmm-body',
                x_align: Clutter.ActorAlign.FILL,
                y_align: Clutter.ActorAlign.START,
            });
            this.add_child(bodyRow);

            this._artSize = 64;

            // Album art
            this._art = new CrossfadeArt(this._artSize / 2);
            this._art.visible = false;
            bodyRow.add_child(this._art);

            // Info column
            const infoCol = new St.BoxLayout({
                vertical: true,
                style_class: 'dmm-info',
                y_expand: true,
                x_expand: true,
            });
            bodyRow.add_child(infoCol);

            // Title + Artist
            this._titleLabel = new St.Label({
                style_class: 'dmm-title',
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
            });
            infoCol.add_child(this._titleLabel);

            this._artistLabel = new St.Label({
                style_class: 'dmm-artist',
                text: '',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
            });
            infoCol.add_child(this._artistLabel);

            // Progress bar (hidden initially)
            this._progress = new St.BoxLayout({
                style_class: 'dmm-progress',
                visible: false,
            });
            this.add_child(this._progress);

            this._timeLabel = new St.Label({
                style_class: 'dmm-time',
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
                    if (this._player) {
                        const pos = Math.floor(this._slider.value) * 1000000;
                        this._player.position = pos;
                    }
                    this._isDragging = false;
                    return Clutter.EVENT_PROPAGATE;
                },
                'notify::value', () => {
                    if (this._isDragging) {
                        const pos = Math.floor(this._slider.value) * 1000000;
                        this._timeLabel.text = formatTime(pos);
                    }
                },
                'scroll-event', () => Clutter.EVENT_STOP,
                this
            );

            this._durationLabel = new St.Label({
                style_class: 'dmm-duration',
                text: '0:00',
            });
            this._progress.add_child(this._durationLabel);

            // Controls row
            this._controls = new St.BoxLayout({
                style_class: 'dmm-controls',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._controls);

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
        }

        _makeControlButton(iconName, callback) {
            const btn = new St.Button({
                style_class: 'dmm-control-btn message-media-control',
                child: new St.Icon({ icon_name: iconName, icon_size: 20 }),
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

        // #region Multi-Player Management

        setPlayers(players) {
            this._players = players || [];
            this._updatePageIndicator();
            if (this._currentIndex < 0 || this._currentIndex >= this._players.length) {
                this._userSelected = false;
                this._showLastActive();
            } else {
                this._updateHeader();
            }
        }

        onPlayerDataChanged(player) {
            if (player === this._player) {
                this.sync(this._player);
            } else if (!this._userSelected) {
                const currentScore = this._scorePlayer(this._player);
                const changedScore = this._scorePlayer(player);
                if (changedScore > currentScore) {
                    const idx = this._players.indexOf(player);
                    if (idx >= 0)
                        this._setCurrentPlayer(idx, true);
                }
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
            // Prefer currently playing over paused/stopped with older timestamp
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
            this._currentIndex = index;
            this._player = this._players[index];
            this._pageIndicator.setCurrentPosition(index);
            this._updateHeader();
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
                this._appIcon.icon_name = 'application-x-executable-symbolic';
                return;
            }
            const app = player.app;
            if (app && app.get_icon()) {
                this._appIcon.gicon = app.get_icon();
                this._appIcon.icon_name = '';
            } else {
                this._appIcon.icon_name = 'audio-x-generic-symbolic';
            }
            const appName = app ? app.get_name() : null;
            this._playerName.text = appName || player.busName.replace('org.mpris.MediaPlayer2.', '');
        }

        // #endregion

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
            const coverUrl = player.trackCoverUrl || '';

            if (title !== this._lastTitle || artist !== this._lastArtist) {
                this._lastTitle = title;
                this._lastArtist = artist;
                this._titleLabel.text = title;
                this._artistLabel.text = artist;
            }

            if (coverUrl !== this._lastCoverUrl) {
                this._lastCoverUrl = coverUrl;
                if (this._settings.get_boolean('dmm-show-art')) {
                    if (coverUrl) {
                        const cachedUrl = this._mpris?.getCachedArtUrl
                            ? this._mpris.getCachedArtUrl(coverUrl)
                            : null;
                        this._art.setArt(cachedUrl || coverUrl);
                        this._art.visible = true;
                    } else {
                        this._art.setArt(null);
                        this._art.visible = false;
                    }
                } else {
                    this._art.visible = false;
                }
            }

            // Update play/pause icon
            const iconName = player.isPlaying()
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            const icon = this._pauseBtn.get_child();
            if (icon && icon.icon_name !== iconName)
                icon.icon_name = iconName;

            // Reactive state for prev/next
            this._prevBtn.reactive = !!player.canGoPrevious;
            this._nextBtn.reactive = !!player.canGoNext;

            // Position timer
            if (this._settings.get_boolean('dmm-progress-enabled') && player.playbackStatus === 'Playing') {
                this._startPositionTimer();
            } else {
                this._stopPositionTimer();
                if (player._length) {
                    this._updateProgressDisplay(this._lastKnownPosition || 0, player._length);
                }
            }

            // Update gradient + inline styles
            this._updateGradient();
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
            if (!this._player)
                return;

            const pos = await this._player.position;
            if (pos !== null && !this._isDragging) {
                this._lastKnownPosition = pos;
                this._updateProgressDisplay(pos, this._player._length || 0);
            }
        }

        _updateProgressDisplay(pos, length) {
            const showProgress = this._settings.get_boolean('dmm-progress-enabled');
            this._progress.visible = showProgress && length > 0;

            if (!showProgress || length <= 0)
                return;

            this._timeLabel.text = formatTime(pos);
            this._durationLabel.text = formatTime(length);

            const currentSec = pos / 1000000;
            const lengthSec = length / 1000000;
            this._slider.overdriveStart = lengthSec;
            this._slider.maximumValue = lengthSec;
            this._slider.value = currentSec;
        }

        _updateGradient() {
            this._gradientStyle = '';
            if (!this._settings.get_boolean('dmm-gradient-enabled')) {
                this._applyInlineStyles();
                return;
            }

            const coverUrl = this._player?.trackCoverUrl;
            if (!coverUrl || coverUrl.endsWith('.svg')) {
                this._applyInlineStyles();
                return;
            }

            if (!coverUrl.startsWith('file://')) {
                this._applyInlineStyles();
                return;
            }

            const path = decodeURIComponent(coverUrl.replace(/^file:\/\//, ''));
            let colorTask = this._cachedColors.get(path);
            if (!colorTask) {
                try {
                    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, 128, 128);
                    colorTask = this._getMeanColor(pixbuf);
                    this._cachedColors.set(path, colorTask);
                } catch (_) {
                    this._applyInlineStyles();
                    return;
                }
            }

            colorTask.then(color => {
                if (!color || !this._cachedColors)
                    return;
                const [r, g, b] = color;
                const startOpa = this._settings.get_int('dmm-gradient-start-opaque') / 1000;
                const endOpa = this._settings.get_int('dmm-gradient-end-opaque') / 1000;
                const startMix = this._settings.get_int('dmm-gradient-start-mix') / 1000;
                const endMix = this._settings.get_int('dmm-gradient-end-mix') / 1000;

                const bgR = 30, bgG = 30, bgB = 30;

                this._gradientStyle = ''
                    + `background-gradient-direction:horizontal;`
                    + `background-gradient-start:rgba(${Math.round(bgR + (r - bgR) * startMix)},${Math.round(bgG + (g - bgG) * startMix)},${Math.round(bgB + (b - bgB) * startMix)},${startOpa});`
                    + `background-gradient-end:rgba(${Math.round(bgR + (r - bgR) * endMix)},${Math.round(bgG + (g - bgG) * endMix)},${Math.round(bgB + (b - bgB) * endMix)},${endOpa});`;
                this._applyInlineStyles();
            }).catch(() => {});
        }

        _getMeanColor(pixbuf) {
            return new Promise(resolve => {
                const w = pixbuf.get_width();
                const h = pixbuf.get_height();
                const pixels = pixbuf.get_pixels();
                const rowstride = pixbuf.get_rowstride();
                const nChannels = pixbuf.get_n_channels();

                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                const skip = 4;

                for (let y = 0; y < h; y += skip) {
                    for (let x = 0; x < w; x += skip) {
                        const idx = y * rowstride + x * nChannels;
                        rSum += pixels[idx];
                        gSum += pixels[idx + 1];
                        bSum += pixels[idx + 2];
                        count++;
                    }
                }

                if (count === 0) {
                    resolve(null);
                    return;
                }

                resolve([
                    Math.round(rSum / count),
                    Math.round(gSum / count),
                    Math.round(bSum / count),
                ]);
            });
        }

        _updateSliderStyle() {
            const style = this._settings.get_string('dmm-progress-style');
            const isSlim = style === 'slim';
            const handleRadius = this._settings.get_int('dmm-slider-handle-radius');
            const barHeight = this._settings.get_int('dmm-slider-bar-height');
            const activeColor = this._settings.get_string('dmm-slider-active-color');
            const bgColor = this._settings.get_string('dmm-slider-background-color');

            let css = '';

            if (isSlim) {
                css += '-slider-handle-radius:0px;';
                css += `color:${activeColor || '-st-accent-color'};`;
            } else {
                css += `-slider-handle-radius:${handleRadius}px;`;
                if (activeColor)
                    css += `color:${activeColor};`;
            }

            css += `-barlevel-height:${barHeight}px;`;

            if (activeColor && isSlim)
                css += `-barlevel-active-background-color:${activeColor};`;
            if (bgColor)
                css += `-barlevel-background-color:${bgColor};`;

            this._slider.style = css;
        }

        _applySettings() {
            const compact = this._settings.get_boolean('dmm-compact');
            this.set_style_class_name(compact ? 'dmm-widget dmm-compact' : 'dmm-widget');

            const opacity = this._settings.get_int('dmm-control-opacity');
            const alpha = Math.max(0, Math.min(255, opacity));
            this._prevBtn.opacity = alpha;
            this._pauseBtn.opacity = alpha;
            this._nextBtn.opacity = alpha;

            const showPrev = this._settings.get_boolean('dmm-show-prev');
            const showPause = this._settings.get_boolean('dmm-show-pause');
            const showNext = this._settings.get_boolean('dmm-show-next');
            this._prevBtn.visible = showPrev;
            this._pauseBtn.visible = showPause;
            this._nextBtn.visible = showNext;

            const showArt = this._settings.get_boolean('dmm-show-art');
            const artSize = this._settings.get_int('dmm-art-size');
            if (artSize !== this._artSize) {
                this._artSize = artSize;
                this._art._radius = artSize / 2;
                this._art._size = artSize;
                this._art.refreshStyle();
            }
            if (!showArt)
                this._art.visible = false;
            else if (this._lastCoverUrl)
                this._art.visible = true;

            const progStyle = this._settings.get_string('dmm-progress-style');
            this._progress.style_class = progStyle === 'default'
                ? 'dmm-progress dmm-progress-default'
                : 'dmm-progress';

            this._updateSliderStyle();
            this._updateRoundClip();
            this._updateGradient();
            this._applyInlineStyles();
        }

        _updateRoundClip() {
            const enabled = this._settings.get_boolean('dmm-round-clip-enabled');
            this._roundClipRadius = enabled ? this._settings.get_int('dmm-round-clip-radius') : 0;
        }

        _applyInlineStyles() {
            let css = '';
            if (this._roundClipRadius > 0)
                css += `border-radius:${this._roundClipRadius}px;`;
            css += this._gradientStyle || '';
            this.style = css;
        }

        updateSettings(settings) {
            this._cachedColors.clear();
            this._settings = settings;
            this._applySettings();
            this.sync(this._player);
        }

        destroy() {
            this._stopPositionTimer();
            if (this._slider)
                this._slider.disconnectObject(this);
            super.destroy();
        }
    }
);
