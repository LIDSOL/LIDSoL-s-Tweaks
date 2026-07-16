'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { MprisService } from '../../utils/mprisService.js';
import { MediaWidget } from './mediaWidget.js';

const SETTINGS = [
    'dmm-compact',
    'dmm-auto-switch',
    'dmm-show-art',
    'dmm-art-size',
    'dmm-album-roundness',
    'dmm-show-prev',
    'dmm-show-pause',
    'dmm-show-next',
    'dmm-control-opacity',
    'dmm-progress-enabled',
    'dmm-progress-style',
    'dmm-gradient-enabled',
    'dmm-gradient-start-opaque',
    'dmm-gradient-start-mix',
    'dmm-gradient-end-opaque',
    'dmm-gradient-end-mix',
    'dmm-slider-handle-radius',
    'dmm-slider-bar-height',
    'dmm-slider-active-color',
    'dmm-slider-background-color',
    'dmm-round-clip-enabled',
    'dmm-round-clip-radius',
];

export class DateMenuMediaModule {
    constructor() {
        this._settings = null;
        this._widget = null;
        this._mpris = null;
        this._handlerIds = [];
        this._stylesheetFile = null;
        this._messageView = null;
        this._playerChangedIds = new Map();
    }

    enable(gsettings, extension) {
        try {
            this._settings = gsettings;
            this._extension = extension;

            this._loadStylesheet();

            const dateMenu = Main.panel.statusArea.dateMenu;
            if (!dateMenu)
                return;

            const msgList = dateMenu._messageList;
            if (!msgList)
                return;

            this._messageView = msgList._messageView;
            if (!this._messageView)
                return;

            this._initMpris();
            this._buildWidget();
            this._injectWidget();
            this._connectSettings();
        } catch (e) {
            console.error('[DateMenuMedia] enable error:', e);
        }
    }

    _initMpris() {
        this._mpris = MprisService.getDefault();
        if (!this._mpris)
            return;

        this._mpris.connectObject(
            'player-added', (mpris, player) => this._onPlayerAdded(player),
            'player-removed', () => this._sync(),
            this
        );

        for (const player of this._mpris.players) {
            this._connectPlayerChanged(player);
        }
    }

    _onPlayerAdded(player) {
        this._connectPlayerChanged(player);
        this._sync();
    }

    _connectPlayerChanged(player) {
        if (this._playerChangedIds.has(player))
            return;
        const id = player.connect('changed', () => {
            this._widget?.onPlayerDataChanged(player);
        });
        this._playerChangedIds.set(player, id);
    }

    _buildWidget() {
        this._widget = new MediaWidget(this._settings, this._mpris);
    }

    _injectWidget() {
        if (!this._messageView || !this._widget)
            return;

        // Provide methods that MessageView expects on messages[]
        this._widget.canClose = () => false;

        // Wrap in St.Bin like native _addMessageAtIndex
        const item = new St.Bin({
            child: this._widget,
            canFocus: false,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
        });

        // Insert into MessageView at index 0 (top, same as native MediaMessage)
        this._messageView.add_child(item);
        this._messageView.messages.unshift(this._widget);

        // Notify message list that emptiness may have changed
        if (this._messageView._messagesChanged)
            this._messageView._messagesChanged();

        this._sync();
    }

    _sync() {
        if (!this._widget || !this._mpris)
            return;

        this._widget.setPlayers(this._mpris.players);
    }

    _connectSettings() {
        this._handlerIds = SETTINGS.map(key =>
            this._settings.connect(`changed::${key}`, () => {
                this._widget?.updateSettings(this._settings);
            })
        );
    }

    _loadStylesheet() {
        if (!this._extension)
            return;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/dateMenuMedia/dateMenuMedia.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    disable() {
        try {
            this._handlerIds.forEach(id => {
                if (this._settings)
                    this._settings.disconnect(id);
            });
            this._handlerIds = [];

            if (this._mpris) {
                this._mpris.disconnectObject(this);
                for (const [player, id] of this._playerChangedIds) {
                    player.disconnect(id);
                }
                this._playerChangedIds.clear();
                this._mpris = null;
            }

            if (this._widget) {
                const bin = this._widget.get_parent();
                if (bin && this._messageView) {
                    // Remove from messages array
                    const idx = this._messageView.messages.indexOf(this._widget);
                    if (idx >= 0)
                        this._messageView.messages.splice(idx, 1);

                    // Remove bin from MessageView
                    this._messageView.remove_child(bin);
                    bin.destroy();
                }
                this._widget.destroy();
                this._widget = null;
            }
            this._messageView = null;

            if (this._stylesheetFile) {
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
                this._stylesheetFile = null;
            }

            this._settings = null;
            this._extension = null;
        } catch (e) {
            console.error('[DateMenuMedia] disable error:', e);
        }
    }
}
