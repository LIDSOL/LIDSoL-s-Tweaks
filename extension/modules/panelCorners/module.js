'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SignalManager } from '../../core/signalManager.js';
import { SettingsManager, SettingType } from '../../core/settingsManager.js';
import { PanelCorners } from './panelCorner.js';
import { ScreenCorners } from './screenCorner.js';

const Keys = ([
    { type: SettingType.BOOLEAN, name: 'panel-corners' },
    { type: SettingType.INTEGER, name: 'panel-corner-radius' },
    { type: SettingType.INTEGER, name: 'panel-corner-border-width' },
    { type: SettingType.STRING, name: 'panel-corner-background-color' },
    { type: SettingType.DOUBLE, name: 'panel-corner-opacity' },

    { type: SettingType.BOOLEAN, name: 'screen-corners' },
    { type: SettingType.INTEGER, name: 'screen-corner-radius' },
    { type: SettingType.STRING, name: 'screen-corner-background-color' },
    { type: SettingType.DOUBLE, name: 'screen-corner-opacity' },

    { type: SettingType.BOOLEAN, name: 'force-extension-values' },
    { type: SettingType.BOOLEAN, name: 'debug' },
]);

export class PanelCornersModule {
    constructor() {
        this._settings = null;
        this._connections = null;
        this._panelCorners = null;
        this._screenCorners = null;
    }

    enable(gsettings) {
        this._settings = new SettingsManager(Keys, gsettings);
        this._settings._keys = Keys;
        this._settings._settings = gsettings;
        
        this._connections = new SignalManager();

        this._log('starting up...');

        this._connections.connect(
            Main.layoutManager,
            'monitors-changed',
            () => this._update()
        );

        this._connections.connect(
            global.display,
            'workareas-changed',
            () => this._update()
        );

        if (Main.layoutManager._startingUp)
            this._connections.connect(
                Main.layoutManager,
                'startup-complete',
                this._load.bind(this)
            );
        else
            this._load();
    }

    _load() {
        this._createPanelCorners();
        this._createScreenCorners();

        this._settings.PANEL_CORNERS.changed(() => {
            this._createPanelCorners();
            this._update();
        });

        this._settings.SCREEN_CORNERS.changed(() => {
            this._createScreenCorners();
            this._update();
        });

        this._update();
    }

    _createPanelCorners() {
        this._panelCorners?.remove();
        this._panelCorners = null;
        if (this._settings.PANEL_CORNERS.get()) {
            this._panelCorners = new PanelCorners(
                this._settings, new SignalManager()
            );
        }
    }

    _createScreenCorners() {
        this._screenCorners?.remove();
        this._screenCorners = null;
        if (this._settings.SCREEN_CORNERS.get()) {
            this._screenCorners = new ScreenCorners(
                this._settings, new SignalManager()
            );
        }
    }

    _update() {
        this._log('updating corners...');
        this._panelCorners?.update();
        this._screenCorners?.update();
        this._log('corners updated.');
    }

    _remove() {
        this._panelCorners?.remove();
        this._screenCorners?.remove();
    }

    disable() {
        this._remove();
        this._connections.disconnectAll();
        this._log('module disabled.');
        this._panelCorners = null;
        this._screenCorners = null;
        this._connections = null;
        this._settings = null;
    }

    _log(str) {
        if (this._settings?.DEBUG?.get())
            console.log(`[LIDSoL - Panel Corners] ${str}`);
    }
}

export default PanelCornersModule;
