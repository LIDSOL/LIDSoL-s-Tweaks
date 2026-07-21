'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { MprisService } from '../../utils/mprisService.js';
import { MediaWidgetBase } from '../../utils/mediaPlayer/mediaWidget.js';

var DashboardMediaWidget = GObject.registerClass({
    Signals: {
        'empty-changed': { param_types: [GObject.TYPE_BOOLEAN] },
    },
}, class DashboardMediaWidget extends MediaWidgetBase {
    _init(settings) {
        const mpris = MprisService.getDefault();
        super._init(settings, mpris);
    }

    _getStyle(name) {
        return `dashboard-media-${name}`;
    }

    _makeControlButton(iconName, callback) {
        const btn = super._makeControlButton(iconName, callback);
        btn.add_style_class_name('dashboard-media-control-button');
        return btn;
    }

    _buildCustomUI() {
        this._playerChangedIds = new Map();
        this._coverWidth = 160;
        this._coverHeight = 160;
        this._coverRoundness = 8;
        this._coverSize = 160;
        this._coverImagePath = null;

        this._coverBin = new St.Bin({
            style_class: 'dashboard-media-cover',
        });
        this._coverBin.set_child(new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: Math.round(this._coverSize * 0.6),
            style_class: 'dashboard-media-cover-fallback',
        }));
        this._syncCoverStyle();

        this._coverOverlay = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._coverOverlay.add_child(this._coverBin);

        this._bodyRow = new St.BoxLayout({
            style_class: 'dashboard-media-player',
            x_expand: true,
        });
        this._bodyRow.add_child(this._coverBin);

        this._infoCol = new St.BoxLayout({
            vertical: true,
            style_class: 'dashboard-media-info',
            x_expand: true,
        });
        this._infoCol.add_child(this._titleLabel);
        this._infoCol.add_child(this._artistLabel);

        this.remove_child(this._progress);
        this._infoCol.add_child(this._progress);
        this._infoCol.add_child(this._controls);

        this._bodyRow.add_child(this._infoCol);
        this.insert_child_at_index(this._bodyRow, 1);

        this._applyLayout();
        this._applyCoverStyle();

        this._mpris.connectObject(
            'player-added', (_mpris, player) => this._onMprisPlayerAdded(player),
            'player-removed', () => this._syncPlayers(),
            this
        );
        for (const player of this._mpris.players)
            this._connectPlayerChanged(player);
        this._syncPlayers();

        this._settings.connectObject(
            'changed::dashboard-media-style',
            () => { this._applyLayout(); this.sync(this._player); },
            'changed::dashboard-media-cover-width',
            () => { this._applyCoverStyle(); this.sync(this._player); },
            'changed::dashboard-media-cover-height',
            () => { this._applyCoverStyle(); this.sync(this._player); },
            'changed::dashboard-media-cover-roundness',
            () => { this._applyCoverStyle(); this.sync(this._player); },
            'changed::dashboard-media-show-text',
            () => { this._applyLayout(); this.sync(this._player); },
            'changed::dashboard-media-text-align',
            () => { this._applyLayout(); this.sync(this._player); },
            this
        );
    }

    // #region MPRIS Management

    _onMprisPlayerAdded(player) {
        this._connectPlayerChanged(player);
        this._syncPlayers();
    }

    _connectPlayerChanged(player) {
        if (this._playerChangedIds.has(player))
            return;
        const id = player.connect('changed', () => {
            this.onPlayerDataChanged(player);
        });
        this._playerChangedIds.set(player, id);
    }

    _syncPlayers() {
        this.setPlayers(this._mpris.players);
        this._emitEmpty();
    }

    _emitEmpty() {
        this.emit('empty-changed', this._players.length === 0);
    }

    // #endregion

    _isProgressEnabled() {
        return true;
    }

    _syncCoverStyle() {
        const isOverlay = this._settings.get_int('dashboard-media-style') === 2;
        let css = '';
        if (isOverlay) {
            css = `border-radius: ${this._coverRoundness}px; overflow: hidden;`;
        } else {
            css = `
                min-width: ${this._coverWidth}px;
                min-height: ${this._coverHeight}px;
                width: ${this._coverWidth}px;
                height: ${this._coverHeight}px;
                border-radius: ${this._coverRoundness}px;
            `;
        }
        if (this._coverImagePath) {
            css += `
                background-image: url("${this._coverImagePath}");
                background-size: cover;
                background-position: center;
            `;
        }
        this._coverBin.set_style(css);
    }

    _updateCover(player) {
        const coverUrl = player.trackCoverUrl || '';
        if (coverUrl === this._lastCoverUrl)
            return;
        this._lastCoverUrl = coverUrl;

        this._coverBin.set_child(null);
        this._coverImagePath = null;

        if (coverUrl && coverUrl.startsWith('file://')) {
            const path = decodeURIComponent(coverUrl.replace(/^file:\/\//, ''));
            this._coverImagePath = path;
            this._syncCoverStyle();
        } else if (coverUrl) {
            this._coverImagePath = null;
            this._syncCoverStyle();
            const file = Gio.File.new_for_uri(coverUrl);
            this._coverBin.set_child(new St.Icon({
                gicon: new Gio.FileIcon({ file }),
                icon_size: Math.round(this._coverSize),
            }));
        } else {
            this._syncCoverStyle();
            this._coverBin.set_child(new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: Math.round(this._coverSize * 0.6),
                style_class: 'dashboard-media-cover-fallback',
            }));
        }
    }

    _applyLayout() {
        const style = this._settings.get_int('dashboard-media-style');
        const showText = this._settings.get_boolean('dashboard-media-show-text');
        const textAlign = this._settings.get_int('dashboard-media-text-align');
        const textPos = this._settings.get_int('dashboard-media-text-position');

        const isOverlay = style === 2;

        this._titleLabel.visible = showText;
        this._artistLabel.visible = showText;

        if (isOverlay) {
            // ---- Label on Cover mode ----

            // Remove children from bodyRow if they're directly there
            for (const child of [this._coverBin, this._infoCol]) {
                if (child.get_parent() === this._bodyRow)
                    this._bodyRow.remove_child(child);
            }

            // Ensure overlay is in bodyRow
            if (this._coverOverlay.get_parent() !== this._bodyRow)
                this._bodyRow.add_child(this._coverOverlay);

            // Ensure cover + info are in overlay
            if (this._coverBin.get_parent() !== this._coverOverlay)
                this._coverOverlay.add_child(this._coverBin);
            this._coverBin.x_expand = true;
            this._coverBin.y_expand = true;

            if (this._infoCol.get_parent() !== this._coverOverlay)
                this._coverOverlay.add_child(this._infoCol);
            this._infoCol.x_align = Clutter.ActorAlign.FILL;
            this._infoCol.y_align = textPos === 0
                ? Clutter.ActorAlign.START
                : Clutter.ActorAlign.END;

            if (showText) {
                const r = this._coverRoundness;
                if (textPos === 0) {
                    this._infoCol.style =
                        `border-radius:${r}px ${r}px 0 0;overflow:hidden;`
                        + 'background-gradient-direction:vertical;'
                        + 'background-gradient-start:rgba(0,0,0,0.6);'
                        + 'background-gradient-end:transparent;'
                        + 'padding:10px 4px 26px;';
                } else {
                    this._infoCol.style =
                        `border-radius:0 0 ${r}px ${r}px;overflow:hidden;`
                        + 'background-gradient-direction:vertical;'
                        + 'background-gradient-start:transparent;'
                        + 'background-gradient-end:rgba(0,0,0,0.6);'
                        + 'padding:26px 4px 10px;';
                }
            } else {
                this._infoCol.style = 'background: transparent; padding: 0;';
            }

            this._coverOverlay.visible = true;
            this._syncCoverStyle();
        } else {
            // ---- Normal mode ----

            // Remove overlay from bodyRow
            if (this._coverOverlay.get_parent() === this._bodyRow)
                this._bodyRow.remove_child(this._coverOverlay);
            this._coverOverlay.visible = false;

            // Ensure cover and info are directly in bodyRow
            for (const child of [this._coverBin, this._infoCol]) {
                if (child.get_parent() !== this._bodyRow)
                    this._bodyRow.add_child(child);
            }

            this._bodyRow.vertical = style === 0;

            this._coverBin.x_align = style === 0
                ? Clutter.ActorAlign.CENTER
                : Clutter.ActorAlign.START;
            this._coverBin.x_expand = false;
            this._coverBin.y_expand = false;

            this._infoCol.style = '';

            let xAlign = Clutter.ActorAlign.START;
            switch (textAlign) {
            case 1: xAlign = Clutter.ActorAlign.CENTER; break;
            case 2: xAlign = Clutter.ActorAlign.END; break;
            }
            this._infoCol.x_align = xAlign;

            this._syncCoverStyle();
        }
    }

    _applyCoverStyle() {
        this._coverWidth = this._settings.get_int('dashboard-media-cover-width');
        this._coverHeight = this._settings.get_int('dashboard-media-cover-height');
        this._coverRoundness = this._settings.get_int('dashboard-media-cover-roundness');
        this._coverSize = Math.min(this._coverWidth, this._coverHeight);
        this._syncCoverStyle();
    }

    _applySettings() {
        super._applySettings();
        this._applyLayout();
        this._applyCoverStyle();
        this.set_style_class_name('dashboard-media-widget');
    }

    destroy() {
        if (this._mpris) {
            this._mpris.disconnectObject(this);
            for (const [player, id] of this._playerChangedIds) {
                try { player.disconnect(id); } catch (_) {}
            }
            this._playerChangedIds.clear();
        }
        super.destroy();
    }
});

export { DashboardMediaWidget };
