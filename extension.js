import {ModuleLoader} from './extension/core/moduleLoader.js';

export default function init() {
    const loader = new ModuleLoader();
    return {
        enable() {
            loader.enable();
        },
        disable() {
            loader.disable();
        },
    };
}
