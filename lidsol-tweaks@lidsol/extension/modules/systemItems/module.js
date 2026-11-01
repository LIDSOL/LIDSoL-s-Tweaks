'use strict';

import { SystemItemsFeature } from '../quickSettingsTweaks/systemItems.js';

export class SystemItemsModule {
    constructor() {
        this._feature = null;
    }

    enable(gsettings, extension) {
        this._feature = new SystemItemsFeature();
        this._feature.enable(gsettings);
    }

    disable() {
        if (this._feature) {
            this._feature.disable();
            this._feature = null;
        }
    }
}
