'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
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
} from './extension/utils/prefsHelpers.js';

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

        for (const cat of CATEGORIES) {
            const page = this._buildPage(cat);
            page.title = cat.title;
            window.add(page);
        }

        window.set_default_size(450, 700);
    }

    _buildPage(cat) {
        const page = new Adw.PreferencesPage();
        page.set_name(cat.id);

        const descGroup = new Adw.PreferencesGroup({
            title: cat.summary,
            description: cat.description,
        });
        page.add(descGroup);

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

    _addQuicksettingsModuleGroup(page) {
        const systemGroup = new Adw.PreferencesGroup({
            title: 'Área de sistema',
            description: 'Avatar de usuario y organización de los botones del sistema.',
        });
        systemGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'user-avatar-enabled',
            title: 'Avatar de Usuario',
            subtitle: 'Muestra tu foto de perfil en los ajustes rápidos',
            onDetailed: () => this._openDialog('Avatar de Usuario', p => this._buildUserAvatarDialog(p)),
        }));
        systemGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-system-items-enabled',
            title: 'System Items Layout',
            subtitle: 'Reordena y oculta botones del área de sistema (captura, ajustes, bloqueo, apagado, batería)',
            onDetailed: () => {
                if (this._window && this._settings)
                    openSystemItemsDialog(this._window, this._settings);
            },
        }));
        page.add(systemGroup);

        const togglesGroup = new Adw.PreferencesGroup({
            title: 'Toggles',
            description: 'Personalización de los toggles del menú de configuración rápida.',
        });
        togglesGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-toggles-enabled',
            title: 'Quick Toggles Layout',
            subtitle: 'Reordena y oculta toggles del menú de configuración rápida',
            onDetailed: () => {
                if (this._window && this._settings)
                    openToggleOrderDialog(this._window, this._settings);
            },
        }));
        togglesGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-overlay-menu-enabled',
            title: 'Overlay Mode',
            subtitle: 'Muestra los menús como superposición sobre los ajustes rápidos (útil en pantallas pequeñas)',
            onDetailed: () => {
                if (this._window && this._settings)
                    this._buildOverlayMenuDialog();
            },
        }));
        page.add(togglesGroup);
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

    _openDialog(title, buildFn) {
        const window = this._getWindow();
        createDialog({
            window,
            title,
            childrenRequest: (page, dialog) => buildFn(page, dialog),
        });
    }

    _getWindow() { return this._window; }

    // ═══ DIALOG BUILDERS ═══

    _buildPanelCornersDialog(page) {
        const s = this._settings;
        const panelGroup = createGroup({ parent: page, title: 'Panel Corners', description: 'Esquinas redondeadas en la parte inferior del panel' });
        this._addEnableSubSwitch(panelGroup, s, 'panel-corners', 'Activar Panel Corners');
        panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-radius', title: 'Radio', subtitle: 'Recomendado: 12px', adjProps: { lower: 0, upper: 25 } }));
        panelGroup.add(createColorButtonRow({ settings: s, bindKey: 'panel-corner-background-color', title: 'Color', subtitle: 'Recomendado: negro' }));
        panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-opacity', title: 'Opacidad', adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
        const screenGroup = createGroup({ parent: page, title: 'Screen Corners', description: 'Esquinas redondeadas alrededor de la pantalla' });
        this._addEnableSubSwitch(screenGroup, s, 'screen-corners', 'Activar Screen Corners');
        screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-radius', title: 'Radio', subtitle: 'Recomendado: 12px', adjProps: { lower: 0, upper: 25 } }));
        screenGroup.add(createColorButtonRow({ settings: s, bindKey: 'screen-corner-background-color', title: 'Color' }));
        screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-opacity', title: 'Opacidad', adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
        const advGroup = createGroup({ parent: page, title: 'Opciones avanzadas' });
        advGroup.add(createSwitchRow({ settings: s, bindKey: 'force-extension-values', title: 'Forzar valores de la extensión', subtitle: 'Sobreescribe las preferencias del tema actual' }));
        advGroup.add(createSwitchRow({ settings: s, bindKey: 'debug', title: 'Modo debug', subtitle: 'Activa logs más verbosos' }));
    }

    _buildWorkspaceIndicatorDialog(page) {
        const prefs = new WorkspaceIndicatorPrefs(this._settings);
        prefs.populateGroups(page);
    }

    _buildBackgroundClockDialog(page) {
        const s = this._settings;
        const posGroup = createGroup({ parent: page, title: 'Posición' });
        posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-position', title: 'Posición', subtitle: '0=sup-izq … 8=inf-der', adjProps: { lower: 0, upper: 8 } }));
        posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-x-offset', title: 'Desplazamiento horizontal', adjProps: { lower: -500, upper: 500 } }));
        posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-y-offset', title: 'Desplazamiento vertical', adjProps: { lower: -500, upper: 500 } }));
        const clockGroup = createGroup({ parent: page, title: 'Hora' });
        this._addEnableSubSwitch(clockGroup, s, 'background-clock-enable-clock', 'Mostrar hora');
        clockGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-clock-format', title: 'Formato', subtitle: '%H:%M (24h) o %I:%M %p (12h)' }));
        clockGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-clock-size', title: 'Tamaño', subtitle: 'Tamaño de fuente en puntos', adjProps: { lower: 8, upper: 200, step: 2 } }));
        clockGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-clock-color', title: 'Color' }));
        this._addFontToggleRow(clockGroup, s, 'background-clock-clock-custom-font', 'background-clock-clock-font', 'Fuente personalizada');
        const dateGroup = createGroup({ parent: page, title: 'Fecha' });
        this._addEnableSubSwitch(dateGroup, s, 'background-clock-enable-date', 'Mostrar fecha');
        dateGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-date-format', title: 'Formato', subtitle: '%A, %d de %B' }));
        dateGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-date-size', title: 'Tamaño', adjProps: { lower: 8, upper: 200, step: 2 } }));
        dateGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-date-color', title: 'Color' }));
        this._addFontToggleRow(dateGroup, s, 'background-clock-date-custom-font', 'background-clock-date-font', 'Fuente personalizada');
        const bgGroup = createGroup({ parent: page, title: 'Contenedor', description: 'Estilo del fondo del reloj' });
        bgGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-bg-color', title: 'Color de fondo', subtitle: 'Usa alpha para fondo semitransparente', useAlpha: true }));
        bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-padding', title: 'Padding', adjProps: { lower: 0, upper: 100, step: 2 } }));
        bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-border-radius', title: 'Radio del borde', adjProps: { lower: 0, upper: 50 } }));
    }

    _buildQuickTextDialog(page) {
        const s = this._settings;
        const group = createGroup({ parent: page, title: 'Quick Text', description: 'Captura rápida de notas mediante atajo de teclado' });
        group.add(createSwitchRow({ settings: s, bindKey: 'qt-multiline', title: 'Entrada de una sola línea', subtitle: 'Si está activo, Enter guarda la nota directamente' }));
        group.add(createSwitchRow({ settings: s, bindKey: 'qt-hideacted', title: 'Ocultar notas procesadas', subtitle: 'Oculta notas marcadas como procesadas en la ventana de acciones' }));
        const hotkeyEntry = new Gtk.Entry({ text: s.get_strv('qt-hotkey')[0] || '', valign: Gtk.Align.CENTER });
        hotkeyEntry.connect('changed', () => s.set_strv('qt-hotkey', [hotkeyEntry.get_text()]));
        const hotkeyRow = new Adw.ActionRow({ title: 'Atajo de teclado', subtitle: 'Combinación para abrir el diálogo de notas', activatable_widget: hotkeyEntry });
        hotkeyRow.add_suffix(hotkeyEntry);
        group.add(hotkeyRow);
        group.add(createEntryRow({ settings: s, bindKey: 'qt-filepath', title: 'Archivo de notas', subtitle: 'Ruta absoluta al archivo de texto' }));
        group.add(createEntryRow({ settings: s, bindKey: 'qt-prepend', title: 'Prefijo', subtitle: 'Texto antes de cada nota (vacío = fecha actual)' }));
        group.add(createEntryRow({ settings: s, bindKey: 'qt-append', title: 'Separador', subtitle: 'Texto que separa las notas en el archivo' }));
    }

    _buildUserAvatarDialog(page) {
        const s = this._settings;
        const posGroup = createGroup({ parent: page, title: 'Posición' });
        const positionModel = new Gtk.StringList({ strings: ['Derecha', 'Izquierda'] });
        const positionRow = new Adw.ComboRow({ title: 'Posición', subtitle: 'Posición del avatar respecto a los botones del sistema', model: positionModel, selected: s.get_int('ua-position') });
        positionRow.connect('notify::selected', () => s.set_int('ua-position', positionRow.selected));
        posGroup.add(positionRow);
        const appearGroup = createGroup({ parent: page, title: 'Apariencia' });
        appearGroup.add(createSpinButtonRow({ settings: s, bindKey: 'ua-size', title: 'Tamaño', subtitle: '43 por defecto', adjProps: { lower: 15, upper: 75, step: 2 } }));
        appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-realname', title: 'Mostrar nombre real', subtitle: 'Según la longitud, puede aumentar el ancho del panel' }));
        appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-username', title: 'Mostrar nombre de usuario' }));
        appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-hostname', title: 'Mostrar nombre del equipo' }));
        appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-nobackground', title: 'Quitar fondo del botón', subtitle: 'Elimina el fondo predeterminado' }));
    }

    _buildOverlayMenuDialog() {
        const s = this._settings;
        createDialog({
            window: this._getWindow(),
            title: 'Overlay Mode',
            childrenRequest: (page) => {
                const group = createGroup({
                    parent: page,
                    title: 'Overlay Mode',
                    description: 'Al activarlo, los menús de toggles con opciones se muestran superpuestos sobre los ajustes rápidos. Corrige el desbordamiento en pantallas pequeñas.',
                });
                group.add(createSpinButtonRow({
                    settings: s,
                    bindKey: 'qst-overlay-menu-width',
                    title: 'Ancho del overlay',
                    subtitle: 'Ancho en píxeles (0 = sin ajuste)',
                    adjProps: { lower: 0, upper: 2048, step: 10 },
                }));
                group.add(createSpinButtonRow({
                    settings: s,
                    bindKey: 'qst-overlay-menu-animate-duration',
                    title: 'Duración de animación',
                    subtitle: 'Milisegundos (0 = sin animación)',
                    adjProps: { lower: 0, upper: 4000, step: 50 },
                }));
                group.add(createComboRow({
                    settings: s,
                    bindKey: 'qst-overlay-menu-animate-style',
                    title: 'Estilo de animación',
                    subtitle: 'Cómo aparece el menú superpuesto',
                    options: {
                        flyout: 'Flyout (se expande desde el toggle)',
                        dialog: 'Diálogo (escala desde el centro)',
                    },
                }));
                group.add(createComboRow({
                    settings: s,
                    bindKey: 'qst-overlay-menu-overflow-anchor',
                    title: 'Anclaje por desbordamiento',
                    subtitle: 'Si el menú es más alto que la ventana de ajustes',
                    options: {
                        top: 'Arriba',
                        center: 'Centro',
                        bottom: 'Abajo',
                    },
                }));
            },
        });
    }

    _addEnableSubSwitch(group, settings, bindKey, title) {
        const sw = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind(bindKey, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
        const row = new Adw.ActionRow({ title, activatable_widget: sw });
        row.add_suffix(sw);
        group.add(row);
    }

    _addFontToggleRow(group, settings, toggleKey, fontKey, title) {
        group.add(createSwitchRow({ settings, bindKey: toggleKey, title }));
        group.add(createEntryRow({ settings, bindKey: fontKey, title: 'Fuente', subtitle: 'Nombre de la fuente (ej: Monospace)' }));
    }
}

