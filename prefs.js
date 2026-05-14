'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { WorkspaceIndicatorPrefs } from './extension/modules/workspaceIndicator/prefsSettings.js';

const CATEGORIES = [
    {
        id: 'widgets',
        title: 'Widgets',
        icon: 'applications-graphics-symbolic',
        summary: 'Widgets visuales para el escritorio',
        description: 'Indicadores, controles multimedia, reloj de fondo y espacios de trabajo.',
    },
    {
        id: 'topbar',
        title: 'Top Bar / Panel',
        icon: 'pan-end-symbolic',
        summary: 'Personalización de la barra superior',
        description: 'Esquinas redondeadas, formato de fecha, contador de notificaciones y organización del panel.',
    },
    {
        id: 'shell',
        title: 'Shell',
        icon: 'system-search-symbolic',
        summary: 'Herramientas del sistema',
        description: 'Lanzador de aplicaciones, menú de apagado y notas rápidas.',
    },
    {
        id: 'quicksettings',
        title: 'Quick Settings',
        icon: 'emblem-system-symbolic',
        summary: 'Ajustes del menú rápido',
        description: 'Mejoras y personalización del menú de configuración rápida del sistema.',
    },
];

function _parseColorFromSetting(settings, key, colorButton) {
    const colorString = settings.get_string(key);
    const colorParsed = new Gdk.RGBA();
    const isParsed = colorParsed.parse(colorString);

    if (isParsed) {
        colorButton.set_rgba(colorParsed);
    } else {
        settings.set_string(key, '#000000ff');
    }
}

function _createSpinButton(adjustmentProps = {}) {
    const adj = new Gtk.Adjustment({
        lower: adjustmentProps.lower || 0,
        upper: adjustmentProps.upper || 100,
        step_increment: adjustmentProps.step || 1,
    });

    return new Gtk.SpinButton({
        adjustment: adj,
        numeric: true,
        digits: adjustmentProps.digits || 0,
        valign: Gtk.Align.CENTER,
    });
}

