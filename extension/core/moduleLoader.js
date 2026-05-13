'use strict';

import { PanelCornersModule } from '../modules/panelCorners/module.js';
import { WorkspaceIndicatorModule } from '../modules/workspaceIndicator/module.js';
import { QuickTextModule } from '../modules/quickText/module.js';

const REGISTERED_MODULES = [
    {
        id: 'panelCorners',
        name: 'Panel Corners',
        enabledKey: 'panel-corners-enabled',
        moduleClass: PanelCornersModule
    },
    {
        id: 'workspaceIndicator',
        name: 'Workspace Indicator',
        enabledKey: 'workspace-indicator-enabled',
        moduleClass: WorkspaceIndicatorModule
    },
    {
        id: 'quickText',
        name: 'Quick Text',
        enabledKey: 'qt-enabled',
        moduleClass: QuickTextModule
    }
];

export class ModuleLoader {
    constructor(extension) {
        this._extension = extension;
        this._gsettings = extension.getSettings();
        this._modules = new Map();
        this._watchers = [];
    }

    enable() {
        console.log('[LIDSoL Widgets] ModuleLoader enabled');

        for (const modInfo of REGISTERED_MODULES) {
            if (this._shouldEnableModule(modInfo))
                this._enableModule(modInfo);

            this._watchEnabledKey(modInfo);
        }
    }

    _shouldEnableModule(modInfo) {
        if (modInfo.enabledKey)
            return this._gsettings.get_boolean(modInfo.enabledKey);
        return true;
    }

    _watchEnabledKey(modInfo) {
        if (!modInfo.enabledKey) return;

        const id = this._gsettings.connect('changed::' + modInfo.enabledKey, () => {
            const enabled = this._gsettings.get_boolean(modInfo.enabledKey);
            const isRunning = this._modules.has(modInfo.id);

            if (enabled && !isRunning) {
                console.log(`[LIDSoL Widgets] Runtime enabling module: ${modInfo.name}`);
                this._enableModule(modInfo);
            } else if (!enabled && isRunning) {
                console.log(`[LIDSoL Widgets] Runtime disabling module: ${modInfo.name}`);
                this._disableModule(modInfo.id);
            }
        });
        this._watchers.push(id);
    }

    _enableModule(modInfo) {
        console.log(`[LIDSoL Widgets] Enabling module: ${modInfo.name}`);
        try {
            const moduleInstance = new modInfo.moduleClass();
            moduleInstance.enable(this._gsettings, this._extension);
            this._modules.set(modInfo.id, moduleInstance);
        } catch (e) {
            console.error(`[LIDSoL Widgets] Failed to enable ${modInfo.name}:`, e);
        }
    }

    _disableModule(id) {
        try {
            const mod = this._modules.get(id);
            if (mod) {
                mod.disable();
                this._modules.delete(id);
            }
        } catch (e) {
            console.error(`[LIDSoL Widgets] Error disabling module ${id}:`, e);
        }
    }

    disable() {
        console.log('[LIDSoL Widgets] ModuleLoader disabled');

        for (const id of this._watchers)
            this._gsettings.disconnect(id);
        this._watchers = [];

        for (const [name, mod] of this._modules) {
            try {
                mod.disable();
            } catch (e) {
                console.error(`[LIDSoL Widgets] Error disabling module ${name}:`, e);
            }
        }
        this._modules.clear();
    }
}

