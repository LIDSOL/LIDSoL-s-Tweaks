'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { MprisService } from '../../utils/mprisService.js';
import { MediaWidgetBase } from '../../utils/mediaPlayer/mediaWidget.js';
import { AlbumArt } from '../../utils/mediaPlayer/albumArt.js';

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

        this._art = new AlbumArt({ size: this._coverWidth, roundness: this._coverRoundness });

        this._fallbackIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: Math.round(Math.min(this._coverWidth, this._coverHeight) * 0.6),
            style_class: 'dashboard-media-cover-fallback',
            visible: false,
        });

        this._coverContainer = new St.Bin({
            style_class: 'dashboard-media-cover',
        });
        this._coverContainer.set_child(this._art);

        this._coverOverlay = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            visible: false,
        });

        this._bodyRow = new St.BoxLayout({
            style_class: 'dashboard-media-player',
            x_expand: true,
        });

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

        this._bodyRow.add_child(this._coverContainer);
        this._bodyRow.add_child(this._infoCol);
        this.insert_child_at_index(this._bodyRow, 1);

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
            () => { this._applyDimensions(); this._applyLayout(); this.sync(this._player); },
            'changed::dashboard-media-cover-height',
            () => { this._applyDimensions(); this._applyLayout(); this.sync(this._player); },
            'changed::dashboard-media-cover-roundness',
            () => { this._applyDimensions(); this.sync(this._player); },
            'changed::dashboard-media-show-text',
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

    _updateCover(player) {
        const coverUrl = player.trackCoverUrl || '';
        if (coverUrl === this._lastCoverUrl)
            return;
        this._lastCoverUrl = coverUrl;

        if (coverUrl) {
            const cachedUrl = this._mpris?.getCachedArtUrl
                ? this._mpris.getCachedArtUrl(coverUrl)
                : null;
            this._coverContainer.set_child(this._art);
            this._art.setArt(cachedUrl || coverUrl);
            this._fallbackIcon.visible = false;
        } else {
            this._art.setArt(null);
            this._coverContainer.set_child(this._fallbackIcon);
            this._fallbackIcon.visible = true;
        }
    }

    _applyLayout() {
        const style = this._settings.get_int('dashboard-media-style');
        const showText = this._settings.get_boolean('dashboard-media-show-text');

        this._titleLabel.visible = showText;
        this._artistLabel.visible = showText;

        for (const child of [this._coverContainer, this._infoCol]) {
            if (child.get_parent() === this._bodyRow)
                this._bodyRow.remove_child(child);
        }
        if (this._coverOverlay.get_parent() === this._bodyRow)
            this._bodyRow.remove_child(this._coverOverlay);
        this._coverOverlay.visible = false;

        for (const child of [this._coverContainer, this._infoCol]) {
            if (child.get_parent() === this._coverOverlay)
                this._coverOverlay.remove_child(child);
        }

        this._coverOverlay.style = '';
        this._infoCol.style = '';

        const isNormalVertical = style === 0;
        const isNormalHorizontal = style === 1;
        const isOverlay = style === 2 || style === 4;

        if (isNormalVertical || isNormalHorizontal) {
            this._bodyRow.vertical = isNormalVertical;

            this._bodyRow.add_child(this._coverContainer);
            this._bodyRow.add_child(this._infoCol);

            this._coverContainer.x_align = isNormalVertical
                ? Clutter.ActorAlign.CENTER
                : Clutter.ActorAlign.START;
            this._coverContainer.x_expand = false;
            this._coverContainer.y_expand = false;

            this._infoCol.x_align = Clutter.ActorAlign.START;
            this._syncCoverCSS();
        } else if (isOverlay) {
            this._bodyRow.vertical = true;

            this._coverOverlay.add_child(this._coverContainer);
            this._coverContainer.x_expand = true;
            this._coverContainer.y_expand = true;

            this._coverOverlay.add_child(this._infoCol);
            this._infoCol.x_align = Clutter.ActorAlign.FILL;
            this._infoCol.y_align = Clutter.ActorAlign.END;

            if (showText) {
                const r = this._coverRoundness;
                this._infoCol.style =
                    `border-radius:0 0 ${r}px ${r}px;overflow:hidden;`
                    + 'background-gradient-direction:vertical;'
                    + 'background-gradient-start:transparent;'
                    + 'background-gradient-end:rgba(0,0,0,0.6);'
                    + 'padding:26px 4px 10px;';
            } else {
                this._infoCol.style = 'background: transparent; padding: 0;';
            }

            this._bodyRow.add_child(this._coverOverlay);
            this._coverOverlay.visible = true;

            this._syncCoverCSS();
        } else {
            this._bodyRow.vertical = true;
            this._bodyRow.add_child(this._coverContainer);
            this._bodyRow.add_child(this._infoCol);
            this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
            this._coverContainer.x_expand = false;
            this._coverContainer.y_expand = false;
            this._syncCoverCSS();
        }
    }

    _syncCoverCSS() {
        const style = this._settings.get_int('dashboard-media-style');
        const isOverlay = style === 2 || style === 4;

        if (isOverlay) {
            this._coverContainer.set_style(
                `border-radius: ${this._coverRoundness}px; overflow: hidden;`
            );
        } else {
            this._coverContainer.set_style(`
                min-width: ${this._coverWidth}px;
                min-height: ${this._coverHeight}px;
                width: ${this._coverWidth}px;
                height: ${this._coverHeight}px;
                border-radius: ${this._coverRoundness}px;
                overflow: hidden;
            `);
        }
    }

    _applyDimensions() {
        this._coverWidth = this._settings.get_int('dashboard-media-cover-width');
        this._coverHeight = this._settings.get_int('dashboard-media-cover-height');
        this._coverRoundness = this._settings.get_int('dashboard-media-cover-roundness');

        const size = Math.min(this._coverWidth, this._coverHeight);
        this._art.size = size;
        this._art.roundness = this._coverRoundness;
        this._fallbackIcon.icon_size = Math.round(size * 0.6);

        this._syncCoverCSS();
    }

    _applySettings() {
        super._applySettings();
        this._applyLayout();
        this._applyDimensions();
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