// ══════════════════════════════════════════════════════════════════
//  TOGGLE ORDERING
// ══════════════════════════════════════════════════════════════════

const SYSTEM_NAMES = {
    NMWiredToggle: 'Cableada', NMWirelessToggle: 'Wi-Fi', NMModemToggle: 'Red Móvil',
    NMBluetoothToggle: 'BT Tethering', NMVpnToggle: 'VPN', BluetoothToggle: 'Bluetooth',
    PowerProfilesToggle: 'Modo de Energía', NightLightToggle: 'Luz Nocturna',
    DarkModeToggle: 'Modo Oscuro', DoNotDisturbToggle: 'No Molestar',
    KeyboardBrightnessToggle: 'Teclado Retroiluminado', RfkillToggle: 'Modo Avión',
    RotationToggle: 'Auto Rotar', DndQuickToggle: 'DND', UnsafeQuickToggle: 'Modo Inseguro',
};
const SYSTEM_ICONS = {
    NMWiredToggle: 'network-wired-symbolic', NMWirelessToggle: 'network-wireless-signal-excellent-symbolic',
    NMModemToggle: 'network-cellular-symbolic', NMBluetoothToggle: 'network-cellular-symbolic',
    NMVpnToggle: 'network-vpn-symbolic', BluetoothToggle: 'bluetooth-active-symbolic',
    PowerProfilesToggle: 'power-profile-balanced-symbolic', NightLightToggle: 'night-light-symbolic',
    DarkModeToggle: 'weather-clear-night', DoNotDisturbToggle: 'notifications-disabled-symbolic',
    KeyboardBrightnessToggle: 'preferences-desktop-keyboard', RfkillToggle: 'airplane-mode-symbolic',
    RotationToggle: 'object-rotate-right', DndQuickToggle: 'emblem-system-symbolic',
    UnsafeQuickToggle: 'channel-secure-symbolic',
};

