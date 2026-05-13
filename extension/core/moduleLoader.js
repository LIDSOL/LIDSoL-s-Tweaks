'use strict';

export class ModuleLoader {
    constructor() {
        this._modules = new Map();
    }

    enable() {
        log('[LIDSoL Widgets] ModuleLoader enabled');
    }

    disable() {
        for (const [name, mod] of this._modules) {
            mod.disable();
        }
        this._modules.clear();
        log('[LIDSoL Widgets] ModuleLoader disabled');
    }
}