export default class LidsolWidgetsPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();

        const stack = new Adw.ViewStack();

        for (const cat of CATEGORIES) {
            const page = this._buildPage(cat);
            const sp = stack.add_titled(page, cat.id, cat.title);
            sp.set_icon_name(cat.icon);
        }

        const viewSwitcher = new Adw.ViewSwitcher({
            stack,
            policy: Adw.ViewSwitcherPolicy.WIDE,
        });

        const header = new Adw.HeaderBar();
        header.set_title_widget(viewSwitcher);

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        scrolled.set_child(stack);

        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(header);
        toolbar.set_content(scrolled);

        window.set_content(toolbar);
        window.set_default_size(900, 600);
    }

    _buildPage(cat) {
        const page = new Adw.PreferencesPage();
        page.set_name(cat.id);

        const descGroup = new Adw.PreferencesGroup({
            title: cat.summary,
            description: cat.description,
        });
        page.add(descGroup);

        if (cat.id === 'widgets') {
            this._addBackgroundClockSettings(page);
        }

        if (cat.id === 'topbar') {
            this._addPanelCornersSettings(page);
            this._addWorkspaceIndicatorSettings(page);
        }

        if (cat.id === 'shell') {
            this._addQuickTextSettings(page);
        }

        if (cat.id === 'quicksettings') {
            this._addUserAvatarSettings(page);
        }

        return page;
    }

    _addPanelCornersSettings(page) {
        const enableGroup = new Adw.PreferencesGroup();
        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('panel-corners-enabled'),
        });
        this._settings.bind('panel-corners-enabled', enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        const enableRow = new Adw.ActionRow({
            title: 'Habilitar Panel Corners',
            subtitle: 'Muestra esquinas redondeadas en el panel y la pantalla',
        });
        enableRow.add_suffix(enableSwitch);
        enableRow.activatable_widget = enableSwitch;
        enableGroup.add(enableRow);
        page.add(enableGroup);

        const panelGroup = new Adw.PreferencesGroup({
            title: 'Panel Corners',
            description: 'Esquinas redondeadas en la parte inferior del panel',
        });

        const panelSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        panelGroup.header_suffix = panelSwitch;
        this._settings.bind('panel-corners', panelSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);

        const radiusSpin = _createSpinButton({lower: 0, upper: 25, step: 1});
        this._settings.bind('panel-corner-radius', radiusSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const radiusRow = new Adw.ActionRow({
            title: 'Radio',
            subtitle: 'Tamaño recomendado: 12px para integrar con aplicaciones',
            activatable_widget: radiusSpin,
        });
        radiusRow.add_suffix(radiusSpin);
        panelGroup.add(radiusRow);

        const colorBtn = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            show_editor: true,
            use_alpha: false,
        });
        _parseColorFromSetting(this._settings, 'panel-corner-background-color', colorBtn);
        this._settings.connect('changed::panel-corner-background-color', () => {
            _parseColorFromSetting(this._settings, 'panel-corner-background-color', colorBtn);
        });
        colorBtn.connect('color-set', () => {
            const color = colorBtn.rgba.to_string();
            this._settings.set_string('panel-corner-background-color', color);
        });
        const colorRow = new Adw.ActionRow({
            title: 'Color',
            subtitle: 'Color de las esquinas (recomendado: negro)',
            activatable_widget: colorBtn,
        });
        colorRow.add_suffix(colorBtn);
        panelGroup.add(colorRow);

        const opacitySpin = _createSpinButton({lower: 0.0, upper: 1.0, step: 0.1, digits: 2});
        this._settings.bind('panel-corner-opacity', opacitySpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const opacityRow = new Adw.ActionRow({
            title: 'Opacidad',
            subtitle: 'Opacidad de las esquinas',
            activatable_widget: opacitySpin,
        });
        opacityRow.add_suffix(opacitySpin);
        panelGroup.add(opacityRow);

        [radiusRow, colorRow, opacityRow].forEach(row => {
            panelSwitch.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        });
        page.add(panelGroup);

        const screenGroup = new Adw.PreferencesGroup({
            title: 'Screen Corners',
            description: 'Esquinas redondeadas alrededor de la pantalla',
        });

        const screenSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        screenGroup.header_suffix = screenSwitch;
        this._settings.bind('screen-corners', screenSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);

        const sRadiusSpin = _createSpinButton({lower: 0, upper: 25, step: 1});
        this._settings.bind('screen-corner-radius', sRadiusSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const sRadiusRow = new Adw.ActionRow({
            title: 'Radio',
            subtitle: 'Tamaño recomendado: 12px',
            activatable_widget: sRadiusSpin,
        });
        sRadiusRow.add_suffix(sRadiusSpin);
        screenGroup.add(sRadiusRow);

        const sColorBtn = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            show_editor: true,
            use_alpha: false,
        });
        _parseColorFromSetting(this._settings, 'screen-corner-background-color', sColorBtn);
        this._settings.connect('changed::screen-corner-background-color', () => {
            _parseColorFromSetting(this._settings, 'screen-corner-background-color', sColorBtn);
        });
        sColorBtn.connect('color-set', () => {
            const color = sColorBtn.rgba.to_string();
            this._settings.set_string('screen-corner-background-color', color);
        });
        const sColorRow = new Adw.ActionRow({
            title: 'Color',
            subtitle: 'Color de las esquinas de la pantalla',
            activatable_widget: sColorBtn,
        });
        sColorRow.add_suffix(sColorBtn);
        screenGroup.add(sColorRow);

        const sOpacitySpin = _createSpinButton({lower: 0.0, upper: 1.0, step: 0.1, digits: 2});
        this._settings.bind('screen-corner-opacity', sOpacitySpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const sOpacityRow = new Adw.ActionRow({
            title: 'Opacidad',
            subtitle: 'Opacidad de las esquinas',
            activatable_widget: sOpacitySpin,
        });
        sOpacityRow.add_suffix(sOpacitySpin);
        screenGroup.add(sOpacityRow);

        [sRadiusRow, sColorRow, sOpacityRow].forEach(row => {
            screenSwitch.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        });
        page.add(screenGroup);

        const advancedGroup = new Adw.PreferencesGroup({
            title: 'Opciones avanzadas',
        });

        const forceSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        this._settings.bind('force-extension-values', forceSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);
        const forceRow = new Adw.ActionRow({
            title: 'Forzar valores de la extensión',
            subtitle: 'Sobreescribe las preferencias del tema actual',
            activatable_widget: forceSwitch,
        });
        forceRow.add_suffix(forceSwitch);
        advancedGroup.add(forceRow);

        const debugSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        this._settings.bind('debug', debugSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);
        const debugRow = new Adw.ActionRow({
            title: 'Modo debug',
            subtitle: 'Activa logs más verbosos para reportar problemas',
            activatable_widget: debugSwitch,
        });
        debugRow.add_suffix(debugSwitch);
        advancedGroup.add(debugRow);

        page.add(advancedGroup);
    }

    _addWorkspaceIndicatorSettings(page) {
        const prefs = new WorkspaceIndicatorPrefs(this._settings);
        prefs.populatePage(page);
    }

    _addBackgroundClockSettings(page) {
        const enableGroup = new Adw.PreferencesGroup({
            title: 'Background Clock',
            description: 'Reloj superpuesto en el escritorio con estilo personalizable',
        });

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('background-clock-enabled'),
        });
        this._settings.bind('background-clock-enabled', enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const enableRow = new Adw.ActionRow({
            title: 'Habilitar Background Clock',
            subtitle: 'Muestra un reloj en el fondo del escritorio',
        });
        enableRow.add_suffix(enableSwitch);
        enableRow.activatable_widget = enableSwitch;
        enableGroup.add(enableRow);

        const posSpin = _createSpinButton({lower: 0, upper: 8, step: 1});
        this._settings.bind('background-clock-position', posSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const posRow = new Adw.ActionRow({
            title: 'Posición',
            subtitle: '0=sup-izq … 8=inf-der (cuadrícula 3x3)',
            activatable_widget: posSpin,
        });
        posRow.add_suffix(posSpin);
        enableGroup.add(posRow);

        const xOffSpin = _createSpinButton({lower: -500, upper: 500, step: 1});
        this._settings.bind('background-clock-x-offset', xOffSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const xOffRow = new Adw.ActionRow({
            title: 'Desplazamiento horizontal',
            activatable_widget: xOffSpin,
        });
        xOffRow.add_suffix(xOffSpin);
        enableGroup.add(xOffRow);

        const yOffSpin = _createSpinButton({lower: -500, upper: 500, step: 1});
        this._settings.bind('background-clock-y-offset', yOffSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const yOffRow = new Adw.ActionRow({
            title: 'Desplazamiento vertical',
            activatable_widget: yOffSpin,
        });
        yOffRow.add_suffix(yOffSpin);
        enableGroup.add(yOffRow);

        page.add(enableGroup);

        const clockGroup = new Adw.PreferencesGroup({
            title: 'Hora',
            description: 'Configuración del reloj',
        });

        const clockEnable = new Gtk.Switch({valign: Gtk.Align.CENTER});
        clockGroup.header_suffix = clockEnable;
        this._settings.bind('background-clock-enable-clock', clockEnable, 'state', Gio.SettingsBindFlags.DEFAULT);

        const fmtEntry = new Gtk.Entry({
            text: this._settings.get_string('background-clock-clock-format'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('background-clock-clock-format', fmtEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const fmtRow = new Adw.ActionRow({
            title: 'Formato',
            subtitle: 'strftime: %H:%M (24h) o %I:%M %p (12h)',
            activatable_widget: fmtEntry,
        });
        fmtRow.add_suffix(fmtEntry);
        clockGroup.add(fmtRow);

        const sizeSpin = _createSpinButton({lower: 8, upper: 200, step: 2});
        this._settings.bind('background-clock-clock-size', sizeSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const sizeRow = new Adw.ActionRow({
            title: 'Tamaño',
            subtitle: 'Tamaño de fuente en puntos',
            activatable_widget: sizeSpin,
        });
        sizeRow.add_suffix(sizeSpin);
        clockGroup.add(sizeRow);

        const colorBtn = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            show_editor: true,
            use_alpha: false,
        });
        _parseColorFromSetting(this._settings, 'background-clock-clock-color', colorBtn);
        this._settings.connect('changed::background-clock-clock-color', () => {
            _parseColorFromSetting(this._settings, 'background-clock-clock-color', colorBtn);
        });
        colorBtn.connect('color-set', () => {
            this._settings.set_string('background-clock-clock-color', colorBtn.rgba.to_string());
        });
        const colorRow = new Adw.ActionRow({
            title: 'Color',
            activatable_widget: colorBtn,
        });
        colorRow.add_suffix(colorBtn);
        clockGroup.add(colorRow);

        const fontSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        this._settings.bind('background-clock-clock-custom-font', fontSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);
        const fontRow = new Adw.ActionRow({
            title: 'Fuente personalizada',
            activatable_widget: fontSwitch,
        });
        fontRow.add_suffix(fontSwitch);
        clockGroup.add(fontRow);

        const fontEntry = new Gtk.Entry({
            text: this._settings.get_string('background-clock-clock-font'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('background-clock-clock-font', fontEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const fontNameRow = new Adw.ActionRow({
            title: 'Fuente',
            subtitle: 'Nombre de la fuente (ej: Monospace)',
            activatable_widget: fontEntry,
        });
        fontNameRow.add_suffix(fontEntry);
        clockGroup.add(fontNameRow);

        page.add(clockGroup);

        const dateGroup = new Adw.PreferencesGroup({
            title: 'Fecha',
            description: 'Configuración de la fecha',
        });

        const dateEnable = new Gtk.Switch({valign: Gtk.Align.CENTER});
        dateGroup.header_suffix = dateEnable;
        this._settings.bind('background-clock-enable-date', dateEnable, 'state', Gio.SettingsBindFlags.DEFAULT);

        const dFmtEntry = new Gtk.Entry({
            text: this._settings.get_string('background-clock-date-format'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('background-clock-date-format', dFmtEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const dFmtRow = new Adw.ActionRow({
            title: 'Formato',
            subtitle: 'strftime: %A, %d de %B',
            activatable_widget: dFmtEntry,
        });
        dFmtRow.add_suffix(dFmtEntry);
        dateGroup.add(dFmtRow);

        const dSizeSpin = _createSpinButton({lower: 8, upper: 200, step: 2});
        this._settings.bind('background-clock-date-size', dSizeSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const dSizeRow = new Adw.ActionRow({
            title: 'Tamaño',
            activatable_widget: dSizeSpin,
        });
        dSizeRow.add_suffix(dSizeSpin);
        dateGroup.add(dSizeRow);

        const dColorBtn = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            show_editor: true,
            use_alpha: false,
        });
        _parseColorFromSetting(this._settings, 'background-clock-date-color', dColorBtn);
        this._settings.connect('changed::background-clock-date-color', () => {
            _parseColorFromSetting(this._settings, 'background-clock-date-color', dColorBtn);
        });
        dColorBtn.connect('color-set', () => {
            this._settings.set_string('background-clock-date-color', dColorBtn.rgba.to_string());
        });
        const dColorRow = new Adw.ActionRow({
            title: 'Color',
            activatable_widget: dColorBtn,
        });
        dColorRow.add_suffix(dColorBtn);
        dateGroup.add(dColorRow);

        const dFontSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        this._settings.bind('background-clock-date-custom-font', dFontSwitch, 'state', Gio.SettingsBindFlags.DEFAULT);
        const dFontRow = new Adw.ActionRow({
            title: 'Fuente personalizada',
            activatable_widget: dFontSwitch,
        });
        dFontRow.add_suffix(dFontSwitch);
        dateGroup.add(dFontRow);

        const dFontEntry = new Gtk.Entry({
            text: this._settings.get_string('background-clock-date-font'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('background-clock-date-font', dFontEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const dFontNameRow = new Adw.ActionRow({
            title: 'Fuente',
            activatable_widget: dFontEntry,
        });
        dFontNameRow.add_suffix(dFontEntry);
        dateGroup.add(dFontNameRow);

        page.add(dateGroup);

        const bgGroup = new Adw.PreferencesGroup({
            title: 'Contenedor',
            description: 'Estilo del fondo del reloj',
        });

        const bgColorBtn = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            show_editor: true,
            use_alpha: true,
        });
        _parseColorFromSetting(this._settings, 'background-clock-bg-color', bgColorBtn);
        this._settings.connect('changed::background-clock-bg-color', () => {
            _parseColorFromSetting(this._settings, 'background-clock-bg-color', bgColorBtn);
        });
        bgColorBtn.connect('color-set', () => {
            this._settings.set_string('background-clock-bg-color', bgColorBtn.rgba.to_string());
        });
        const bgColorRow = new Adw.ActionRow({
            title: 'Color de fondo',
            subtitle: 'Usa alpha para fondo semitransparente',
            activatable_widget: bgColorBtn,
        });
        bgColorRow.add_suffix(bgColorBtn);
        bgGroup.add(bgColorRow);

        const padSpin = _createSpinButton({lower: 0, upper: 100, step: 2});
        this._settings.bind('background-clock-bg-padding', padSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const padRow = new Adw.ActionRow({
            title: 'Padding',
            activatable_widget: padSpin,
        });
        padRow.add_suffix(padSpin);
        bgGroup.add(padRow);

        const bRadiusSpin = _createSpinButton({lower: 0, upper: 50, step: 1});
        this._settings.bind('background-clock-bg-border-radius', bRadiusSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const bRadiusRow = new Adw.ActionRow({
            title: 'Radio del borde',
            activatable_widget: bRadiusSpin,
        });
        bRadiusRow.add_suffix(bRadiusSpin);
        bgGroup.add(bRadiusRow);

        page.add(bgGroup);
    }

    _addQuickTextSettings(page) {
        const group = new Adw.PreferencesGroup({
            title: 'Quick Text',
            description: 'Captura rápida de notas mediante atajo de teclado',
        });

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('qt-enabled'),
        });
        this._settings.bind('qt-enabled', enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const enableRow = new Adw.ActionRow({
            title: 'Habilitar Quick Text',
            subtitle: 'Permite capturar notas rápidas con Ctrl+Super+I',
        });
        enableRow.add_suffix(enableSwitch);
        enableRow.activatable_widget = enableSwitch;
        group.add(enableRow);

        const multilineSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('qt-multiline'),
        });
        this._settings.bind('qt-multiline', multilineSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const multilineRow = new Adw.ActionRow({
            title: 'Entrada de una sola línea',
            subtitle: 'Si está activo, Enter guarda la nota directamente',
        });
        multilineRow.add_suffix(multilineSwitch);
        multilineRow.activatable_widget = multilineSwitch;
        group.add(multilineRow);

        const hideactedSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('qt-hideacted'),
        });
        this._settings.bind('qt-hideacted', hideactedSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const hideactedRow = new Adw.ActionRow({
            title: 'Ocultar notas procesadas',
            subtitle: 'Oculta notas marcadas como procesadas en la ventana de acciones',
        });
        hideactedRow.add_suffix(hideactedSwitch);
        hideactedRow.activatable_widget = hideactedSwitch;
        group.add(hideactedRow);

        const hotkeyEntry = new Gtk.Entry({
            text: this._settings.get_strv('qt-hotkey')[0] || '',
            valign: Gtk.Align.CENTER,
        });
        hotkeyEntry.connect('changed', () => {
            this._settings.set_strv('qt-hotkey', [hotkeyEntry.get_text()]);
        });
        const hotkeyRow = new Adw.ActionRow({
            title: 'Atajo de teclado',
            subtitle: 'Combinación para abrir el diálogo de notas',
            activatable_widget: hotkeyEntry,
        });
        hotkeyRow.add_suffix(hotkeyEntry);
        group.add(hotkeyRow);

        const filepathEntry = new Gtk.Entry({
            text: this._settings.get_string('qt-filepath'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('qt-filepath', filepathEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const filepathRow = new Adw.ActionRow({
            title: 'Archivo de notas',
            subtitle: 'Ruta absoluta al archivo de texto donde se guardarán las notas',
            activatable_widget: filepathEntry,
        });
        filepathRow.add_suffix(filepathEntry);
        group.add(filepathRow);

        const prependEntry = new Gtk.Entry({
            text: this._settings.get_string('qt-prepend'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('qt-prepend', prependEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const prependRow = new Adw.ActionRow({
            title: 'Prefijo',
            subtitle: 'Texto antes de cada nota (vacío = fecha actual)',
            activatable_widget: prependEntry,
        });
        prependRow.add_suffix(prependEntry);
        group.add(prependRow);

        const appendEntry = new Gtk.Entry({
            text: this._settings.get_string('qt-append'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('qt-append', appendEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        const appendRow = new Adw.ActionRow({
            title: 'Separador',
            subtitle: 'Texto que separa las notas en el archivo',
            activatable_widget: appendEntry,
        });
        appendRow.add_suffix(appendEntry);
        group.add(appendRow);

        page.add(group);
    }

    _addUserAvatarSettings(page) {
        const group = new Adw.PreferencesGroup({
            title: 'Avatar de Usuario',
            description: 'Muestra el avatar del usuario en el menú de ajustes rápidos, junto a los botones del sistema',
        });

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('user-avatar-enabled'),
        });
        this._settings.bind('user-avatar-enabled', enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const enableRow = new Adw.ActionRow({
            title: 'Habilitar Avatar de Usuario',
            subtitle: 'Muestra tu foto de perfil en el menú de ajustes rápidos',
        });
        enableRow.add_suffix(enableSwitch);
        enableRow.activatable_widget = enableSwitch;
        group.add(enableRow);

        const positionModel = new Gtk.StringList({ strings: ['Derecha', 'Izquierda'] });
        const positionRow = new Adw.ComboRow({
            title: 'Posición',
            subtitle: 'Posición del avatar respecto a los botones del sistema',
            model: positionModel,
            selected: this._settings.get_int('ua-position'),
        });
        positionRow.connect('notify::selected', () => {
            this._settings.set_int('ua-position', positionRow.selected);
        });
        group.add(positionRow);

        const sizeSpin = _createSpinButton({lower: 15, upper: 75, step: 2});
        this._settings.bind('ua-size', sizeSpin.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const sizeRow = new Adw.ActionRow({
            title: 'Tamaño',
            subtitle: '43 por defecto (coincide con los iconos de ajustes)',
            activatable_widget: sizeSpin,
        });
        sizeRow.add_suffix(sizeSpin);
        group.add(sizeRow);

        const realNameSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('ua-realname'),
        });
        this._settings.bind('ua-realname', realNameSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const realNameRow = new Adw.ActionRow({
            title: 'Mostrar nombre real',
            subtitle: 'Según la longitud, puede aumentar el ancho del panel',
            activatable_widget: realNameSwitch,
        });
        realNameRow.add_suffix(realNameSwitch);
        group.add(realNameRow);

        const userNameSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('ua-username'),
        });
        this._settings.bind('ua-username', userNameSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const userNameRow = new Adw.ActionRow({
            title: 'Mostrar nombre de usuario',
            activatable_widget: userNameSwitch,
        });
        userNameRow.add_suffix(userNameSwitch);
        group.add(userNameRow);

        const hostNameSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('ua-hostname'),
        });
        this._settings.bind('ua-hostname', hostNameSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const hostNameRow = new Adw.ActionRow({
            title: 'Mostrar nombre del equipo',
            activatable_widget: hostNameSwitch,
        });
        hostNameRow.add_suffix(hostNameSwitch);
        group.add(hostNameRow);

        const noBgSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('ua-nobackground'),
        });
        this._settings.bind('ua-nobackground', noBgSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const noBgRow = new Adw.ActionRow({
            title: 'Quitar fondo del botón',
            subtitle: 'Elimina el fondo predeterminado de los botones de ajustes',
            activatable_widget: noBgSwitch,
        });
        noBgRow.add_suffix(noBgSwitch);
        group.add(noBgRow);

        page.add(group);
    }
}