function getDisplayName(item) {
    if (item.nonOrdered) return 'Otros toggles';
    if (item.isSystem && item.constructorName)
        return SYSTEM_NAMES[item.constructorName] || item.constructorName;
    return item.friendlyName || item.constructorName || '(sin nombre)';
}
function getSubtitle(item) {
    if (item.nonOrdered) return 'Los toggles no listados aparecerán aquí';
    if (item.isSystem) return 'Toggle del sistema';
    const parts = [];
    if (item.constructorName) parts.push(`ctor: ${item.constructorName}`);
    if (item.titleRegex) parts.push(`regex: ${item.titleRegex}`);
    return parts.join(', ') || 'Toggle personalizado';
}
function getIconName(item) {
    if (item.isSystem && item.constructorName)
        return SYSTEM_ICONS[item.constructorName] || 'emblem-system-symbolic';
    if (item.icon)
        return item.icon;
    return 'preferences-other-symbolic';
}

function serializeToList(list) {
    return list.map(item => {
        const dict = {};
        for (const [key, value] of Object.entries(item)) {
            if (key === 'cachedTitleRegex') continue;
            if (typeof value === 'boolean')
                dict[key] = GLib.Variant.new_variant(GLib.Variant.new_boolean(value));
            else if (typeof value === 'string')
                dict[key] = GLib.Variant.new_variant(GLib.Variant.new_string(value));
            else if (typeof value === 'number')
                dict[key] = GLib.Variant.new_variant(GLib.Variant.new_int32(value));
            else if (Array.isArray(value))
                dict[key] = GLib.Variant.new_variant(GLib.Variant.new_strv(value));
        }
        return dict;
    });
}
function shouldShow(item) { return true; }
function moveBlocking(_list, _moving, _movingIndex, _target, _targetIndex) { return false; }
function skip(list, _moving, _movingIndex, target, _targetIndex) { return shouldShow(target); }

