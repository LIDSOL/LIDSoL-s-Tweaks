'use strict';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ModuleLoader } from './extension/core/moduleLoader.js';

export default class LidsolWidgetsExtension extends Extension {
    enable() {
        this._loader = new ModuleLoader(this);
        this._loader.enable();
    }

    disable() {
        this._loader.disable();
        this._loader = null;
    }
}
