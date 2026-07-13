'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { MprisService } from '../../utils/mprisService.js';
import { MediaWidget } from './mediaWidget.js';

const SETTINGS = [
    'dmm-compact',
    'dmm-show-art',
    'dmm-art-size',
    'dmm-show-prev',
    'dmm-show-pause',
    'dmm-show-next',
    'dmm-control-opacity',
    'dmm-progress-enabled',
    'dmm-progress-style',
];

export class DateMenuMediaModule {
    constructor() {
        this._settings = null;
        this._widget = null;
        this._mpris = null;
        this._handlerIds = [];
        this._stylesheetFile = null;
        this._containerBox = null;
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

            const wrapper = dateMenu.menu.box.get_first_child();
            if (!wrapper)
                return;

            const menuContent = wrapper.get_first_child();
            if (!menuContent)
                return;

            this._containerBox = menuContent.get_last_child();

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
            if (this._mpris?.getActivePlayer() === player)
                this._widget?.sync(player);
        });
        this._playerChangedIds.set(player, id);
    }

    _buildWidget() {
        this._widget = new MediaWidget(this._settings, this._mpris);
    }

    _injectWidget() {
        if (!this._containerBox || !this._widget)
            return;

        this._containerBox.insert_child_at_index(this._widget, 0);
        this._sync();
    }

    _sync() {
        if (!this._widget || !this._mpris)
            return;

        const player = this._mpris.getActivePlayer();
        this._widget.sync(player);
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
                if (this._widget.get_parent())
                    this._widget.get_parent().remove_child(this._widget);
                this._widget.destroy();
                this._widget = null;
            }
            this._containerBox = null;

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
