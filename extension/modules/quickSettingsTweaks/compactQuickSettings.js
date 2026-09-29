'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const LOG_PREFIX = '[LIDSoL QST Compact]';
const DEFAULT_COLUMNS = 2;

// 2.6.2 — Reducción de ancho de los toggles según el modo de columnas.
// En este layout los toggles rellenan su celda (cell ≈ popupWidth / nColumns),
// así que fijar proporcionalmente el ancho del popup adelgaza los toggles.
//  - 1 columna: quedan al 95% del ancho actual (reduce 5%).
//  - 3 columnas: quedan al 70% del ancho actual (reduce 30%).
//  - 2 columnas (default): sin restricción (CSS de base).
// El ancho queda FIJO (min == max) al ancla×factor: ocultar/mostrar
// SystemItems no lo encoge ni lo desborda.
const WIDTH_FACTOR = {1: 0.95, 3: 0.7};
// Padding total (izq+der) de `.quick-settings` en el tema 50/51 (18px × 2).
const QUICK_SETTINGS_PADDING = 36;

// 2.6 — Quick Settings Compact (referencia compact-quick-settings, adaptada a
// GNOME 50/51).
//
// En 50/51 el grid de configuración rápida NO respeta `grid-columns` del CSS:
// es un `St.Widget` con `QuickSettingsLayout` (layout manager custom) cuya
// propiedad GObject `n-columns` controla el número de columnas (hardcodeado en
// panel.js como N_QUICK_SETTINGS_COLUMNS = 2). Esta feature:
//   - cambia `nColumns` del layout manager vivo (1/2/3) + queue_relayout().
//   - carga un stylesheet que compacta TODOS los toggles del grid
//     (individuales y con sub-menú: Wi-Fi/Bluetooth/etc.), ocultando su
//     subtitle y reduciendo la flecha del sub-menú; libera además su ancho fijo
//     de 12em para que las columnas no desborden.
//
// Sin recarga: los cambios de `qst-compact-enabled`/`qst-compact-columns` se
// aplican en caliente re-calculando columnas y (des)cargando el CSS.

export class CompactQuickSettingsFeature {
    constructor() {
        this._gsettings = null;
        this._extension = null;
        this._enabled = false;
        this._columns = DEFAULT_COLUMNS;
        this._signalIds = [];
        this._menuOpenId = 0;
        this._lastWidthLog = '';
        this._stylesheetFile = null;
        // Actores del grid que deben ocupar el ancho completo (sliders de
        // brillo/volumen, sistema, background-apps). panel.js los inserta con
        // colSpan = N_QUICK_SETTINGS_COLUMNS (2); se marcan al ver colSpan > 1.
        this._fullWidth = new Set();
        // 2.6.2 — Ancla de ancho por (grid, modo): el natWidth de referencia se
        // conserva entre aperturas para que ocultar SystemItems/toggles NO encoja
        // el popup; SOLO crece con el contenido más ancho medido (nunca se encoje)
        // para que mostrarlos no desborde. Se re-mide si el menú se recrea (grid
        // nuevo) o cambia el modo de columnas.
        this._widthAnchor = null;
    }

    enable(gsettings, extension) {
        this._gsettings = gsettings;
        this._extension = extension;
        this._loadSettings();

        // Handlers conectados SIEMPRE para permitir ON→OFF→ON en caliente.
        this._connectHandlers();
        this._connectMenuOpenHandler();
        this._apply();
    }

    disable() {
        this._disconnectHandlers();
        this._disconnectMenuOpenHandler();
        this._apply(false);
        this._gsettings = null;
        this._extension = null;
    }

    _loadSettings() {
        const s = this._gsettings;
        this._enabled = s.get_boolean('qst-compact-enabled');
        try {
            this._columns = Math.clamp(s.get_int('qst-compact-columns'), 1, 3);
        } catch (e) {
            this._columns = DEFAULT_COLUMNS;
        }
    }

    _connectHandlers() {
        for (const key of ['qst-compact-enabled', 'qst-compact-columns']) {
            const id = this._gsettings.connect(`changed::${key}`, () => {
                try {
                    this._loadSettings();
                    this._apply();
                } catch (e) {
                    console.error(`${LOG_PREFIX} Error applying setting:`, e);
                }
            });
            this._signalIds.push(id);
        }
    }

