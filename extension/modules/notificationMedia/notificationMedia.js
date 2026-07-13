'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import { MediaPlayerManager } from '../../utils/mediaPlayer/mediaManager.js';

function _formatTime(secs) {
    if (!secs || secs < 0) return '0:00';
    let t = Math.floor(secs);
    let m = Math.floor(t / 60);
    let s = t % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

var MediaNotificationWidget = GObject.registerClass({
    Signals: { 'close-media': {} },
}, class MediaNotificationWidget extends MessageList.Message {
    _init(params = {}) {
        const source = new MessageList.Source();
        super._init(source);

        this._manager = MediaPlayerManager.getDefault();
        this._currentCoverUrl = null;
        this._settings = params.settings || null;
        this._progressInterval = 0;

        this.add_style_class_name('nm-media-widget');

        // Playback controls (native style via MessageList.Message.addMediaControl)
        this._prevBtn = this.addMediaControl('media-skip-backward-symbolic', () => {
            let p = this._manager.getActivePlayer();
            if (p) p.prev();
        });

        this._playBtn = this.addMediaControl('media-playback-start-symbolic', () => {
            let p = this._manager.getActivePlayer();
            if (p) p.playPause();
        });

        this._nextBtn = this.addMediaControl('media-skip-forward-symbolic', () => {
            let p = this._manager.getActivePlayer();
            if (p) p.next();
        });

        // Progress bar — insert after .message-box in the message layout
        this._progressBox = new St.BoxLayout({
            vertical: false,
            style_class: 'nm-progress-box',
        });
        this._timeLabel = new St.Label({ style_class: 'nm-time', text: '0:00' });
        this._sliderBin = new St.Widget({
            style_class: 'nm-slider-bin',
            reactive: true,
            track_hover: true,
            x_expand: true,
        });
        this._sliderFill = new St.Widget({ style_class: 'nm-slider-fill', x_expand: true });
        this._sliderBin.add_child(this._sliderFill);
        this._durationLabel = new St.Label({ style_class: 'nm-time', text: '0:00' });
        this._progressBox.add_child(this._timeLabel);
        this._progressBox.add_child(this._sliderBin);
        this._progressBox.add_child(this._durationLabel);

        // Insert into the message vbox, between .message-box and .message-action-bin
        let vbox = this.get_child();
        vbox.insert_child_at_index(this._progressBox, 2);

        // Slider drag
        let drag = 0;
        this._sliderBin.connect('button-press-event', (actor, event) => {
            if (!this._canSeek) return Clutter.EVENT_PROPAGATE;
            drag = 1;
            this._updateSliderFromEvent(event);
            return Clutter.EVENT_STOP;
        });
        this._sliderBin.connect('motion-event', (actor, event) => {
            if (drag) this._updateSliderFromEvent(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this._sliderBin.connect('button-release-event', () => {
            if (drag && this._canSeek) {
                let p = this._manager.getActivePlayer();
                if (p) p.seek(this._dragPosition);
            }
            drag = 0;
            return Clutter.EVENT_STOP;
        });

        // Manager signals
        this._manager.connectObject(
            'media-changed', () => this._updateContent(),
            'player-changed', () => this._updateContent(),
            this
        );

        // Settings
        if (this._settings) {
            this._settings.connectObject(
                'changed::nm-compact', () => this._applySettings(),
                'changed::nm-control-opacity', () => this._applySettings(),
                'changed::nm-show-next', () => this._applySettings(),
                'changed::nm-show-prev', () => this._applySettings(),
                'changed::nm-show-pause', () => this._applySettings(),
                'changed::nm-progress-enabled', () => this._applySettings(),
                'changed::nm-progress-style', () => this._applySettings(),
                this
            );
        }

        this._applySettings();
        this._updateContent();
    }

    vfunc_clicked() {
        let player = this._manager.getActivePlayer();
        if (player && player.raise)
            player.raise();
        Main.panel.closeCalendar();
    }

    _applySettings() {
        if (!this._settings) return;
        let compact = this._settings.get_boolean('nm-compact');
        this.toggle_style_class_name('nm-compact', compact);

        let opacity = this._settings.get_int('nm-control-opacity');
        let alpha = Math.max(0, Math.min(255, opacity)) / 255;
        this._mediaControls.opacity = Math.round(alpha * 255);

        this._prevBtn.visible = this._settings.get_boolean('nm-show-prev');
        this._playBtn.visible = this._settings.get_boolean('nm-show-pause');
        this._nextBtn.visible = this._settings.get_boolean('nm-show-next');

        let prog = this._settings.get_boolean('nm-progress-enabled');
        this._progressBox.visible = prog;
        if (!prog) this._stopProgressInterval();

        let style = this._settings.get_string('nm-progress-style');
        if (style === 'slim') {
            this._sliderBin.add_style_class_name('nm-slider-slim');
            this._sliderBin.remove_style_class_name('nm-slider-default');
        } else {
            this._sliderBin.add_style_class_name('nm-slider-default');
            this._sliderBin.remove_style_class_name('nm-slider-slim');
        }
    }

    _updateContent() {
        try {
            let meta = this._manager.getActivePlayerMeta();
            if (!meta || !meta.playbackStatus || meta.playbackStatus === 'Stopped') {
                this.visible = false;
                this._stopProgressInterval();
                return;
            }

            // Set source title (player name)
            let player = this._manager.getActivePlayer();
            if (player) {
                this.source.title = player.getAppName?.() || player.busName || 'Music';
            }

            // Album art via Message's icon
            let cover = meta.coverUrl;
            if (cover && cover !== this._currentCoverUrl) {
                this._currentCoverUrl = cover;
                let cached = this._manager.getArtUrl(cover);
                let fileUrl = cached || cover;
                if (fileUrl.startsWith('file://'))
                    fileUrl = fileUrl.slice(7);
                let file = Gio.File.new_for_path(fileUrl);
                if (file.query_exists(null))
                    this.icon = new Gio.FileIcon({ file });
                else
                    this.icon = new Gio.ThemedIcon({ name: 'audio-x-generic-symbolic' });
            } else if (!cover && !this._currentCoverUrl) {
                this.icon = new Gio.ThemedIcon({ name: 'audio-x-generic-symbolic' });
            }

            // Title and artist via Message's native setters
            this.title = meta.title || '';
            this.body = meta.artist || '';

            // Play/pause icon
            this._playBtn.child.icon_name = meta.isPlaying
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';

            this._canSeek = !!player?.canSeek;

            this._refreshProgress();

            if (!this._progressInterval && this._settings?.get_boolean('nm-progress-enabled')) {
                this._progressInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    this._refreshProgress();
                    return GLib.SOURCE_CONTINUE;
                });
            }

            this.visible = true;
            console.log(`[NM widget] showing: ${meta.title} — ${meta.artist}`);
        } catch (e) {
            console.error('[NM widget] _updateContent error:', e);
        }
    }

    _refreshProgress() {
        try {
            let meta = this._manager.getActivePlayerMeta();
            if (!meta || !this._settings?.get_boolean('nm-progress-enabled')) return;
            let pos = meta.position || 0;
            let len = meta.length || 0;
            this._timeLabel.text = _formatTime(pos);
            this._durationLabel.text = _formatTime(len);
            if (len > 0) {
                let pct = Math.min(1, Math.max(0, pos / len));
                let w = this._sliderBin.get_width();
                this._sliderFill.set_width(Math.round(pct * w));
            }
        } catch (e) {
            console.error('[NM widget] _refreshProgress error:', e);
        }
    }

    _updateSliderFromEvent(event) {
        let [ok, x] = event.get_coords();
        if (!ok) return;
        let [bx, by] = this._sliderBin.get_transformed_position();
        let w = this._sliderBin.get_width();
        if (w < 1) return;
        let pct = Math.max(0, Math.min(1, (x - bx) / w));
        let meta = this._manager.getActivePlayerMeta();
        let len = (meta && meta.length) || 0;
        this._dragPosition = Math.round(pct * len * 1000000);
        this._sliderFill.set_width(Math.round(pct * w));
    }

    _stopProgressInterval() {
        if (this._progressInterval) {
            GLib.source_remove(this._progressInterval);
            this._progressInterval = 0;
        }
    }

    destroy() {
        this._stopProgressInterval();
        if (this._settings) this._settings.disconnectObject(this);
        this._manager.disconnectObject(this);
        super.destroy();
    }
});

export { MediaNotificationWidget };