function moveItem(list, item, offset) {
    const idx = list.indexOf(item);
    if (idx === -1 || offset === 0) return false;
    const sign = Math.sign(offset);
    let targetIndex = idx;
    for (let count = Math.abs(offset); count > 0;) {
        if (targetIndex <= 0 && sign === -1) break;
        if (targetIndex >= (list.length - 1) && sign === 1) break;
        if (moveBlocking(list, item, idx, list[targetIndex], targetIndex)) break;
        targetIndex += sign;
        if (skip(list, item, idx, list[targetIndex], targetIndex)) count--;
    }
    if (idx === targetIndex) return false;
    list.splice(idx, 1);
    list.splice(targetIndex, 0, item);
    return true;
}

function addMoveButtons(row, list, item, saveList, rebuild) {
    const upBtn = Gtk.Button.new_from_icon_name('go-up-symbolic');
    upBtn.has_frame = false; upBtn.valign = Gtk.Align.CENTER; upBtn.tooltip_text = 'Mover arriba';
    upBtn.connect('clicked', () => { if (moveItem(list, item, -1)) { saveList(list); rebuild(); } });
    const downBtn = Gtk.Button.new_from_icon_name('go-down-symbolic');
    downBtn.has_frame = false; downBtn.valign = Gtk.Align.CENTER; downBtn.tooltip_text = 'Mover abajo';
    downBtn.connect('clicked', () => { if (moveItem(list, item, 1)) { saveList(list); rebuild(); } });
    row.add_prefix(downBtn);
    row.add_prefix(upBtn);
}

function saveItem(item, rows) {
    item.friendlyName = rows.nameRow.get_text();
    item.icon = rows.iconEntry ? rows.iconEntry.get_text() : '';
    item.constructorName = rows.ctorRow.get_text();
    item.titleRegex = rows.regexRow.get_text();
    item.gtypeName = rows.gtypeRow.get_text();
    item.commandOn = rows.onCmdRow.get_text();
    item.commandOff = rows.offCmdRow.get_text();
    item.checkCommand = rows.checkCmdEntry ? rows.checkCmdEntry.get_text() : '';
    item.checkRegex = rows.checkRegexEntry ? rows.checkRegexEntry.get_text() : '';
    item.keybinding = rows.shortcutLabel.accelerator || '';
    item.initialState = rows.initialStateCombo.selected;
    item.runAtBoot = rows.runAtBootSwitch.active;
    item.delayTime = rows.delaySpin.value;
    item.buttonClick = rows.buttonClickCombo.selected;
    item.showIndicator = rows.showIndicatorSwitch.active;
    item.closeMenu = rows.closeMenuSwitch.active;
    item.checkExitCode = rows.checkExitCodeSwitch.active;
    item.commandSync = rows.commandSyncSwitch.active;
    item.pollInterval = rows.pollIntervalSpin.value;
}

function newItemDefaults() {
    return {
        hide: false, isSystem: false, constructorName: '',
        friendlyName: 'Toggle personalizado', titleRegex: '', gtypeName: '',
        icon: '', commandOn: '', commandOff: '',
        checkCommand: '', checkRegex: '', keybinding: '',
        initialState: 2, runAtBoot: false, delayTime: 3,
        buttonClick: 2, showIndicator: false, closeMenu: false,
        checkExitCode: false, commandSync: false, pollInterval: 10,
    };
}

