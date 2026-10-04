// Mock del módulo prefs.js del shell (`resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`)
// usado por scripts/check-i18n.sh en el smoke test de llamadas eager a gettext().
//
// En el shell real el gettext solo funciona tras asignarse extensionManager.lookup(uuid).stateObj,
// que ocurre DESPUÉS de evaluar el módulo de prefs de la extensión (extensionPrefsDialog.js).
// Por eso el mock LAVA si `_()` se invoca durante la evaluación del módulo (top-level / hook):
// exactamente el bug "gettext can only be called from extensions" que este guard detecta.
let ready = false;

export function setReady(v) {
    ready = v;
}

export function gettext(str) {
    if (!ready)
        throw new Error(`EAGER gettext call during module evaluation: ${JSON.stringify(str)}`);
    return str;
}

export class ExtensionPreferences {
    constructor(metadata) {
        this.metadata = metadata;
    }
}