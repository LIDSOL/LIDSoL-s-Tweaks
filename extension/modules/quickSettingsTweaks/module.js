'use strict';

globalThis.log('[LIDSoL QST MODULE] module.js loaded - START');
import { QuickTogglesFeature } from './quickToggles.js';
import { SystemItemsFeature } from './systemItems.js';

export class QuickSettingsTweaksModule {
    constructor() {
        this._features = [];
    }

    enable(gsettings, extension) {
        log('[LIDSoL QST MODULE] enable() called');
        this._gsettings = gsettings;

        const toggles = new QuickTogglesFeature();
        log('[LIDSoL QST MODULE] QuickTogglesFeature created');
        toggles.enable(gsettings);
        log('[LIDSoL QST MODULE] QuickTogglesFeature enabled');
        this._features.push(toggles);

        const systemItems = new SystemItemsFeature();
        log('[LIDSoL QST MODULE] SystemItemsFeature created');
        systemItems.enable(gsettings);
        log('[LIDSoL QST MODULE] SystemItemsFeature enabled');
        this._features.push(systemItems);
    }

    disable() {
        for (const f of this._features) {
            try { f.disable(); } catch (e) {
                console.error('[LIDSoL QST] Error disabling feature:', e);
            }
        }
        this._features = [];
        this._gsettings = null;
    }
}
