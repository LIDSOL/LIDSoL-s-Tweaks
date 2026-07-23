'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
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

    this._titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    this._artistLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

    this._art = new AlbumArt({ size: this._coverWidth, roundness: this._coverRoundness });

    this._fallbackIcon = new St.Icon({
      icon_name: 'audio-x-generic-symbolic',
      icon_size: Math.round(Math.min(this._coverWidth, this._coverHeight) * 0.6),
      style_class: 'dashboard-media-cover-fallback',
      visible: false,
    });

    this._coverContainer = new St.Bin({
      style_class: 'dashboard-media-cover',
      clip_to_allocation: true,
    });
    this._coverContainer.set_child(this._art);

    this._coverOverlay = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      x_expand: true,
      y_expand: true,
      visible: false,
    });

    this._coverGradient = new St.Widget({
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
      'players-changed', () => this._syncPlayers(),
      this
    );
    for (const player of this._mpris.players)
      this._connectPlayerChanged(player);
    this._syncPlayers();

    this._settings.connectObject(
      'changed::dashboard-media-style',
      () => { this._lastCoverUrl = null; this._applyDimensions(); this._applyLayout(); this.sync(this._player); },
      'changed::dashboard-media-cover-width',
      () => { this._applyDimensions(); this._applyLayout(); this.sync(this._player); },
      'changed::dashboard-media-cover-height',
      () => { this._applyDimensions(); this._applyLayout(); this.sync(this._player); },
      'changed::dashboard-media-cover-roundness',
      () => { this._applyDimensions(); this.sync(this._player); },
      'changed::dashboard-media-show-text',
      () => { this._applyLayout(); this.sync(this._player); },
      'changed::dashboard-media-fade',
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
      this._coverContainer.set_child(this._art);
      this._art.setArt(coverUrl);
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
    const showFade = this._settings.get_boolean('dashboard-media-fade');

    this._titleLabel.visible = showText;
    this._artistLabel.visible = showText;

    for (const child of [this._coverContainer, this._infoCol]) {
      if (child.get_parent() === this._bodyRow)
        this._bodyRow.remove_child(child);
    }
    if (this._coverOverlay.get_parent() === this._bodyRow)
      this._bodyRow.remove_child(this._coverOverlay);
    this._coverOverlay.visible = false;

    for (const child of [this._coverContainer, this._infoCol, this._coverGradient]) {
      if (child.get_parent() === this._coverOverlay)
        this._coverOverlay.remove_child(child);
    }

    this._coverOverlay.style = '';
    this._infoCol.style = '';
    this._coverGradient.style = '';

    // Reset all layout properties to safe defaults before applying mode
    this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
    this._coverContainer.x_expand = false;
    this._coverContainer.y_expand = false;

    this._art.x_expand = false;
    this._art.y_expand = false;

    this._infoCol.x_align = Clutter.ActorAlign.START;
    this._infoCol.x_expand = false;
    this._infoCol.y_align = Clutter.ActorAlign.CENTER;
    this._infoCol.y_expand = false;

    this._bodyRow.vertical = true;
    this._bodyRow.x_align = Clutter.ActorAlign.FILL;
    this._bodyRow.x_expand = true;

    this._coverGradient.visible = false;

    const isFull = style === 2;

    if (style === 0) {
      this._bodyRow.vertical = true;

      this._bodyRow.add_child(this._coverContainer);
      this._bodyRow.add_child(this._infoCol);

      this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
      this._coverContainer.x_expand = false;
      this._coverContainer.y_expand = false;

      this._infoCol.x_align = Clutter.ActorAlign.CENTER;
      this._infoCol.x_expand = false;
      this._titleLabel.x_align = Clutter.ActorAlign.CENTER;
      this._artistLabel.x_align = Clutter.ActorAlign.CENTER;
      this._progress.x_align = Clutter.ActorAlign.CENTER;
      this._controls.x_align = Clutter.ActorAlign.CENTER;

      this._syncCoverCSS();
    } else if (style === 1) {
      this._bodyRow.vertical = false;
      this._bodyRow.x_align = Clutter.ActorAlign.CENTER;
      this._bodyRow.x_expand = false;

      this._bodyRow.add_child(this._coverContainer);
      this._bodyRow.add_child(this._infoCol);

      this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
      this._coverContainer.x_expand = false;
      this._coverContainer.y_expand = false;

      this._infoCol.x_align = Clutter.ActorAlign.CENTER;
      this._infoCol.x_expand = false;
      this._titleLabel.x_align = Clutter.ActorAlign.CENTER;
      this._artistLabel.x_align = Clutter.ActorAlign.CENTER;
      this._progress.x_align = Clutter.ActorAlign.CENTER;
      this._controls.x_align = Clutter.ActorAlign.CENTER;

      this._syncCoverCSS();
    } else if (isFull) {
      this._bodyRow.vertical = true;

      this._coverOverlay.add_child(this._coverContainer);
      this._coverContainer.x_expand = true;
      this._coverContainer.y_expand = true;
      this._coverContainer.x_align = Clutter.ActorAlign.FILL;
      this._art.x_expand = true;
      this._art.y_expand = true;

      // Gradient only when Fade is enabled
      this._coverGradient.x_expand = true;
      this._coverGradient.y_expand = true;
      this._coverGradient.x_align = Clutter.ActorAlign.FILL;
      this._coverOverlay.add_child(this._coverGradient);
      this._coverGradient.visible = showFade;

      this._coverOverlay.add_child(this._infoCol);
      this._infoCol.x_expand = true;
      this._infoCol.x_align = Clutter.ActorAlign.FILL;
      this._infoCol.y_align = Clutter.ActorAlign.END;
      this._infoCol.y_expand = false;

      const pad = showText ? 'padding:20px 6px 8px;' : 'padding:0 6px 4px;';
      this._infoCol.style = `overflow:hidden;${pad}`;

      this._bodyRow.add_child(this._coverOverlay);
      this._coverOverlay.visible = true;

      this._syncCoverCSS();
    }
  }

  _syncCoverCSS() {
    const style = this._settings.get_int('dashboard-media-style');
    const isFull = style === 2;
    const r = this._coverRoundness;

    if (isFull) {
      this._coverContainer.set_style(`
                min-height: ${this._coverHeight + 40}px;
                border-radius: ${r}px;
                overflow: hidden;
            `);
      this._coverGradient.set_style(`
                background-gradient-direction: vertical;
                background-gradient-start: transparent;
                background-gradient-end: rgba(0,0,0,0.7);
                border-radius: 0 0 ${r}px ${r}px;
            `);
    } else {
      this._coverContainer.set_style(`
                min-width: ${this._coverWidth}px;
                min-height: ${this._coverHeight}px;
                width: ${this._coverWidth}px;
                height: ${this._coverHeight}px;
                border-radius: ${r}px;
                overflow: hidden;
            `);
    }
  }

  _applyDimensions() {
    this._coverWidth = this._settings.get_int('dashboard-media-cover-width');
    this._coverHeight = this._settings.get_int('dashboard-media-cover-height');
    this._coverRoundness = this._settings.get_int('dashboard-media-cover-roundness');

    const style = this._settings.get_int('dashboard-media-style');
    const isFull = style === 2;

    // In Full mode, art fills the larger container
    const size = isFull
      ? Math.min(this._coverWidth + 40, this._coverHeight + 40)
      : Math.min(this._coverWidth, this._coverHeight);
    this._art.size = size;
    this._art.roundness = this._coverRoundness;
    this._fallbackIcon.icon_size = Math.round(Math.min(this._coverWidth, this._coverHeight) * 0.6);

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
        try { player.disconnect(id); } catch (_) { }
      }
      this._playerChangedIds.clear();
    }
    super.destroy();
  }
});

export { DashboardMediaWidget };
