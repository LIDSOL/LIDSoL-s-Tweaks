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
        this._coverSize = 160;

        this._coverBin = new St.Bin({
            style_class: 'dashboard-media-cover',
        });
        this._coverBin.set_child(new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: Math.round(this._coverSize * 0.6),
            style_class: 'dashboard-media-cover-fallback',
        }));

        const bodyRow = new St.BoxLayout({
            style_class: 'dashboard-media-player',
            x_expand: true,
        });
        bodyRow.add_child(this._coverBin);

        const infoCol = new St.BoxLayout({
            vertical: true,
            style_class: 'dashboard-media-info',
            x_expand: true,
        });
        infoCol.add_child(this._titleLabel);
        infoCol.add_child(this._artistLabel);

        this.remove_child(this._progress);
        infoCol.add_child(this._progress);

        bodyRow.add_child(infoCol);
        infoCol.add_child(this._controls);

        this.insert_child_at_index(bodyRow, 1);

        this._applyCoverStyle();

        // Set up MPRIS signal connections
        this._mpris.connectObject(
            'player-added', (_mpris, player) => this._onMprisPlayerAdded(player),
            'player-removed', () => this._syncPlayers(),
            this
        );
        for (const player of this._mpris.players)
            this._connectPlayerChanged(player);
        this._syncPlayers();
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
            const file = Gio.File.new_for_uri(coverUrl);
            this._coverBin.set_child(new St.Icon({
                gicon: new Gio.FileIcon({ file }),
                icon_size: Math.round(this._coverSize),
            }));
        } else {
            this._coverBin.set_child(new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: Math.round(this._coverSize * 0.6),
                style_class: 'dashboard-media-cover-fallback',
            }));
        }
    }

    _applyCoverStyle() {
        const coverSize = this._settings.get_int('dashboard-media-cover-width');
        const roundness = this._settings.get_int('dashboard-media-cover-roundness');
        this._coverSize = coverSize;
        this._coverBin.set_style(`
            min-width: ${coverSize}px;
            min-height: ${coverSize}px;
            width: ${coverSize}px;
            height: ${coverSize}px;
            border-radius: ${roundness}px;
        `);
    }

    _applySettings() {
        super._applySettings();
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
