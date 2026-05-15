'use strict';

import { QuickTogglesFeature } from './quickToggles.js';

export class QuickSettingsTweaksModule {
    constructor() {
        this._features = [];
    }

    enable(gsettings, extension) {
        this._gsettings = gsettings;

        const toggles = new QuickTogglesFeature();
        toggles.enable(gsettings);
        this._features.push(toggles);
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