    _disconnectHandlers() {
        for (const id of this._signalIds) {
            try { this._gsettings.disconnect(id); } catch (e) {}
        }
        this._signalIds = [];
    }

    // El ancho del popup se recalcula cada vez que el menú se abre, para que un
    // cambio de factor/columnas se vea sin relogin y sin depender de que el
    // popup esté abierto cuando llega el 'changed::' de prefs.
    _connectMenuOpenHandler() {
        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (!menu)
            return;
        try {
            this._menuOpenId = menu.connect('open-state-changed', (m, open) => {
                if (!open)
                    return;
                try {
                    this._applyColumns(this._enabled ? this._columns : DEFAULT_COLUMNS);
                } catch (e) {
                    console.error(`${LOG_PREFIX} Error re-applying columns on open:`, e);
                }
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} Error connecting menu open handler:`, e);
        }
    }

    _disconnectMenuOpenHandler() {
        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (this._menuOpenId && menu) {
            try { menu.disconnect(this._menuOpenId); } catch (e) {}
        }
        this._menuOpenId = 0;
    }

    _apply(enabled = this._enabled) {
        this._applyColumns(enabled ? this._columns : DEFAULT_COLUMNS);
        this._updateStylesheet(enabled);
    }

    // 2.6.2 — Cambia las columnas del grid vivo. En 50/51 las columnas las
    // define QuickSettingsLayout (propiedad `n-columns`); el layout manager se
    // re-obtiene en cada llamada porque el menú puede (re)crearse.
    _getGrid() {
        return Main.panel.statusArea.quickSettings?.menu?._grid ?? null;
    }

    _applyColumns(n) {
        const grid = this._getGrid();
        if (!grid?.layout_manager)
            return;
        const layout = grid.layout_manager;
        if (typeof layout.nColumns !== 'number')
            return;
        try {
            if (layout.nColumns !== n) {
                layout.nColumns = n;
                log(`${LOG_PREFIX} grid columns -> ${n}`);
            }

            // 2.6.1 — Los items añadidos como full-width (sliders de
            // brillo/volumen, sistema, background-apps) conservan el colSpan
            // con el que panel.js los insertó (N_QUICK_SETTINGS_COLUMNS = 2).
            // Al cambiar las columnas hay que resincronizarlos a `n`, o en 3
            // columnas queda una columna vacía y los toggles se recolocan mal.
            //
            // Bug corregido: al pasar por 1 columna el colSpan baja a 1, y la
            // resincronización antigua (basada en `colSpan > 1`) no lo volvía
            // a subir al regresar a 2/3 → sliders lado a lado (parecía CSS
            // "cacheado" hasta relogin). Ahora se marcan los full-width en un
            // Set (todo hijo con colSpan > 1, como los inserta panel.js) y se
            // resincronizan SIEMPRE a `n`, aunque su colSpan actual sea 1.
            const children = grid.get_children();
            for (const child of children) {
                if (child === layout._overlay) // placeholder de altura
                    continue;
                const meta = layout.get_child_meta(grid, child);
                if (meta.columnSpan > 1 && !this._fullWidth.has(child))
                    this._fullWidth.add(child);
            }
            // Descarta actores removidos del grid (p.ej. menú recreado).
            for (const child of this._fullWidth) {
                if (!child.get_parent() || child.get_parent() !== grid)
                    this._fullWidth.delete(child);
            }
            for (const child of children) {
                if (child === layout._overlay)
                    continue;
                if (this._fullWidth.has(child)) {
                    const meta = layout.get_child_meta(grid, child);
                    if (meta.columnSpan !== n)
                        layout.child_set_property(grid, child, 'column-span', n);
                }
            }

            // 2.6.2 — Ancho proporcional de los toggles según el modo. Los
            // toggles rellenan su celda: fijando el ancho del popup quedan al
            // factor (95% en 1 columna, 70% en 3; 2 columnas con ancho natural).
            //
            // Se mide el ancho del grid con SOLO su contenido visible: el
            // `get_preferred_width()` del propio grid incluye children ocultos
            // (p.ej. los SystemItems ocultos con qst-system-items-hide), lo que
            // inflaba `natWidth` y hacía que max-width nunca "clavara" el
            // factor → el popup seguía el contenido y cambiar el factor no se
            // notaba. Se replica el cálculo del layout (máximo de
            // childNat/colSpan × columnas + spacing) saltando invisibles.
            //
            // El natWidth calculado se ancla (this._widthAnchor) por grid+modo
            // y SOLO crece con el contenido más ancho medido. Además el ancho
            // del popup se FIJA (min == max = ancla×factor): así, ocultar
            // SystemItems no lo encoge y mostrarlos no lo desborda.
            const box = Main.panel.statusArea.quickSettings?.menu?.box;
            const factor = WIDTH_FACTOR[n];
            if (box && factor) {
                // Mide el contenido visible ACTUAL (todas las llamadas): así, si
                // el usuario muestra SystemItems más tarde, el ancla detecta el
                // ancho real y el popup crece para no desbordarlos (equivale al
                // "cambio a grid 3 y vuelvo a 1" que re-medía el ancla).
                let natChild = 0;
                for (const child of grid.get_children()) {
                    if (child === layout._overlay || !child.visible)
                        continue;
                    const [, childNat] = child.get_preferred_width(-1);
                    const colSpan = Math.clamp(
                        layout.get_child_meta(grid, child).columnSpan,
                        1, layout.nColumns);
                    natChild = Math.max(natChild, childNat / colSpan);
                }
                const curNat =
                    layout.nColumns * natChild +
                    (layout.nColumns - 1) * layout.column_spacing;
                // Ancla por (grid, modo): SOLO crece con el contenido más ancho
                // medido, nunca se encoje. Ocultan SystemItems → no se encoge el
                // popup; se muestran → el ancla crece y caben sin desbordar.
                if (!this._widthAnchor ||
                    this._widthAnchor.grid !== grid ||
                    this._widthAnchor.n !== n) {
                    this._widthAnchor = {grid, n, natWidth: curNat};
                } else if (curNat > this._widthAnchor.natWidth) {
                    this._widthAnchor.natWidth = curNat;
                }
                const natWidth = this._widthAnchor.natWidth;
                // Ancho FIJO del popup (min == max): ocultar SystemItems NO lo
                // encoge (el min-width lo sostiene) y mostrarlos no lo desborda
                // (el ancla ya creció para cubrir el contenido más ancho visto).
                const targetWidth = Math.round(natWidth * factor) + QUICK_SETTINGS_PADDING;
                box.set_style(
                    `min-width: ${targetWidth}px; max-width: ${targetWidth}px`);
                if (this._lastWidthLog !== `${n}:${targetWidth}`) {
                    this._lastWidthLog = `${n}:${targetWidth}`;
                    log(`${LOG_PREFIX} popup width mode ${n}: ` +
                        `visNat=${Math.round(natWidth)}px → ` +
                        `${targetWidth}px fijo (factor=${factor})`);
                }
            } else if (box && box.get_style() !== '') {
                box.set_style(''); // 1 y 2 columnas: vuelve al CSS de base
            }
            grid.queue_relayout();
        } catch (e) {
            console.error(`${LOG_PREFIX} Error setting nColumns:`, e);
        }
    }

    // 2.6.1 + CSS — (Des)carga el stylesheet del módulo. Mismo patrón de
    // batteryIndicator/dashboard (load_stylesheet/unload_stylesheet).
    _updateStylesheet(enabled) {
        if (!this._extension)
            return;
        const tc = St.ThemeContext.get_for_stage(global.stage);
        const file = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/quickSettingsTweaks/compactQuickSettings.css');

        if (enabled && !this._stylesheetFile) {
            if (file.query_exists(null)) {
                tc.get_theme().load_stylesheet(file);
                this._stylesheetFile = file;
                log(`${LOG_PREFIX} stylesheet loaded`);
            }
        } else if (!enabled && this._stylesheetFile) {
            try {
                tc.get_theme().unload_stylesheet(this._stylesheetFile);
            } catch (e) {
                console.error(`${LOG_PREFIX} Error unloading stylesheet:`, e);
            }
            this._stylesheetFile = null;
        }
    }
}
