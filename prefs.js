'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { WorkspaceIndicatorPrefs } from './extension/modules/workspaceIndicator/prefsSettings.js';
import {
    createModuleRow,
    createSwitchRow,
    createSpinButtonRow,
    createColorButtonRow,
    createComboRow,
    createIntComboRow,
    createEntryRow,
    createKeyboardShortcutRow,
    createDialog,
    createGroup,
} from './prefsHelpers.js';

const CATEGORIES = [
    {
        id: 'quicksettings',
        title: 'Quick Settings',
        icon: 'emblem-system-symbolic',
        summary: 'Ajustes del menú rápido',
        description: 'Avatar de usuario y mejoras del menú de configuración rápida.',
    },
    {
        id: 'widgets',
        title: 'Widgets',
        icon: 'applications-graphics-symbolic',
        summary: 'Widgets visuales para el escritorio',
        description: 'Reloj de fondo, indicadores y controles multimedia.',
    },
    {
        id: 'topbar',
        title: 'Top Bar / Panel',
        icon: 'pan-end-symbolic',
        summary: 'Personalización de la barra superior',
        description: 'Esquinas redondeadas, indicador de espacios, formato de fecha y notificaciones.',
    },
    {
        id: 'shell',
        title: 'Shell',
        icon: 'system-search-symbolic',
        summary: 'Herramientas del sistema',
        description: 'Lanzador, menú de apagado y notas rápidas.',
    },
];

