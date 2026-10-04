// Smoke test permanente de i18n en módulos prefs: verifica que no existan llamadas eager a _().
//
// El driver se copia a una raíz temporal junto al árbol de módulos prefs (y al mock gettext)
// por scripts/check-i18n.sh. Toda importación relativa a import.meta.url es válida también
// desde scripts/tests/ para ejecutar en desarrollo.
//
// Regla del shell (GNOME Shell): el gettext del shell lanza "gettext can only be called from
// extensions" si se invoca antes de que se asigne stateObj, que ocurre DESPUÉS de evaluar el
// módulo de prefs. El mock traduce ese mecanismo: setReady(false) durante la importación
// (falla cualquier _() eager) y setReady(true) al acceder a las traducciones en runtime.

import { setReady } from './mock-prefs.js';

// GJS no expone el constructor global URL: se deriva la base de import.meta.url.
const rootDir = import.meta.url.replace(/[^/]*$/, '');
const imp = (f) => import(rootDir + f);

// ── 1) Evaluación del grafo completo de prefs con gettext "apagado" ────────
// Si algún módulo llama a _() durante la evaluación (top-level o en un hook de
// registro de clase que corra al importar), gettext lanza y este driver falla.
const { default: LidsolWidgetsPrefs, CATEGORIES } = await imp('prefs.js');

await imp('extension/utils/prefsHelpers.js');
await imp('extension/modules/topBarOrganizer/prefsSettings.js');
await imp('extension/modules/workspaceIndicator/prefsSettings.js');
await imp('extension/modules/workspace/prefsSettings.js');
await imp('extension/modules/quickSettingsTweaks/prefsSettings.js');
await imp('extension/modules/userAvatar/prefsSettings.js');

if (typeof LidsolWidgetsPrefs !== 'function')
    throw new Error('prefs.js no exporta la clase LidsolWidgetsPrefs');

console.log('PASS: módulos prefs evaluados sin llamadas eager a gettext().');

// ── 2) Runtime: las traducciones deben fluir con gettext activo ────────────
setReady(true);

for (const cat of CATEGORIES) {
    if (typeof cat.title !== 'string' || !cat.title)
        throw new Error(`CATEGORIES[${cat.id}].title no traduce`);

    if (
        typeof cat.summary !== 'string' || !cat.summary ||
        typeof cat.description !== 'string' || !cat.description
    )
        throw new Error(`CATEGORIES[${cat.id}] summary/description no traducen`);
}

console.log('PASS: CATEGORIES traduce título/summary/descripción en runtime.');

// Mapas internos exportados solo en la copia temporal (ver scripts/check-i18n.sh).
const tbo = await imp('extension/modules/topBarOrganizer/prefsSettings.js');
if (tbo.TOP_BAR_ITEM_NAMES.appMenu !== 'Application menu')
    throw new Error(`TOP_BAR_ITEM_NAMES.appMenu inesperado: ${tbo.TOP_BAR_ITEM_NAMES.appMenu}`);

if (tbo.TOP_BAR_ITEM_NAMES.unknown !== undefined)
    throw new Error('TOP_BAR_ITEM_NAMES.unknown debería ser undefined (rollback a role raw)');

if (tbo.BOX_NAMES.left !== 'Left box' || tbo.BOX_NAMES.right !== 'Right box')
    throw new Error('BOX_NAMES no traduce');

console.log('PASS: TOP_BAR_ITEM_NAMES y BOX_NAMES traducen en runtime.');

const qst = await imp('extension/modules/quickSettingsTweaks/prefsSettings.js');
if (qst.SYSTEM_NAMES.NMWiredToggle !== 'Wired')
    throw new Error(`SYSTEM_NAMES.NMWiredToggle inesperado: ${qst.SYSTEM_NAMES.NMWiredToggle}`);

if (qst.SYSTEM_ITEM_NAMES.laptopSpacer !== 'Spacer (laptop)')
    throw new Error(`SYSTEM_ITEM_NAMES.laptopSpacer inesperado: ${qst.SYSTEM_ITEM_NAMES.laptopSpacer}`);

console.log('PASS: SYSTEM_NAMES y SYSTEM_ITEM_NAMES traducen en runtime.');
console.log('SMOKE OK');