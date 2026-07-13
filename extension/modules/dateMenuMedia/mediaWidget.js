'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

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

            this._buildUI();
            this._applySettings();
        }

        _buildUI() {
            // Header row: page indicators
            this._header = new St.BoxLayout({
                style_class: 'dmm-header',
                x_align: Clutter.ActorAlign.FILL,
            });
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

            this._sliderBin = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true,
                reactive: true,
                style_class: 'dmm-slider-bin',
            });
            this._progress.add_child(this._sliderBin);

            this._sliderFill = new St.Widget({
                style_class: 'dmm-slider-fill',
                x_align: Clutter.ActorAlign.START,
                y_expand: true,
            });
            this._sliderBin.add_child(this._sliderFill);

            this._durationLabel = new St.Label({
                style_class: 'dmm-duration',
                text: '0:00',
            });
            this._progress.add_child(this._durationLabel);

            this._sliderBin.connect('button-press-event', (actor, event) => {
                return this._onSliderDown(actor, event);
            });
            this._sliderBin.connect('motion-event', (actor, event) => {
                return this._onSliderMotion(actor, event);
            });
            this._sliderBin.connect('button-release-event', (actor, event) => {
                return this._onSliderUp(actor, event);
            });

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

        sync(player) {
            this._player = player;

            if (!player) {
                this.visible = false;
                this._stopPositionTimer();
                return;
            }

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
            if (pos !== null) {
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

            const pct = Math.min(1, Math.max(0, pos / length));
            const binWidth = this._sliderBin.get_width();
            if (binWidth > 0) {
                this._sliderFill.set_style(`width: ${Math.round(pct * binWidth)}px;`);
            }
        }

        _onSliderDown(actor, event) {
            this._isDragging = true;
            this._seekToEvent(actor, event);
            return Clutter.EVENT_STOP;
        }

        _onSliderMotion(actor, event) {
            if (this._isDragging) {
                this._seekToEvent(actor, event);
            }
            return Clutter.EVENT_STOP;
        }

        _onSliderUp(actor, event) {
            if (this._isDragging) {
                this._seekToEvent(actor, event, true);
                this._isDragging = false;
            }
            return Clutter.EVENT_STOP;
        }

        _seekToEvent(actor, event, commit = false) {
            const [bx, by] = actor.get_transformed_position();
            const [bw] = actor.get_size();
            const [, stageX] = event.get_coords();
            const pct = Math.max(0, Math.min(1, (stageX - bx) / bw));

            const length = this._player?._length || 0;
            const seekPos = Math.round(pct * length);

            if (commit && this._player) {
                this._player.position = seekPos;
            }

            const binWidth = actor.get_width();
            if (binWidth > 0) {
                this._sliderFill.set_style(`width: ${Math.round(pct * binWidth)}px;`);
            }
            this._timeLabel.text = formatTime(seekPos);
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
        }

        updateSettings(settings) {
            this._settings = settings;
            this._applySettings();
            this.sync(this._player);
        }

        destroy() {
            this._stopPositionTimer();
            super.destroy();
        }
    }
);
