'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

        if (cat.id === 'topbar')
            this._addPanelCornersSettings(page);

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
}
