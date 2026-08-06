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

    // Keep the dashboard open when interacting with the media widget.
    // St.Widget/St.BoxLayout default to non-reactive, so presses on the
    // widget's non-reactive areas (cover, labels, empty space) used to fall
    // through to the dashboard's close-on-press handler (dashBoard.js).
    this.reactive = true;
    this.connect('button-press-event', () => Clutter.EVENT_STOP);
  }

  _getStyle(name) {
    return `dashboard-media-${name}`;
  }

  _makeControlButton(iconName, callback) {
    const btn = super._makeControlButton(iconName, callback);
    btn.add_style_class_name('dashboard-media-control-button');
    return btn;
  }

  _updatePageIndicator() {
    super._updatePageIndicator();
    this._wireDotTaps();
  }

  _wireDotTaps() {
    const ind = this._pageIndicator;
    if (!ind)
      return;
    for (const dot of ind.get_children()) {
      if (dot._tapWired)
        continue;
      dot._tapWired = true;
      dot._tapFired = false;
      // St.Button "clicked" is a Clutter gesture, which ignores synthetic/tap
      // events, so the dots would not respond to trackpad taps. Handle
      // press/release directly and keep the dashboard open while at it.
      dot.connect('button-press-event', () => {
        dot._tapFired = false;
        return Clutter.EVENT_STOP;
      });
      dot.connect('button-release-event', () => {
        const index = ind.get_children().indexOf(dot);
        if (index >= 0 && !dot._tapFired)
          ind.emit('page-activated', index);
        return Clutter.EVENT_STOP;
      });
      dot.connect('clicked', () => {
        dot._tapFired = true;
      });
    }
  }

  _buildCustomUI() {
    this._playerChangedIds = new Map();
    this._coverWidth = 100;
    this._coverHeight = 100;
    this._coverRoundness = 8;
    // Full style: Cover W/H are a percentage of the widget's default size
    // (100 = current size). The default is measured at runtime while the
    // widget is unconstrained; the scaled size is reported as the preferred
    // size so the grid grows the cell to match.
    this._defaultW = 0;
    this._defaultH = 0;
    this._targetW = 0;
    this._targetH = 0;

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

    // Expandable spacers used to center content vertically in a BoxLayout.
    // Clutter only hands extra space along the main axis to *expandable*
    // children, so a pair of them splits the slack evenly around the content.
    this._spacerTop = new St.Widget({ y_expand: true });
    this._spacerBottom = new St.Widget({ y_expand: true });

    this._bodyRow = new St.BoxLayout({
      style_class: 'dashboard-media-player',
      x_expand: true,
    });
    // Full style: measure the natural widget size while Cover W/H are at 100
    // and report the scaled size as preferred so the grid grows to match.
    this.connectObject(
      'notify::allocation', () => this._syncFullScale(),
      this
    );

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

  _setArt(url) {
    if (url) {
      this._coverContainer.set_child(this._art);
      this._art.setArt(url);
      this._art.visible = true;
      this._fallbackIcon.visible = false;
    } else {
      this._art.setArt(null);
      this._art.visible = false;
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
    for (const s of [this._spacerTop, this._spacerBottom]) {
      if (s.get_parent() === this._bodyRow)
        this._bodyRow.remove_child(s);
    }

    // The header always lives in the widget root (base class), above the
    // bodyRow. Make sure it's back there with default styling.
    if (this._header.get_parent() !== this)
      this.insert_child_at_index(this._header, 0);
    this._header.style = '';
    this._appIcon.opacity = 153;
    this._playerName.opacity = 153;
    this._playerName.style = '';
    this.remove_style_class_name('dashboard-media-full');

    // The progress row lives inside _infoCol by default (styles 0 and 2).
    // Style 1 (horizontal) relocates it below the body row so it can span
    // the full widget width instead of being squeezed next to a wide cover.
    // Restore it here on every layout pass.
    if (this._progress.get_parent() !== this._infoCol) {
      if (this._progress.get_parent())
        this._progress.get_parent().remove_child(this._progress);
      this._infoCol.insert_child_at_index(this._progress, 2);
    }
    this._progress.x_expand = false;
    this._progress.y_expand = false;
    this._progress.y_align = Clutter.ActorAlign.CENTER;

    // Full mode reorders _infoCol as [controls, progress, title, artist];
    // restore the canonical [title, artist, progress, controls] here.
    if (this._controls.get_parent() === this._infoCol)
      this._infoCol.remove_child(this._controls);
    this._infoCol.add_child(this._controls);

    this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
    this._coverContainer.x_expand = false;
    this._coverContainer.y_expand = false;
    this._coverContainer.y_align = Clutter.ActorAlign.CENTER;

    this._art.x_expand = false;
    this._art.y_expand = false;
    this._art.x_align = Clutter.ActorAlign.CENTER;
    this._art.y_align = Clutter.ActorAlign.CENTER;

    this._infoCol.x_align = Clutter.ActorAlign.START;
    this._infoCol.x_expand = false;
    this._infoCol.y_align = Clutter.ActorAlign.CENTER;
    this._infoCol.y_expand = false;

    this._titleLabel.x_align = Clutter.ActorAlign.START;
    this._artistLabel.x_align = Clutter.ActorAlign.START;
    this._progress.x_align = Clutter.ActorAlign.FILL;
    this._controls.x_align = Clutter.ActorAlign.END;

    this._bodyRow.vertical = true;
    this._bodyRow.x_align = Clutter.ActorAlign.FILL;
    this._bodyRow.x_expand = true;
    this._bodyRow.y_expand = true;
    this._bodyRow.y_align = Clutter.ActorAlign.FILL;

    this._coverOverlay.x_expand = false;
    this._coverOverlay.y_expand = false;
    this._coverOverlay.x_align = Clutter.ActorAlign.CENTER;
    this._coverOverlay.y_align = Clutter.ActorAlign.CENTER;

    this._coverGradient.visible = false;

    const isFull = style === 2;

    if (style === 0) {
      this._bodyRow.vertical = true;

      this._bodyRow.add_child(this._spacerTop);
      this._bodyRow.add_child(this._coverContainer);
      this._bodyRow.add_child(this._infoCol);
      this._bodyRow.add_child(this._spacerBottom);

      this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
      this._coverContainer.x_expand = false;
      this._coverContainer.y_expand = false;
      this._coverContainer.y_align = Clutter.ActorAlign.CENTER;

      // Art must fill the cover container exactly (coverW × coverH), so it
      // resizes with the Cover Width/Height settings instead of staying at
      // a fixed square.
      this._art.x_expand = true;
      this._art.y_expand = true;
      this._art.x_align = Clutter.ActorAlign.FILL;
      this._art.y_align = Clutter.ActorAlign.FILL;

      this._infoCol.x_align = Clutter.ActorAlign.FILL;
      this._infoCol.x_expand = true;
      this._titleLabel.x_align = Clutter.ActorAlign.CENTER;
      this._artistLabel.x_align = Clutter.ActorAlign.CENTER;
      this._progress.x_expand = true;
      this._progress.x_align = Clutter.ActorAlign.FILL;
      this._controls.x_align = Clutter.ActorAlign.CENTER;

      this._syncCoverCSS();
    } else if (style === 1) {
      this._bodyRow.vertical = false;
      this._bodyRow.x_align = Clutter.ActorAlign.FILL;
      this._bodyRow.x_expand = true;

      this._bodyRow.add_child(this._coverContainer);
      this._bodyRow.add_child(this._infoCol);

      this._coverContainer.x_align = Clutter.ActorAlign.CENTER;
      this._coverContainer.x_expand = false;
      this._coverContainer.y_expand = false;
      this._coverContainer.y_align = Clutter.ActorAlign.CENTER;

      this._art.x_expand = true;
      this._art.y_expand = true;
      this._art.x_align = Clutter.ActorAlign.FILL;
      this._art.y_align = Clutter.ActorAlign.FILL;

      this._infoCol.x_align = Clutter.ActorAlign.FILL;
      this._infoCol.x_expand = true;
      this._infoCol.y_align = Clutter.ActorAlign.CENTER;
      this._infoCol.y_expand = false;
      this._titleLabel.x_align = Clutter.ActorAlign.CENTER;
      this._artistLabel.x_align = Clutter.ActorAlign.CENTER;
      this._controls.x_align = Clutter.ActorAlign.CENTER;

      // The progress row spans the full widget width below the cover+info
      // row, so the slider has room even when the cover is wide.
      if (this._progress.get_parent() === this._infoCol)
        this._infoCol.remove_child(this._progress);
      this.add_child(this._progress);
      this._progress.x_expand = true;
      this._progress.x_align = Clutter.ActorAlign.FILL;
      this._progress.y_expand = false;
      this._progress.y_align = Clutter.ActorAlign.CENTER;

      this._syncCoverCSS();
    } else if (isFull) {
      this._bodyRow.vertical = true;

      // Full style: the widget (with its container) is scaled by Cover
      // Width / Cover Height as a percentage of its default size (100x100 =
      // current size). The overlay fills the whole widget so the art is
      // always expanded and cropped (cover effect) to whatever size the
      // widget gets. Everything (art, gradient, text, progress, controls)
      // is stacked inside the overlay.
      this._coverOverlay.x_expand = true;
      this._coverOverlay.y_expand = true;
      this._coverOverlay.x_align = Clutter.ActorAlign.FILL;
      this._coverOverlay.y_align = Clutter.ActorAlign.FILL;

      this._coverOverlay.add_child(this._coverContainer);
      this._coverContainer.x_expand = true;
      this._coverContainer.y_expand = true;
      this._coverContainer.x_align = Clutter.ActorAlign.FILL;
      this._coverContainer.y_align = Clutter.ActorAlign.FILL;
      this._art.x_expand = true;
      this._art.y_expand = true;
      this._art.x_align = Clutter.ActorAlign.FILL;
      this._art.y_align = Clutter.ActorAlign.FILL;

      // Gradient only when Fade is enabled; it fills the overlay, i.e. the
      // exact same area as the cover art. Smooth from the top, a bit
      // stronger towards the bottom (see _syncCoverCSS).
      this._coverGradient.x_expand = true;
      this._coverGradient.y_expand = true;
      this._coverGradient.x_align = Clutter.ActorAlign.FILL;
      this._coverGradient.y_align = Clutter.ActorAlign.FILL;
      this._coverOverlay.add_child(this._coverGradient);
      this._coverGradient.visible = showFade;

      this._coverOverlay.add_child(this._infoCol);
      this._infoCol.x_expand = true;
      this._infoCol.x_align = Clutter.ActorAlign.FILL;
      this._infoCol.y_align = Clutter.ActorAlign.END;
      this._infoCol.y_expand = false;

      const pad = showText ? 'padding:20px 6px 8px;' : 'padding:0 6px 4px;';
      this._infoCol.style = `overflow:hidden;${pad}`;

      // Full mode: _infoCol is ordered [controls, progress, title, artist].
      // The reset block above restores the canonical order on the next pass.
      if (this._controls.get_parent() === this._infoCol)
        this._infoCol.remove_child(this._controls);
      this._infoCol.insert_child_at_index(this._controls, 0);
      if (this._progress.get_parent() === this._infoCol)
        this._infoCol.remove_child(this._progress);
      this._infoCol.insert_child_at_index(this._progress, 1);

      // The overlay fills the bodyRow on its own; no centering spacers needed.
      this._bodyRow.add_child(this._coverOverlay);
      this._coverOverlay.visible = true;

      // Full style drops the widget padding so the art is flush with the
      // widget's edges (see .dashboard-media-full in stylesheet.css).
      this.add_style_class_name('dashboard-media-full');

      this._syncCoverCSS();
    }
  }

  _syncCoverCSS() {
    const style = this._settings.get_int('dashboard-media-style');
    const isFull = style === 2;
    const r = this._coverRoundness;

    if (isFull) {
      this._coverContainer.set_style(`
                border-radius: ${r}px;
                overflow: hidden;
            `);
      this._coverGradient.set_style(`
                background-gradient-direction: vertical;
                background-gradient-start: rgba(0,0,0,0);
                background-gradient-end: rgba(0,0,0,0.70);
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

    // Every style keeps the widget expanded to its grid cell; in Full the
    // Cover W/H scale is applied through the preferred-size vfuncs (see
    // _syncFullScale), not inline CSS, so no styles are left over when
    // switching modes.
    this.x_expand = true;
    this.x_align = Clutter.ActorAlign.FILL;
    this.set_size(-1, -1);
    this.set_style('');

    this._coverOverlay.set_size(-1, -1);

    // Preferred size only; the art is expanded to fill its container, so the
    // rendered size is exactly coverW × coverH in the non-full styles.
    const size = Math.min(this._coverWidth, this._coverHeight);
    this._art.size = size;
    this._art.roundness = this._coverRoundness;
    this._fallbackIcon.icon_size = Math.round(Math.min(this._coverWidth, this._coverHeight) * 0.6);

    this._syncCoverCSS();
    this._syncFullScale();
  }

  // Full style: Cover Width / Cover Height scale the whole widget as a
  // percentage of its default (100) size. While a dimension is at 100 its
  // natural allocation is captured as the baseline; when it differs from 100
  // the scaled size is stored in _targetW/_targetH and reported by
  // vfunc_get_preferred_* so the grid grows the cell to match.
  _syncFullScale() {
    const isFull = this._settings && this._settings.get_int('dashboard-media-style') === 2;
    if (!isFull) {
      this._targetW = 0;
      this._targetH = 0;
      return;
    }
    const w = Math.floor(this.get_width());
    const h = Math.floor(this.get_height());
    if (w < 1 || h < 1)
      return;
    const cw = this._coverWidth;
    const ch = this._coverHeight;
    const wDefault = cw === 100;
    const hDefault = ch === 100;

    if (wDefault)
      this._defaultW = w;
    if (hDefault)
      this._defaultH = h;
    if (this._defaultW < 1)
      this._defaultW = w;
    if (this._defaultH < 1)
      this._defaultH = h;

    const tw = wDefault ? 0 : Math.max(1, Math.round((this._defaultW * cw) / 100));
    const th = hDefault ? 0 : Math.max(1, Math.round((this._defaultH * ch) / 100));
    if (tw !== this._targetW || th !== this._targetH) {
      this._targetW = tw;
      this._targetH = th;
      this.queue_relayout();
    }
  }

  // Full style: report the scaled widget size (Cover W/H as a percentage of
  // the default) so the grid grows the cell to match. When a dimension is at
  // 100 no target is set and the natural size is used (100 = current size).
  vfunc_get_preferred_width(forHeight) {
    const isFull = this._settings && this._settings.get_int('dashboard-media-style') === 2;
    if (!isFull || this._targetW < 1)
      return super.vfunc_get_preferred_width(forHeight);
    return [this._targetW, this._targetW];
  }

  vfunc_get_preferred_height(forWidth) {
    const isFull = this._settings && this._settings.get_int('dashboard-media-style') === 2;
    if (!isFull || this._targetH < 1)
      return super.vfunc_get_preferred_height(forWidth);
    return [this._targetH, this._targetH];
  }

  _applySettings() {
    super._applySettings();
    this._applyLayout();
    this._applyDimensions();
    // add_style_class_name (not set_style_class_name) so the layout-added
    // 'dashboard-media-full' class survives (set_* replaces the whole list).
    this.add_style_class_name('dashboard-media-widget');
  }

  destroy() {
    if (this._bodyRow)
      this._bodyRow.disconnectObject(this);
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