export default class LidsolWidgetsPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window = window;

        const stack = new Adw.ViewStack();
        for (const cat of CATEGORIES) {
            const page = this._buildPage(cat);
            const sp = stack.add_titled(page, cat.id, cat.title);
            sp.set_icon_name(cat.icon);
        }

        const switcher = new Adw.ViewSwitcher({
            stack,
            policy: Adw.ViewSwitcherPolicy.WIDE,
        });

        const switcherBar = new Adw.ViewSwitcherBar({ stack });

        const header = new Adw.HeaderBar();
        header.set_title_widget(switcher);

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        scrolled.set_child(stack);

        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(header);
        toolbar.add_bottom_bar(switcherBar);
        toolbar.set_content(scrolled);

        this._setupBreakpoint(window, switcher, switcherBar);

        window.set_content(toolbar);
        window.set_default_size(900, 600);
    }

    _setupBreakpoint(window, switcher, switcherBar) {
        const update = () => {
            const w = window.get_width();
            const narrow = w > 0 && w <= 700;
            switcherBar.reveal = narrow;
            switcher.visible = !narrow;
        };

        try {
            const bp = new Adw.Breakpoint({
                condition: Adw.BreakpointCondition.parse('max-width: 700px'),
            });
            bp.connect('apply', () => update());
            window.add_breakpoint(bp);
        } catch (e) {
            log('[LIDSoL] Window breakpoint failed, falling back to size polling');
            let lastW = 0;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                const w = window.get_width();
                if (w !== lastW) { lastW = w; update(); }
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    // ── Page builder ────────────────────────────────────────────
    _buildPage(cat) {
        const page = new Adw.PreferencesPage();
        page.set_name(cat.id);

        const descGroup = new Adw.PreferencesGroup({
            title: cat.summary,
            description: cat.description,
        });
        page.add(descGroup);

        const s = this._settings;

        if (cat.id === 'quicksettings') {
            this._addQuicksettingsModuleGroup(page);
        }

        if (cat.id === 'widgets') {
            this._addWidgetsModuleGroup(page);
        }

        if (cat.id === 'topbar') {
            this._addTopbarModuleGroup(page);
        }

        if (cat.id === 'shell') {
            this._addShellModuleGroup(page);
        }

        return page;
    }

    // ── Module rows by category ──────────────────────────────────
    _addQuicksettingsModuleGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'user-avatar-enabled',
            title: 'Avatar de Usuario',
            subtitle: 'Muestra tu foto de perfil en los ajustes rápidos',
            onDetailed: () => this._openDialog('Avatar de Usuario', p => this._buildUserAvatarDialog(p)),
        }));
        page.add(group);
    }

    _addWidgetsModuleGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'background-clock-enabled',
            title: 'Background Clock',
            subtitle: 'Reloj superpuesto en el escritorio',
            onDetailed: () => this._openDialog('Background Clock', p => this._buildBackgroundClockDialog(p)),
        }));
        page.add(group);
    }

    _addTopbarModuleGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'panel-corners-enabled',
            title: 'Panel Corners',
            subtitle: 'Esquinas redondeadas en el panel y la pantalla',
            onDetailed: () => this._openDialog('Panel Corners', p => this._buildPanelCornersDialog(p)),
        }));
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'workspace-indicator-enabled',
            title: 'Workspace Indicator',
            subtitle: 'Indicador de espacios de trabajo estilo Space Bar',
            onDetailed: () => this._openDialog('Workspace Indicator', p => this._buildWorkspaceIndicatorDialog(p)),
        }));
        page.add(group);
    }

    _addShellModuleGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qt-enabled',
            title: 'Quick Text',
            subtitle: 'Captura rápida de notas con atajo de teclado',
            onDetailed: () => this._openDialog('Quick Text', p => this._buildQuickTextDialog(p)),
        }));
        page.add(group);
    }

    // ── Dialog helper ───────────────────────────────────────────
    _openDialog(title, buildFn) {
        const window = this._getWindow();
        createDialog({
            window,
            title,
            childrenRequest: (page, dialog) => buildFn(page, dialog),
        });
    }

    _getWindow() {
        return this._window;
    }

    // ══════════════════════════════════════════════════════════════
    //  DIALOG BUILDERS
    // ══════════════════════════════════════════════════════════════

    // ── Panel Corners ───────────────────────────────────────────
    _buildPanelCornersDialog(page) {
        const s = this._settings;

        // Panel Corners group
        const panelGroup = createGroup({
            parent: page,
            title: 'Panel Corners',
            description: 'Esquinas redondeadas en la parte inferior del panel',
        });
        this._addEnableSubSwitch(panelGroup, s, 'panel-corners', 'Activar Panel Corners');

        panelGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'panel-corner-radius',
            title: 'Radio', subtitle: 'Recomendado: 12px',
            adjProps: { lower: 0, upper: 25 },
        }));
        panelGroup.add(createColorButtonRow({
            settings: s, bindKey: 'panel-corner-background-color',
            title: 'Color', subtitle: 'Recomendado: negro',
        }));
        panelGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'panel-corner-opacity',
            title: 'Opacidad',
            adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 },
        }));

        // Screen Corners group
        const screenGroup = createGroup({
            parent: page,
            title: 'Screen Corners',
            description: 'Esquinas redondeadas alrededor de la pantalla',
        });
        this._addEnableSubSwitch(screenGroup, s, 'screen-corners', 'Activar Screen Corners');

        screenGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'screen-corner-radius',
            title: 'Radio', subtitle: 'Recomendado: 12px',
            adjProps: { lower: 0, upper: 25 },
        }));
        screenGroup.add(createColorButtonRow({
            settings: s, bindKey: 'screen-corner-background-color',
            title: 'Color',
        }));
        screenGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'screen-corner-opacity',
            title: 'Opacidad',
            adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 },
        }));

        // Advanced group
        const advGroup = createGroup({ parent: page, title: 'Opciones avanzadas' });
        advGroup.add(createSwitchRow({
            settings: s, bindKey: 'force-extension-values',
            title: 'Forzar valores de la extensión',
            subtitle: 'Sobreescribe las preferencias del tema actual',
        }));
        advGroup.add(createSwitchRow({
            settings: s, bindKey: 'debug',
            title: 'Modo debug',
            subtitle: 'Activa logs más verbosos',
        }));
    }

    // ── Workspace Indicator ──────────────────────────────────────
    _buildWorkspaceIndicatorDialog(page) {
        const prefs = new WorkspaceIndicatorPrefs(this._settings);
        prefs.populateGroups(page);
    }

    // ── Background Clock ────────────────────────────────────────
    _buildBackgroundClockDialog(page) {
        const s = this._settings;

        // Position
        const posGroup = createGroup({ parent: page, title: 'Posición' });
        posGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-position',
            title: 'Posición', subtitle: '0=sup-izq … 8=inf-der (cuadrícula 3x3)',
            adjProps: { lower: 0, upper: 8 },
        }));
        posGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-x-offset',
            title: 'Desplazamiento horizontal',
            adjProps: { lower: -500, upper: 500 },
        }));
        posGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-y-offset',
            title: 'Desplazamiento vertical',
            adjProps: { lower: -500, upper: 500 },
        }));

        // Clock
        const clockGroup = createGroup({ parent: page, title: 'Hora' });
        this._addEnableSubSwitch(clockGroup, s, 'background-clock-enable-clock', 'Mostrar hora');
        clockGroup.add(createEntryRow({
            settings: s, bindKey: 'background-clock-clock-format',
            title: 'Formato', subtitle: '%H:%M (24h) o %I:%M %p (12h)',
        }));
        clockGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-clock-size',
            title: 'Tamaño', subtitle: 'Tamaño de fuente en puntos',
            adjProps: { lower: 8, upper: 200, step: 2 },
        }));
        clockGroup.add(createColorButtonRow({
            settings: s, bindKey: 'background-clock-clock-color',
            title: 'Color',
        }));
        this._addFontToggleRow(clockGroup, s,
            'background-clock-clock-custom-font',
            'background-clock-clock-font',
            'Fuente personalizada');

        // Date
        const dateGroup = createGroup({ parent: page, title: 'Fecha' });
        this._addEnableSubSwitch(dateGroup, s, 'background-clock-enable-date', 'Mostrar fecha');
        dateGroup.add(createEntryRow({
            settings: s, bindKey: 'background-clock-date-format',
            title: 'Formato', subtitle: '%A, %d de %B',
        }));
        dateGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-date-size',
            title: 'Tamaño',
            adjProps: { lower: 8, upper: 200, step: 2 },
        }));
        dateGroup.add(createColorButtonRow({
            settings: s, bindKey: 'background-clock-date-color',
            title: 'Color',
        }));
        this._addFontToggleRow(dateGroup, s,
            'background-clock-date-custom-font',
            'background-clock-date-font',
            'Fuente personalizada');

        // Container
        const bgGroup = createGroup({ parent: page, title: 'Contenedor', description: 'Estilo del fondo del reloj' });
        bgGroup.add(createColorButtonRow({
            settings: s, bindKey: 'background-clock-bg-color',
            title: 'Color de fondo', subtitle: 'Usa alpha para fondo semitransparente',
            useAlpha: true,
        }));
        bgGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-bg-padding',
            title: 'Padding',
            adjProps: { lower: 0, upper: 100, step: 2 },
        }));
        bgGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'background-clock-bg-border-radius',
            title: 'Radio del borde',
            adjProps: { lower: 0, upper: 50 },
        }));
    }

    // ── Quick Text ──────────────────────────────────────────────
    _buildQuickTextDialog(page) {
        const s = this._settings;
        const group = createGroup({ parent: page, title: 'Quick Text', description: 'Captura rápida de notas mediante atajo de teclado' });

        group.add(createSwitchRow({
            settings: s, bindKey: 'qt-multiline',
            title: 'Entrada de una sola línea',
            subtitle: 'Si está activo, Enter guarda la nota directamente',
        }));
        group.add(createSwitchRow({
            settings: s, bindKey: 'qt-hideacted',
            title: 'Ocultar notas procesadas',
            subtitle: 'Oculta notas marcadas como procesadas en la ventana de acciones',
        }));

        const hotkeyEntry = new Gtk.Entry({
            text: s.get_strv('qt-hotkey')[0] || '',
            valign: Gtk.Align.CENTER,
        });
        hotkeyEntry.connect('changed', () => {
            s.set_strv('qt-hotkey', [hotkeyEntry.get_text()]);
        });
        const hotkeyRow = new Adw.ActionRow({
            title: 'Atajo de teclado',
            subtitle: 'Combinación para abrir el diálogo de notas',
            activatable_widget: hotkeyEntry,
        });
        hotkeyRow.add_suffix(hotkeyEntry);
        group.add(hotkeyRow);

        group.add(createEntryRow({
            settings: s, bindKey: 'qt-filepath',
            title: 'Archivo de notas',
            subtitle: 'Ruta absoluta al archivo de texto',
        }));
        group.add(createEntryRow({
            settings: s, bindKey: 'qt-prepend',
            title: 'Prefijo',
            subtitle: 'Texto antes de cada nota (vacío = fecha actual)',
        }));
        group.add(createEntryRow({
            settings: s, bindKey: 'qt-append',
            title: 'Separador',
            subtitle: 'Texto que separa las notas en el archivo',
        }));
    }

    // ── User Avatar ─────────────────────────────────────────────
    _buildUserAvatarDialog(page) {
        const s = this._settings;

        const posGroup = createGroup({ parent: page, title: 'Posición' });
        const positionModel = new Gtk.StringList({ strings: ['Derecha', 'Izquierda'] });
        const positionRow = new Adw.ComboRow({
            title: 'Posición',
            subtitle: 'Posición del avatar respecto a los botones del sistema',
            model: positionModel,
            selected: s.get_int('ua-position'),
        });
        positionRow.connect('notify::selected', () => {
            s.set_int('ua-position', positionRow.selected);
        });
        posGroup.add(positionRow);

        const appearGroup = createGroup({ parent: page, title: 'Apariencia' });
        appearGroup.add(createSpinButtonRow({
            settings: s, bindKey: 'ua-size',
            title: 'Tamaño', subtitle: '43 por defecto',
            adjProps: { lower: 15, upper: 75, step: 2 },
        }));
        appearGroup.add(createSwitchRow({
            settings: s, bindKey: 'ua-realname',
            title: 'Mostrar nombre real',
            subtitle: 'Según la longitud, puede aumentar el ancho del panel',
        }));
        appearGroup.add(createSwitchRow({
            settings: s, bindKey: 'ua-username',
            title: 'Mostrar nombre de usuario',
        }));
        appearGroup.add(createSwitchRow({
            settings: s, bindKey: 'ua-hostname',
            title: 'Mostrar nombre del equipo',
        }));
        appearGroup.add(createSwitchRow({
            settings: s, bindKey: 'ua-nobackground',
            title: 'Quitar fondo del botón',
            subtitle: 'Elimina el fondo predeterminado',
        }));
    }

    // ── Helpers ─────────────────────────────────────────────────
    _addEnableSubSwitch(group, settings, bindKey, title) {
        const sw = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind(bindKey, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
        const row = new Adw.ActionRow({ title, activatable_widget: sw });
        row.add_suffix(sw);
        group.add(row);
    }

    _addFontToggleRow(group, settings, toggleKey, fontKey, title) {
        group.add(createSwitchRow({
            settings, bindKey: toggleKey, title,
        }));
        group.add(createEntryRow({
            settings, bindKey: fontKey,
            title: 'Fuente', subtitle: 'Nombre de la fuente (ej: Monospace)',
        }));
    }
}

export {CATEGORIES};