function buildEditFormRows(page, item, rootWindow) {
    const rows = {};
    const appGroup = new Adw.PreferencesGroup({ title: 'Apariencia' });
    page.add(appGroup);
    rows.nameRow = new Adw.EntryRow({ title: 'Nombre' });
    rows.nameRow.set_text(item.friendlyName || '');
    appGroup.add(rows.nameRow);
    rows.iconRow = new Adw.ActionRow({ title: 'Icono', subtitle: 'Nombre del icono' });
    const iconBox = new Gtk.Box({ spacing: 14, valign: Gtk.Align.CENTER });
    rows.iconPreview = Gtk.Image.new_from_icon_name(item.icon || 'preferences-other-symbolic');
    rows.iconPreview.pixel_size = 20;
    iconBox.append(rows.iconPreview);
    rows.iconEntry = new Gtk.Entry({ text: item.icon || '', valign: Gtk.Align.CENTER });
    iconBox.append(rows.iconEntry);
    rows.iconRow.add_suffix(iconBox);
    rows.iconRow.activatable_widget = rows.iconEntry;
    appGroup.add(rows.iconRow);
    rows.iconEntry.connect('changed', () => {
        const name = rows.iconEntry.get_text().trim() || 'preferences-other-symbolic';
        rows.iconPreview.icon_name = name;
    });
    const refLink = new Gtk.LinkButton({
        uri: 'https://gitlab.gnome.org/GNOME/adwaita-icon-theme/-/tree/master/Adwaita/symbolic',
        label: 'Más iconos',
        valign: Gtk.Align.CENTER,
    });
    const refRow = new Adw.ActionRow({
        title: 'Sugerencias',
        subtitle: 'face-smile-symbolic, heart-symbolic, starred-symbolic, audio-headphones-symbolic, battery-good-symbolic, …',
    });
    refRow.add_suffix(refLink);
    appGroup.add(refRow);
    const matchGroup = new Adw.PreferencesGroup({ title: 'Reglas de coincidencia', description: 'Identifica el toggle en el sistema. Vacío si es sólo comandos.' });
    page.add(matchGroup);
    rows.ctorRow = new Adw.EntryRow({ title: 'Constructor name' });
    rows.ctorRow.set_text(item.constructorName || '');
    matchGroup.add(rows.ctorRow);
    rows.regexRow = new Adw.EntryRow({ title: 'Regex de título' });
    rows.regexRow.set_text(item.titleRegex || '');
    matchGroup.add(rows.regexRow);
    rows.gtypeRow = new Adw.EntryRow({ title: 'GType name' });
    rows.gtypeRow.set_text(item.gtypeName || '');
    matchGroup.add(rows.gtypeRow);
    const cmdGroup = new Adw.PreferencesGroup({ title: 'Comandos', description: 'Comandos a ejecutar al activar/desactivar' });
    page.add(cmdGroup);
    rows.onCmdRow = new Adw.EntryRow({ title: 'Comando ON' });
    rows.onCmdRow.set_text(item.commandOn || '');
    cmdGroup.add(rows.onCmdRow);
    rows.offCmdRow = new Adw.EntryRow({ title: 'Comando OFF' });
    rows.offCmdRow.set_text(item.commandOff || '');
    cmdGroup.add(rows.offCmdRow);
    rows.checkCmdRow = new Adw.ActionRow({ title: 'Comando de verificación', subtitle: 'Consulta el estado actual' });
    rows.checkCmdEntry = new Gtk.Entry({ text: item.checkCommand || '', valign: Gtk.Align.CENTER });
    rows.checkCmdRow.add_suffix(rows.checkCmdEntry);
    rows.checkCmdRow.activatable_widget = rows.checkCmdEntry;
    cmdGroup.add(rows.checkCmdRow);
    rows.checkRegexRow = new Adw.ActionRow({ title: 'Término de búsqueda', subtitle: 'Texto a buscar en la salida del comando' });
    rows.checkRegexEntry = new Gtk.Entry({ text: item.checkRegex || '', valign: Gtk.Align.CENTER });
    rows.checkRegexRow.add_suffix(rows.checkRegexEntry);
    rows.checkRegexRow.activatable_widget = rows.checkRegexEntry;
    cmdGroup.add(rows.checkRegexRow);
    const startupGroup = new Adw.PreferencesGroup({ title: 'Comportamiento de inicio' });
    page.add(startupGroup);
    const initialStateOptions = new Gtk.StringList();
    initialStateOptions.append('Activado'); initialStateOptions.append('Desactivado');
    initialStateOptions.append('Estado anterior'); initialStateOptions.append('Salida del comando');
    rows.initialStateCombo = new Adw.ComboRow({ title: 'Estado inicial', subtitle: 'Estado al iniciar sesión', model: initialStateOptions, selected: item.initialState ?? 2 });
    startupGroup.add(rows.initialStateCombo);
    rows.runAtBootSwitch = new Adw.SwitchRow({ title: 'Ejecutar comando al inicio', subtitle: 'Ejecuta ON/OFF al iniciar sesión', active: !!item.runAtBoot });
    startupGroup.add(rows.runAtBootSwitch);
    rows.delaySpin = new Adw.SpinRow({ title: 'Retardo (segundos)', adjustment: new Gtk.Adjustment({ lower: 0, upper: 10, step_increment: 1 }), value: item.delayTime ?? 3 });
    startupGroup.add(rows.delaySpin);
    const toggleGroup = new Adw.PreferencesGroup({ title: 'Comportamiento del toggle' });
    page.add(toggleGroup);
    const clickOptions = new Gtk.StringList();
    clickOptions.append('Siempre activado'); clickOptions.append('Siempre desactivado'); clickOptions.append('Alternar');
    rows.buttonClickCombo = new Adw.ComboRow({ title: 'Acción al hacer clic', subtitle: 'Comportamiento al presionar', model: clickOptions, selected: item.buttonClick ?? 2 });
    toggleGroup.add(rows.buttonClickCombo);
    rows.showIndicatorSwitch = new Adw.SwitchRow({ title: 'Mostrar indicador', subtitle: 'Icono en la barra superior cuando está activado', active: !!item.showIndicator });
    toggleGroup.add(rows.showIndicatorSwitch);
    rows.closeMenuSwitch = new Adw.SwitchRow({ title: 'Cerrar menú al presionar', active: !!item.closeMenu });
    toggleGroup.add(rows.closeMenuSwitch);
    rows.checkExitCodeSwitch = new Adw.SwitchRow({ title: 'Verificar código de salida', subtitle: 'Sólo alternar si el comando se ejecuta correctamente', active: !!item.checkExitCode });
    toggleGroup.add(rows.checkExitCodeSwitch);
    const syncGroup = new Adw.PreferencesGroup({ title: 'Sincronización' });
    page.add(syncGroup);
    rows.commandSyncSwitch = new Adw.SwitchRow({ title: 'Mantener sincronizado', subtitle: 'Actualiza periódicamente el estado según la salida del comando', active: !!item.commandSync });
    syncGroup.add(rows.commandSyncSwitch);
    rows.pollIntervalSpin = new Adw.SpinRow({ title: 'Frecuencia (segundos)', subtitle: 'Cada cuánto verificar el estado', adjustment: new Gtk.Adjustment({ lower: 2, upper: 900, step_increment: 1 }), value: item.pollInterval ?? 10 });
    syncGroup.add(rows.pollIntervalSpin);
    const shortcutGroup = new Adw.PreferencesGroup({ title: 'Atajo de teclado' });
    page.add(shortcutGroup);
    rows.shortcutLabel = new Gtk.ShortcutLabel({ accelerator: item.keybinding || null, disabled_text: 'Sin atajo', valign: Gtk.Align.CENTER });
    const shortcutRow = new Adw.ActionRow({ title: 'Atajo', activatable: true });
    shortcutRow.add_suffix(rows.shortcutLabel);
    shortcutGroup.add(shortcutRow);
    shortcutRow.connect('activated', () => {
        const captureWin = new Adw.Window({ modal: true, transient_for: rootWindow, width_request: 400, height_request: 250, content: new Adw.StatusPage({ title: 'Capturar atajo', description: 'Esc para cancelar, Retroceso para desactivar', icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic' }) });
        const controller = new Gtk.EventControllerKey();
        captureWin.add_controller(controller);
        controller.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (!mask && keyval === Gdk.KEY_Escape) { captureWin.close(); return Gdk.EVENT_STOP; }
            if (keyval === Gdk.KEY_BackSpace && !mask) { rows.shortcutLabel.accelerator = ''; captureWin.close(); return Gdk.EVENT_STOP; }
            if (!mask || !Gtk.accelerator_valid(keyval, mask)) return Gdk.EVENT_STOP;
            rows.shortcutLabel.accelerator = Gtk.accelerator_name(keyval, mask);
            captureWin.close(); return Gdk.EVENT_STOP;
        });
        captureWin.present();
    });
    return { rows, appGroup };
}

function openEditDialog(parentWindow, settings, item, onSave) {
    const isNew = !item.friendlyName || item.friendlyName === 'Toggle personalizado' || /^My item #\d+$/.test(item.friendlyName);
    createDialog({
        window: parentWindow,
        title: isNew ? 'Nuevo toggle' : item.friendlyName,
        childrenRequest: (page, dlg) => {
            const { rows, appGroup } = buildEditFormRows(page, item, parentWindow);
            const saveBtn = new Gtk.Button({ icon_name: 'document-save-symbolic', has_frame: true });
            saveBtn.tooltip_text = 'Guardar';
            saveBtn.add_css_class('flat');
            saveBtn.connect('clicked', () => {
                try {
                    saveItem(item, rows);
                    if (onSave) onSave(item);
                    dlg.close();
                } catch (e) {
                    console.error('[LIDSoL] Error saving toggle:', e);
                }
            });
            appGroup.header_suffix = saveBtn;
        },
    });
}

function getNextName(list) {
    let nth = 1;
    while (true) {
        const name = `My item #${nth}`;
        if (!list.find(item => item.friendlyName === name)) return name;
        nth++;
    }
}

function openToggleOrderDialog(parentWindow, settings) {
    let dialog = null;
    let rebuild = null;
    const getList = () => {
        try { return settings.get_value('qst-toggles-order').recursiveUnpack(); }
        catch (e) { console.warn('[LIDSoL prefs] Failed to read qst-toggles-order:', e); return []; }
    };
    const saveList = (list) => {
        settings.set_value('qst-toggles-order', new GLib.Variant('aa{sv}', serializeToList(list)));
    };
    const addNewItem = () => {
        const newItem = newItemDefaults();
        newItem.friendlyName = getNextName(getList());
        openEditDialog(parentWindow, settings, newItem, (savedItem) => {
            const list = getList(); list.push(savedItem); saveList(list); rebuild();
        });
    };
    dialog = createDialog({
        window: parentWindow,
        title: 'Ordenar y ocultar toggles',
        childrenRequest: (page, dlg) => {
            dialog = dlg;
            const group = new Adw.PreferencesGroup({ title: 'Toggles', description: 'Usa las flechas para reordenar. El switch oculta.' });
            page.add(group);
            const rows = [];
            rebuild = () => {
                for (const r of rows) group.remove(r);
                rows.length = 0;
                const headerBox = new Gtk.Box({ spacing: 4 });
                const newBtn = new Gtk.Button({ has_frame: true, valign: Gtk.Align.CENTER });
                newBtn.add_css_class('lidsol-new-item-btn');
                const s = new Gtk.CssProvider();
                s.load_from_string('.lidsol-new-item-btn { padding: 8px 8px; min-height: 0; }');
                newBtn.get_style_context().add_provider(s, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                const c = new Gtk.Box(); newBtn.child = c;
                new Gtk.Image({ icon_name: 'list-add', pixel_size: 12, margin_end: 6 }).insert_before(c, null);
                new Gtk.Label({ label: 'Nuevo Toggle' }).insert_before(c, null);
                newBtn.connect('clicked', addNewItem);
                headerBox.append(newBtn);
                const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
                resetBtn.has_frame = false; resetBtn.valign = Gtk.Align.CENTER;
                resetBtn.tooltip_text = 'Restablecer valores predeterminados';
                resetBtn.connect('clicked', () => {
                    const alert = new Adw.AlertDialog({
                        heading: 'Restablecer valores predeterminados',
                        body: 'Se perderán todos los cambios realizados en los toggles personalizados. ¿Continuar?',
                    });
                    alert.add_response('cancel', 'Cancelar');
                    alert.add_response('reset', 'Restablecer');
                    alert.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
                    alert.set_default_response('cancel');
                    alert.set_close_response('cancel');
                    alert.connect('response', (_dlg, response) => {
                        if (response === 'reset') {
                            settings.reset('qst-toggles-order');
                            rebuild();
                        }
                    });
                    alert.present(parentWindow);
                });
                headerBox.append(resetBtn);
                group.header_suffix = headerBox;
                const list = getList();
                const addRow = (item) => {
                    const row = new Adw.ActionRow({ title: getDisplayName(item), subtitle: getSubtitle(item), activatable: false });
                    const icon = Gtk.Image.new_from_icon_name(getIconName(item));
                    icon.pixel_size = 18; icon.margin_start = 4; icon.margin_end = 4;
                    row.add_prefix(icon);
                    addMoveButtons(row, list, item, saveList, rebuild);
                    const hideSwitch = new Gtk.Switch({ active: !item.hide, valign: Gtk.Align.CENTER });
                    hideSwitch.connect('notify::active', () => { item.hide = !hideSwitch.active; saveList(list); rebuild(); });
                    row.add_suffix(hideSwitch);
                    if (!item.isSystem && !item.nonOrdered) {
                        const editBtn = Gtk.Button.new_from_icon_name('document-edit-symbolic');
                        editBtn.has_frame = false; editBtn.valign = Gtk.Align.CENTER;
                        editBtn.connect('clicked', () => { openEditDialog(parentWindow, settings, item, () => { saveList(list); rebuild(); }); });
                        row.add_suffix(editBtn);
                        const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
                        delBtn.has_frame = false; delBtn.valign = Gtk.Align.CENTER; delBtn.tooltip_text = 'Eliminar toggle';
                        delBtn.connect('clicked', () => { const idx = list.indexOf(item); list.splice(idx, 1); saveList(list); rebuild(); });
                        row.add_suffix(delBtn);
                    }
                    rows.push(row);
                    group.add(row);
                };
                for (const item of list) addRow(item);
            };
            rebuild();
        },
    });
}

// ══════════════════════════════════════════════════════════════════
//  SYSTEM ITEMS LAYOUT
// ══════════════════════════════════════════════════════════════════

const SYSTEM_ITEM_NAMES = {
    battery: 'Batería',
    laptopSpacer: 'Espaciador (portátil)',
    screenshot: 'Captura de pantalla',
    settings: 'Ajustes',
    desktopSpacer: 'Espaciador (escritorio)',
    lock: 'Bloqueo',
    shutdown: 'Apagado',
};

const SYSTEM_ITEM_ICONS = {
    battery: 'battery-symbolic',
    laptopSpacer: 'computer-symbolic',
    screenshot: 'camera-photo-symbolic',
    settings: 'preferences-system-symbolic',
    desktopSpacer: 'computer-symbolic',
    lock: 'system-lock-screen-symbolic',
    shutdown: 'system-shutdown-symbolic',
};

const SYSTEM_ITEM_DEFAULT_ORDER = [
    'battery', 'laptopSpacer', 'screenshot', 'settings',
    'desktopSpacer', 'lock', 'shutdown',
];

const SYSTEM_ITEM_HIDE_KEYS = {
    battery: 'qst-system-items-hide-battery',
    screenshot: 'qst-system-items-hide-screenshot',
    settings: 'qst-system-items-hide-settings',
    lock: 'qst-system-items-hide-lock',
    shutdown: 'qst-system-items-hide-shutdown',
};

function openSystemItemsDialog(parentWindow, settings) {
    let dialog = null;
    let rebuild = null;

    const getOrder = () => {
        try { return settings.get_strv('qst-system-items-order'); }
        catch (e) { return [...SYSTEM_ITEM_DEFAULT_ORDER]; }
    };
    const saveOrder = (order) => {
        settings.set_strv('qst-system-items-order', order);
    };
    const moveItem = (name, direction) => {
        const order = getOrder();
        const idx = order.indexOf(name);
        if (idx === -1) return;
        const target = idx + direction;
        if (target < 0 || target >= order.length) return;
        order.splice(idx, 1);
        order.splice(target, 0, name);
        saveOrder(order);
    };

    createDialog({
        window: parentWindow,
        title: 'Ordenar elementos del sistema',
        childrenRequest: (page, dlg) => {
            dialog = dlg;

            const masterGroup = new Adw.PreferencesGroup({
                title: 'Sistema',
                description: 'Controla la visibilidad y el orden de los botones del área de sistema en el menú de ajustes rápidos.',
            });
            page.add(masterGroup);

            const hideAllSwitch = new Gtk.Switch({
                active: settings.get_boolean('qst-system-items-hide'),
                valign: Gtk.Align.CENTER,
            });
            settings.bind('qst-system-items-hide', hideAllSwitch, 'active',
                Gio.SettingsBindFlags.DEFAULT);
            const hideAllRow = new Adw.ActionRow({
                title: 'Ocultar toda el área de sistema',
                subtitle: 'Reemplaza con el botón de apagado simplificado',
                activatable_widget: hideAllSwitch,
            });
            hideAllRow.add_suffix(hideAllSwitch);
            masterGroup.add(hideAllRow);

            const orderGroup = new Adw.PreferencesGroup({
                title: 'Orden y visibilidad',
                description: 'Usa las flechas para reordenar. El switch oculta el elemento.',
            });
            page.add(orderGroup);
            const rows = [];

            rebuild = () => {
                for (const r of rows) orderGroup.remove(r);
                rows.length = 0;

                const headerBox = new Gtk.Box({ spacing: 4 });
                const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
                resetBtn.has_frame = false;
                resetBtn.valign = Gtk.Align.CENTER;
                resetBtn.tooltip_text = 'Restablecer orden predeterminado';
                resetBtn.connect('clicked', () => {
                    const alert = new Adw.AlertDialog({
                        heading: 'Restablecer orden predeterminado',
                        body: 'Se perderán todos los cambios en el orden y visibilidad de los elementos del sistema. ¿Continuar?',
                    });
                    alert.add_response('cancel', 'Cancelar');
                    alert.add_response('reset', 'Restablecer');
                    alert.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
                    alert.set_default_response('cancel');
                    alert.set_close_response('cancel');
                    alert.connect('response', (_dlg, response) => {
                        if (response === 'reset') {
                            settings.reset('qst-system-items-order');
                            for (const key of Object.values(SYSTEM_ITEM_HIDE_KEYS))
                                settings.reset(key);
                            rebuild();
                        }
                    });
                    alert.present(parentWindow);
                });
                headerBox.append(resetBtn);
                orderGroup.header_suffix = headerBox;

                const order = getOrder();
                const addRow = (name) => {
                    const title = SYSTEM_ITEM_NAMES[name] || name;
                    const isSpacer = name === 'laptopSpacer' || name === 'desktopSpacer';
                    const row = new Adw.ActionRow({ title, activatable: false });

                    const icon = Gtk.Image.new_from_icon_name(
                        SYSTEM_ITEM_ICONS[name] || 'emblem-system-symbolic');
                    icon.pixel_size = 18;
                    icon.margin_start = 4;
                    icon.margin_end = 4;
                    row.add_prefix(icon);

                    const upBtn = Gtk.Button.new_from_icon_name('go-up-symbolic');
                    upBtn.has_frame = false;
                    upBtn.valign = Gtk.Align.CENTER;
                    upBtn.tooltip_text = 'Mover arriba';
                    upBtn.connect('clicked', () => { moveItem(name, -1); rebuild(); });
                    row.add_prefix(upBtn);

                    const downBtn = Gtk.Button.new_from_icon_name('go-down-symbolic');
                    downBtn.has_frame = false;
                    downBtn.valign = Gtk.Align.CENTER;
                    downBtn.tooltip_text = 'Mover abajo';
                    downBtn.connect('clicked', () => { moveItem(name, 1); rebuild(); });
                    row.add_prefix(downBtn);

                    if (!isSpacer) {
                        const hideKey = SYSTEM_ITEM_HIDE_KEYS[name];
                        const hideSwitch = new Gtk.Switch({
                            active: !settings.get_boolean(hideKey),
                            valign: Gtk.Align.CENTER,
                        });
                        settings.bind(hideKey, hideSwitch, 'active',
                            Gio.SettingsBindFlags.INVERT_BOOLEAN);
                        row.add_suffix(hideSwitch);
                    }

                    rows.push(row);
                    orderGroup.add(row);
                };
                for (const name of order) addRow(name);
            };
            rebuild();
        },
    });
}

export {CATEGORIES};
