'use strict';

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { CrossfadeArt } from '../dateMenu/crossfadeArt.js';
import { MediaWidgetBase } from '../../utils/mediaPlayer/mediaWidget.js';

export const MediaWidget = GObject.registerClass(
    class MediaWidget extends MediaWidgetBase {
        _init(settings, mpris) {
            super._init(settings, mpris);
        }

        _getStyle(name) {
            return `dmm-${name}`;
        }

        _buildCustomUI() {
            this._cachedColors = new Map();
            this._artSize = 64;
            this._gradientStyle = '';
            this._roundClipRadius = 0;

            // Add dmm-specific style class to control buttons
            this._prevBtn.add_style_class_name('dmm-control-btn');
            this._pauseBtn.add_style_class_name('dmm-control-btn');
            this._nextBtn.add_style_class_name('dmm-control-btn');

            const bodyRow = new St.BoxLayout({
                style_class: 'dmm-body',
                x_align: Clutter.ActorAlign.FILL,
            });

            this._art = new CrossfadeArt(this._artSize / 2);
            this._art.set_style('margin-left: 6px;');
            this._art.visible = false;
            bodyRow.add_child(this._art);

            const infoCol = new St.BoxLayout({
                vertical: true,
                style_class: 'dmm-info',
                x_expand: true,
            });
            infoCol.add_child(this._titleLabel);
            infoCol.add_child(this._artistLabel);
            bodyRow.add_child(infoCol);

            bodyRow.add_child(this._controls);

            this.insert_child_at_index(bodyRow, 1);
        }

        _setArt(url) {
            if (!this._settings.get_boolean('dmm-show-art')) {
                this._art.visible = false;
                return;
            }
            if (url) {
                this._art.setArt(url);
                this._art.visible = true;
            } else {
                this._art.setArt(null);
                this._art.visible = false;
            }
        }

        _onSync(player) {
            this._updateGradient();
        }

        _isProgressEnabled() {
            return this._settings.get_boolean('dmm-progress-enabled');
        }

        _autoSwitchEnabled() {
            return this._settings.get_boolean('dmm-auto-switch');
        }

        _applyControlVisibility() {
            this._prevBtn.visible = this._settings.get_boolean('dmm-show-prev');
            this._pauseBtn.visible = this._settings.get_boolean('dmm-show-pause');
            this._nextBtn.visible = this._settings.get_boolean('dmm-show-next');
        }

        _applyControlOpacity() {
            const alpha = Math.max(0, Math.min(255,
                this._settings.get_int('dmm-control-opacity')));
            for (const btn of [this._prevBtn, this._pauseBtn, this._nextBtn]) {
                const icon = btn.get_child();
                if (icon)
                    icon.opacity = alpha;
            }
        }

        _applySettings() {
            super._applySettings();

            const compact = this._settings.get_boolean('dmm-compact');
            this.set_style_class_name(
                compact ? 'dmm-widget dmm-compact' : 'dmm-widget'
            );

            const showArt = this._settings.get_boolean('dmm-show-art');
            const artSize = this._settings.get_int('dmm-art-size');
            const roundness = this._settings.get_int('dmm-album-roundness');
            if (artSize !== this._artSize || roundness !== this._art._roundness) {
                this._artSize = artSize;
                this._art._roundness = roundness;
                this._art._size = artSize;
                this._art.refreshStyle();
            }
            if (!showArt)
                this._art.visible = false;
            else if (this._lastCoverUrl)
                this._art.visible = true;

            const progStyle = this._settings.get_string('dmm-progress-style');
            this._progress.style_class = progStyle === 'default'
                ? `${this._getStyle('progress')} ${this._getStyle('progress-default')}`
                : this._getStyle('progress');

            this._updateSliderStyle();
            this._updateRoundClip();
            this._updateGradient();
            this._applyInlineStyles();
        }

        // #region Private helpers

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

        _updateRoundClip() {
            const enabled = this._settings.get_boolean('dmm-round-clip-enabled');
            this._roundClipRadius = enabled
                ? this._settings.get_int('dmm-round-clip-radius')
                : 0;
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
                    Math.round(gSum / count),
                ]);
            });
        }

        _applyInlineStyles() {
            let css = '';
            if (this._gradientStyle) {
                css += this._gradientStyle;
            } else {
                css += 'background-color:#54545A;';
            }
            if (this._roundClipRadius > 0)
                css += `border-radius:${this._roundClipRadius}px;`;
            this.style = css;
        }

        // #endregion

        updateSettings(settings) {
            this._cachedColors.clear();
            super.updateSettings(settings);
        }

        destroy() {
            this._cachedColors.clear();
            super.destroy();
        }
    }
);
