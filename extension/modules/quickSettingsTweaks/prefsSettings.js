'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    createDialog,
    createModuleRow,
    createGroup,
    createSpinButtonRow,
    createComboRow,
    enableDragAutoScroll,
} from '../../utils/prefsHelpers.js';
import { UserAvatarPrefs } from '../userAvatar/prefsSettings.js';

export class QuickSettingsPrefs {
    constructor(settings, window) {
        this._settings = settings;
        this._window = window;
    }

    populateCategoryPage(page) {
        const systemGroup = new Adw.PreferencesGroup({
            title: 'Área de sistema',
            description: 'Avatar de usuario y organización de los botones del sistema.',
        });
        const avatarPrefs = new UserAvatarPrefs(this._settings, this._window);
        systemGroup.add(avatarPrefs.createModuleRow());
        systemGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-system-items-enabled',
            title: 'System Items Layout',
            subtitle: 'Reordena y oculta botones del área de sistema (captura, ajustes, bloqueo, apagado, batería)',
            onDetailed: () => {
                if (this._window && this._settings)
                    this.openSystemItemsDialog();
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
                    this.openToggleOrderDialog();
            },
        }));
        page.add(togglesGroup);

        // Overlay Mode y Animación: port de QST (página "Menu").
        this._addOverlayMenuSection(page);
    }

    // Overlay Mode y Animación: port de QST (página "Menu"). Un grupo con dos
    // filas-módulo; cada una abre su dialog de opciones.
    _addOverlayMenuSection(page) {
        const menuGroup = createGroup({
            parent: page,
            title: 'Menú',
            description: 'Modo overlay y animaciones al abrir los menús de los toggles.',
        });
        menuGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-overlay-menu-enabled',
            title: 'Overlay Mode',
            subtitle: 'Muestra los menús de toggles, energía y sonido como superposición (experimental)',
            onDetailed: () => {
                if (this._window && this._settings)
                    this.openOverlayMenuDialog();
            },
        }));
        menuGroup.add(createModuleRow({
            settings: this._settings,
            bindKey: 'qst-menu-animation-enabled',
            title: 'Animation',
            subtitle: 'Añade animación al menú al abrir y cerrar. Para mejor resultado, activa el modo overlay',
            onDetailed: () => {
                if (this._window && this._settings)
                    this.openMenuAnimationDialog();
            },
        }));
    }

    openOverlayMenuDialog() {
        createDialog({
            window: this._window,
            title: 'Overlay Mode',
            childrenRequest: (page) => {
                const group = createGroup({
                    parent: page,
                    title: 'Overlay Mode',
                    description: 'Muestra los menús de toggles, energía y sonido como superposición (experimental).',
                });
                group.add(createSpinButtonRow({
                    settings: this._settings,
                    bindKey: 'qst-overlay-menu-width',
                    title: 'Ancho del overlay',
                    subtitle: 'Ajusta el ancho del menú superpuesto. Poner a 0 desactiva el ajuste',
                    adjProps: { lower: 0, upper: 2048 },
                    sensitiveBind: 'qst-overlay-menu-enabled',
                }));
                group.add(createSpinButtonRow({
                    settings: this._settings,
                    bindKey: 'qst-overlay-menu-animate-duration',
                    title: 'Duración de la animación',
                    subtitle: 'Duración de la animación de apertura en microsegundos. Poner a 0 desactiva la animación personalizada',
                    adjProps: { lower: 0, upper: 4000 },
                    sensitiveBind: 'qst-overlay-menu-enabled',
                }));
                group.add(createComboRow({
                    settings: this._settings,
                    bindKey: 'qst-overlay-menu-animate-style',
                    title: 'Estilo de animación',
                    options: { flyout: 'Flyout', dialog: 'Dialog' },
                    sensitiveBind: 'qst-overlay-menu-enabled',
                }));
                group.add(createComboRow({
                    settings: this._settings,
                    bindKey: 'qst-overlay-menu-overflow-anchor',
                    title: 'Ancla de desbordamiento',
                    subtitle: 'Cuando el menú es más alto que los ajustes rápidos, determina dónde se fija el menú',
                    options: { top: 'Superior', center: 'Centro', bottom: 'Inferior' },
                    sensitiveBind: 'qst-overlay-menu-enabled',
                }));
            },
        });
    }

    openMenuAnimationDialog() {
        createDialog({
            window: this._window,
            title: 'Animación',
            childrenRequest: (page) => {
                const group = createGroup({
                    parent: page,
                    title: 'Estilo avanzado de animación',
                });
                const spin = (key, title, subtitle, adjProps = { lower: 0, upper: 4000, step: 1 }) =>
                    group.add(createSpinButtonRow({
                        settings: this._settings,
                        bindKey: key,
                        title,
                        subtitle: subtitle ?? null,
                        adjProps,
                        sensitiveBind: 'qst-menu-animation-enabled',
                    }));
                spin('qst-menu-animation-open-duration', 'Duración de apertura',
                    'Duración de la animación de apertura en microsegundos');
                spin('qst-menu-animation-close-duration', 'Duración de cierre',
                    'Duración de la animación de cierre en microsegundos');
                spin('qst-menu-animation-grid-content-opacity', 'Opacidad del contenido',
                    'Opacidad del contenido del grid. 255 = opaco, 0 = transparente',
                    { lower: 0, upper: 255 });
                spin('qst-menu-animation-background-blur-radius', 'Radio de desenfoque del fondo',
                    'Radio del desenfoque del fondo. Poner a 0 desactiva el desenfoque',
                    { lower: 0, upper: 32 });
                spin('qst-menu-animation-background-brightness', 'Brillo del fondo',
                    'Ajusta el brillo del fondo; 1000 desactiva el control de brillo',
                    { lower: 0, upper: 2000 });
                spin('qst-menu-animation-background-opacity', 'Opacidad del fondo',
                    'Opacidad del fondo. 255 = opaco, 0 = transparente',
                    { lower: 0, upper: 255 });
                spin('qst-menu-animation-background-scale-x', 'Escala X del fondo',
                    'Escala horizontal del fondo; 1000 equivale a escala 1.0',
                    { lower: 0, upper: 4000 });
                spin('qst-menu-animation-background-scale-y', 'Escala Y del fondo',
                    'Escala vertical del fondo; 1000 equivale a escala 1.0',
                    { lower: 0, upper: 4000 });
            },
        });
    }

    openToggleOrderDialog() {
        const parentWindow = this._window;
        const settings = this._settings;
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
        createDialog({
            window: parentWindow,
            title: 'Ordenar y ocultar toggles',
            childrenRequest: (page) => {
                const group = new Adw.PreferencesGroup({
                    title: 'Toggles',
                    description: 'Arrastra y suelta para reordenar. El switch oculta.',
                });
                page.add(group);

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

                const listBox = new Gtk.ListBox({
                    selection_mode: Gtk.SelectionMode.NONE,
                    show_separators: true,
                });
                listBox.add_css_class('boxed-list');
                listBox.set_placeholder(new QuickTogglesPlaceholder());
                group.add(listBox);

                rebuild = () => {
                    listBox.remove_all();
                    const list = getList();
                    const ctx = { window: parentWindow, settings, list, saveList, getList, rebuild };
                    for (const item of list)
                        listBox.append(_qtCreateRow(item, ctx));
                };

                _qtAddListBoxDropTarget(listBox, getList, saveList, rebuild);
                enableDragAutoScroll(listBox);
                rebuild();
            },
        });
    }

    openSystemItemsDialog() {
        const parentWindow = this._window;
        const settings = this._settings;

        createDialog({
            window: parentWindow,
            title: 'Ordenar elementos del sistema',
            childrenRequest: (page) => {
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
                    description: 'Arrastra y suelta para reordenar. El switch oculta el elemento.',
                });
                page.add(orderGroup);

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

                const listBox = new Gtk.ListBox({
                    selection_mode: Gtk.SelectionMode.NONE,
                    show_separators: true,
                });
                listBox.add_css_class('boxed-list');
                listBox.set_placeholder(new SystemItemsPlaceholder());
                orderGroup.add(listBox);

                const rebuild = () => {
                    listBox.remove_all();
                    _populateListBox(listBox, settings);
                };

                _addListBoxDropTarget(listBox, settings);
                enableDragAutoScroll(listBox);
                rebuild();
            },
        });
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
    if (item.options?.length) parts.push(`${item.options.length} opciones`);
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
            else if (Array.isArray(value)) {
                if (value.every(v => v && typeof v === 'object'))
                    dict[key] = GLib.Variant.new_variant(serializeOptionsList(value));
                else
                    dict[key] = GLib.Variant.new_variant(GLib.Variant.new_strv(value));
            }
        }
        return dict;
    });
}

// 2.3.3 — Opciones del menú: [{ label, command, icon }, ...] → aa{sv}
function serializeOptionsList(options) {
    return new GLib.Variant('aa{sv}', options.map(op => ({
        label: GLib.Variant.new_variant(GLib.Variant.new_string(String(op.label ?? ''))),
        command: GLib.Variant.new_variant(GLib.Variant.new_string(String(op.command ?? ''))),
        icon: GLib.Variant.new_variant(GLib.Variant.new_string(String(op.icon ?? ''))),
    })));
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
    item.options = rows.options.map(o => ({
        label: o.labelEntry.get_text(),
        command: o.cmdEntry.get_text(),
        icon: o.iconRow.get_text(),
    }));
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
        options: [],
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

    // ── Opciones del menú ──
    const optsGroup = new Adw.PreferencesGroup({
        title: 'Opciones del menú',
        description: 'Etiqueta, comando e icono de cada opción del menú. Arrastra para reordenar.',
    });
    page.add(optsGroup);

    rows.options = [];

    // Cada opción es un ExpanderRow (título = etiqueta, subtítulo = comando)
    // dentro de un ListBox: el reorden por arrastre así usa get_index() y un
    // re-append de las mismas instancias (GTK4 ya no tiene ListBox.reorder),
    // conservando el estado expandido y los textos sin guardar.
    //
    // El botón "Añadir opción" vive como primera fila de la misma boxed list:
    // así el bloque queda visualmente continuo (solo la primera y la última
    // fila tienen esquinas redondeadas, las internas no). Por eso el índice
    // de fila en el ListBox es el del array + 1.
    const optsListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        show_separators: true,
    });
    optsListBox.add_css_class('boxed-list');
    optsGroup.add(optsListBox);

    const addBtnRow = new Adw.ButtonRow({ title: 'Añadir opción' });
    addBtnRow.start_icon_name = 'list-add-symbolic';
    optsListBox.append(addBtnRow);

    const addOptionRow = (opt = {}) => {
        // Fila expandible: colapsada muestra la etiqueta (título) y el comando
        // (subtítulo); expandida muestra Etiqueta / Comando / Icono.
        const row = new QuickToggleOptionRow();
        row.set_title(opt.label?.trim() || 'Sin etiqueta');
        const optionCmd = opt.command?.trim();
        if (optionCmd)
            row.set_subtitle(optionCmd);

        // Asa de arrastre para indicar que la fila es draggable.
        const dragHandle = Gtk.Image.new_from_icon_name('list-drag-handle-symbolic');
        dragHandle.pixel_size = 14;
        dragHandle.margin_start = 4;
        dragHandle.margin_end = 6;
        dragHandle.opacity = 0.5;
        row.add_prefix(dragHandle);

        // Etiqueta: nombre que se muestra en el menú.
        const labelEntry = new Adw.EntryRow({ title: 'Etiqueta' });
        labelEntry.set_text(opt.label || '');
        labelEntry.connect('notify::text', () => {
            row.set_title(labelEntry.get_text().trim() || 'Sin etiqueta');
        });
        row.add_row(labelEntry);

        // Comando: comando a ejecutar al pulsar la opción.
        const cmdEntry = new Adw.EntryRow({ title: 'Comando' });
        cmdEntry.set_text(opt.command || '');
        cmdEntry.connect('notify::text', () => {
            row.set_subtitle(cmdEntry.get_text().trim());
        });
        row.add_row(cmdEntry);

        // Icono: icono personalizado de la opción + vista previa (el botón de
        // eliminar vive junto al chevron, en el título de la fila).
        const iconRow = new Adw.EntryRow({ title: 'Icono' });
        iconRow.set_text(opt.icon || '');
        const iconPreview = Gtk.Image.new_from_icon_name(
            opt.icon?.trim() || 'preferences-other-symbolic');
        iconPreview.pixel_size = 20;
        iconPreview.valign = Gtk.Align.CENTER;
        const suffixBox = new Gtk.Box({ spacing: 6, valign: Gtk.Align.CENTER });
        suffixBox.append(iconPreview);
        iconRow.add_suffix(suffixBox);
        iconRow.connect('notify::text', () => {
            iconPreview.icon_name =
                iconRow.get_text().trim() || 'preferences-other-symbolic';
        });
        row.add_row(iconRow);

        // Botón de eliminar: junto al chevron de expandir/colapsar (título).
        const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
        delBtn.has_frame = false;
        delBtn.valign = Gtk.Align.CENTER;
        delBtn.tooltip_text = 'Eliminar opción';
        row.add_suffix(delBtn);

        const entry = { row, labelEntry, cmdEntry, iconRow };
        rows.options.push(entry);
        optsListBox.append(row);

        delBtn.connect('clicked', () => {
            const idx = rows.options.indexOf(entry);
            if (idx !== -1) rows.options.splice(idx, 1);
            optsListBox.remove(row);
        });

        // DnD: la propia fila se puede arrastrar y acepta soltarse encima.
        _optionAddDragSource(row);
        _optionAddDropTarget(row, optsListBox, rows, addBtnRow);
    };
    addBtnRow.connect('activated', () => addOptionRow());
    for (const opt of item.options || [])
        addOptionRow(opt);

    // Soltar sobre el área vacía de la lista mueve la opción al final.
    const optsListDropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(QuickToggleOptionRow.$gtype),
    });
    optsListDropTarget.connect('drop', (_trg, value, _x, _y) => {
        if (!(value instanceof QuickToggleOptionRow))
            return false;
        if (value.get_parent() !== optsListBox)
            return false;
        const sourceIndex = value.get_index() - 1; // la fila 0 es el botón
        const lastIndex = rows.options.length - 1;
        if (sourceIndex === lastIndex)
            return false; // ya está al final
        const [entry] = rows.options.splice(sourceIndex, 1);
        rows.options.push(entry);
        _optionRebuildOrder(optsListBox, rows, addBtnRow);
        return true;
    });
    optsListBox.add_controller(optsListDropTarget);

    enableDragAutoScroll(optsListBox);

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

// ── Reordenamiento por arrastre (símil System Items Layout) ─────────

const QuickTogglesRow = GObject.registerClass({
    GTypeName: 'LidSolQuickTogglesRow',
}, class QuickTogglesRow extends Adw.ActionRow { });

// Placeholder visual para listas vacías (el DnD lo maneja el DropTarget de la lista)
const QuickTogglesPlaceholder = GObject.registerClass({
    GTypeName: 'LidSolQuickTogglesPlaceholder',
}, class QuickTogglesPlaceholder extends Gtk.Box {
    _init(params = {}) {
        super._init(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_hexpand(true);
        this.set_vexpand(true);

        const label = new Gtk.Label({
            label: 'Arrastra elementos aquí',
            sensitive: false,
            opacity: 0.5,
            margin_top: 16,
            margin_bottom: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        this.append(label);
    }
});

function _qtCreateRow(item, ctx) {
    const { window, settings, list, saveList, getList, rebuild } = ctx;
    const row = new QuickTogglesRow();
    row._item = item;
    row.set_title(getDisplayName(item));
    row.set_subtitle(getSubtitle(item));
    row.activatable = false;

    const icon = Gtk.Image.new_from_icon_name(getIconName(item));
    icon.pixel_size = 18;
    icon.margin_start = 4;
    icon.margin_end = 4;
    row.add_prefix(icon);

    const dragHandle = Gtk.Image.new_from_icon_name('list-drag-handle-symbolic');
    dragHandle.pixel_size = 14;
    dragHandle.margin_start = 4;
    dragHandle.margin_end = 6;
    dragHandle.opacity = 0.5;
    row.add_prefix(dragHandle);

    const hideSwitch = new Gtk.Switch({ active: !item.hide, valign: Gtk.Align.CENTER });
    hideSwitch.connect('notify::active', () => {
        item.hide = !hideSwitch.active;
        saveList(list);
        rebuild();
    });
    row.add_suffix(hideSwitch);

    if (!item.isSystem && !item.nonOrdered) {
        const editBtn = Gtk.Button.new_from_icon_name('document-edit-symbolic');
        editBtn.has_frame = false; editBtn.valign = Gtk.Align.CENTER;
        editBtn.connect('clicked', () => { openEditDialog(window, settings, item, () => { saveList(list); rebuild(); }); });
        row.add_suffix(editBtn);
        const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
        delBtn.has_frame = false; delBtn.valign = Gtk.Align.CENTER; delBtn.tooltip_text = 'Eliminar toggle';
        delBtn.connect('clicked', () => { const idx = list.indexOf(item); list.splice(idx, 1); saveList(list); rebuild(); });
        row.add_suffix(delBtn);
    }

    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
    dragSource.connect('prepare', (_src, _x, _y) => {
        const val = new GObject.Value();
        val.init(QuickTogglesRow.$gtype);
        val.set_object(row);
        return Gdk.ContentProvider.new_for_value(val);
    });
    dragSource.connect('drag-begin', (_src, drag) => {
        const alloc = row.get_allocation();
        const iconBox = new Gtk.ListBox();
        iconBox.set_size_request(alloc.width, alloc.height);
        const ghostRow = new Gtk.ListBoxRow();
        const ghostLabel = new Gtk.Label({
            label: row.get_title(),
            margin_start: 8,
            margin_end: 8,
            margin_top: 4,
            margin_bottom: 4,
            xalign: 0,
        });
        ghostRow.set_child(ghostLabel);
        iconBox.append(ghostRow);
        iconBox.drag_highlight_row(ghostRow);
        const dragIcon = Gtk.DragIcon.get_for_drag(drag);
        if (dragIcon) dragIcon.set_child(iconBox);
    });
    row.add_controller(dragSource);

    const dropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(QuickTogglesRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
        return _qtHandleDrop(value, row, getList, saveList, rebuild);
    });
    row.add_controller(dropTarget);

    return row;
}

function _qtHandleDrop(value, targetRow, getList, saveList, rebuild) {
    if (!(value instanceof QuickTogglesRow))
        return false;
    if (value === targetRow)
        return false;

    const listContainer = value.get_parent();
    if (!listContainer || listContainer !== targetRow.get_parent())
        return false;

    // El array se puebla siempre en orden, así que índice de fila == índice del array
    // (no se compara por identidad de objeto: getList() re-desempaqueta objetos nuevos).
    const list = getList();
    const sourceIndex = value.get_index();
    const targetIndex = targetRow.get_index();
    if (sourceIndex >= list.length || targetIndex >= list.length)
        return false;

    const [item] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, item);
    saveList(list);
    rebuild();
    return true;
}

function _qtAddListBoxDropTarget(listBox, getList, saveList, rebuild) {
    const dropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(QuickTogglesRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
        if (!(value instanceof QuickTogglesRow))
            return false;
        const src = value.get_parent();
        if (!src)
            return false;

        const list = getList();
        if (list.length === 0)
            return false;
        const sourceIndex = value.get_index();
        if (sourceIndex >= list.length)
            return false;
        const [item] = list.splice(sourceIndex, 1);
        list.push(item);
        saveList(list);
        rebuild();
        return true;
    });
    listBox.add_controller(dropTarget);
}

// ══════════════════════════════════════════════════════════════════
//  QUICK TOGGLE OPTIONS (formulario de edición)
//
// En el diálogo de edición, cada opción del menú es un ExpanderRow
// (título = etiqueta, subtítulo = comando) dentro de un ListBox, con
// drag & drop para reordenar (mismo patrón que los toggles). El reorder
// re-engancha las mismas instancias (remove_all + append) para conservar el
// estado expandido y los textos sin guardar.
// ══════════════════════════════════════════════════════════════════

const QuickToggleOptionRow = GObject.registerClass({
    GTypeName: 'LidSolQuickToggleOptionRow',
}, class QuickToggleOptionRow extends Adw.ExpanderRow { });

// Fuente de arrastre: al iniciar el drag se empaqueta la propia fila.
function _optionAddDragSource(row) {
    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
    dragSource.connect('prepare', (_src, _x, _y) => {
        const val = new GObject.Value();
        val.init(QuickToggleOptionRow.$gtype);
        val.set_object(row);
        return Gdk.ContentProvider.new_for_value(val);
    });
    dragSource.connect('drag-begin', (_src, drag) => {
        const alloc = row.get_allocation();
        const ghostBox = new Gtk.ListBox();
        ghostBox.set_size_request(alloc.width, alloc.height);
        const ghostRow = new Gtk.ListBoxRow();
        const ghostLabel = new Gtk.Label({
            label: row.get_title(),
            margin_start: 8,
            margin_end: 8,
            margin_top: 4,
            margin_bottom: 4,
            xalign: 0,
        });
        ghostRow.set_child(ghostLabel);
        ghostBox.append(ghostRow);
        ghostBox.drag_highlight_row(ghostRow);
        const dragIcon = Gtk.DragIcon.get_for_drag(drag);
        if (dragIcon) dragIcon.set_child(ghostBox);
    });
    row.add_controller(dragSource);
}

// Objetivo por fila: insertar la opción arrastrada en la posición destino.
function _optionAddDropTarget(row, optsListBox, rows, addRowButton) {
    const dropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(QuickToggleOptionRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
        return _optionHandleDrop(value, row, optsListBox, rows, addRowButton);
    });
    row.add_controller(dropTarget);
}

function _optionHandleDrop(value, targetRow, optsListBox, rows, addRowButton) {
    if (!(value instanceof QuickToggleOptionRow))
        return false;
    if (value === targetRow)
        return false;
    if (value.get_parent() !== optsListBox || targetRow.get_parent() !== optsListBox)
        return false;

    // rows.options se mantiene siempre en el mismo orden que las filas del
    // ListBox, así que índice de fila == índice del array (no se compara por
    // identidad de objeto: ya tenemos la referencia de la propia fila). La
    // fila 0 es el botón "Añadir opción", así que se resta 1.
    const sourceIndex = value.get_index() - 1;
    const targetIndex = targetRow.get_index() - 1;
    if (sourceIndex < 0 || targetIndex < 0)
        return false;

    const [entry] = rows.options.splice(sourceIndex, 1);
    rows.options.splice(targetIndex, 0, entry);

    _optionRebuildOrder(optsListBox, rows, addRowButton);
    return true;
}

// Re-engancha las mismas instancias de fila en el orden del array.
// GTK4 ya no tiene Gtk.ListBox.reorder (existía en GTK3), así que el reorder
// se hace re-append manual. Al reusar los widgets se conserva el estado
// expandido y los textos sin guardar de las entradas. El botón "Añadir
// opción" se vuelve a enganchar primero (primera fila de la boxed list).
function _optionRebuildOrder(optsListBox, rows, addRowButton) {
    optsListBox.remove_all();
    optsListBox.append(addRowButton);
    for (const e of rows.options)
        optsListBox.append(e.row);
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

const SystemItemsRow = GObject.registerClass({
    GTypeName: 'LidSolSystemItemsRow',
}, class SystemItemsRow extends Adw.ActionRow { });

// Visual placeholder for empty lists (DnD handled by list-level DropTarget)
const SystemItemsPlaceholder = GObject.registerClass({
    GTypeName: 'LidSolSystemItemsPlaceholder',
}, class SystemItemsPlaceholder extends Gtk.Box {
    _init(params = {}) {
        super._init(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_hexpand(true);
        this.set_vexpand(true);

        const label = new Gtk.Label({
            label: 'Arrastra elementos aquí',
            sensitive: false,
            opacity: 0.5,
            margin_top: 16,
            margin_bottom: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        this.append(label);
    }
});

function getOrder(settings) {
    try { return settings.get_strv('qst-system-items-order'); }
    catch (e) { return [...SYSTEM_ITEM_DEFAULT_ORDER]; }
}

// Libera la fila reemplazada dejando que el GC de GJS recoja el widget huérfano
// (GTK moderno ya no expone Gtk.Widget.destroy()).

function _createRow(name, settings) {
    const row = new SystemItemsRow();
    row._item = name;
    const isSpacer = name === 'laptopSpacer' || name === 'desktopSpacer';
    row.set_title(SYSTEM_ITEM_NAMES[name] || name);

    const icon = Gtk.Image.new_from_icon_name(
        SYSTEM_ITEM_ICONS[name] || 'emblem-system-symbolic');
    icon.pixel_size = 18;
    icon.margin_start = 4;
    icon.margin_end = 4;
    row.add_prefix(icon);

    const dragHandle = Gtk.Image.new_from_icon_name('list-drag-handle-symbolic');
    dragHandle.pixel_size = 14;
    dragHandle.margin_start = 4;
    dragHandle.margin_end = 6;
    dragHandle.opacity = 0.5;
    row.add_prefix(dragHandle);

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

    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
    dragSource.connect('prepare', (_src, _x, _y) => {
        const val = new GObject.Value();
        val.init(SystemItemsRow.$gtype);
        val.set_object(row);
        return Gdk.ContentProvider.new_for_value(val);
    });
    dragSource.connect('drag-begin', (_src, drag) => {
        const alloc = row.get_allocation();
        const iconBox = new Gtk.ListBox();
        iconBox.set_size_request(alloc.width, alloc.height);
        const ghostRow = new Gtk.ListBoxRow();
        const ghostLabel = new Gtk.Label({
            label: row.get_title(),
            margin_start: 8,
            margin_end: 8,
            margin_top: 4,
            margin_bottom: 4,
            xalign: 0,
        });
        ghostRow.set_child(ghostLabel);
        iconBox.append(ghostRow);
        iconBox.drag_highlight_row(ghostRow);
        const dragIcon = Gtk.DragIcon.get_for_drag(drag);
        if (dragIcon) dragIcon.set_child(iconBox);
    });
    row.add_controller(dragSource);

    const dropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(SystemItemsRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
        return _handleDrop(value, row, settings);
    });
    row.add_controller(dropTarget);

    return row;
}

function _handleDrop(value, targetRow, settings) {
    if (!(value instanceof SystemItemsRow))
        return false;
    if (value === targetRow)
        return false;

    const list = value.get_parent();
    if (!list || list !== targetRow.get_parent())
        return false;

    const name = value._item;
    const sourceIndex = value.get_index();
    const targetBeforeRemove = targetRow.get_index();
    list.remove(value);

    const newRow = _createRow(name, settings);
    const insertIndex = sourceIndex < targetBeforeRemove
        ? targetRow.get_index() + 1
        : targetRow.get_index();
    list.insert(newRow, insertIndex);
    _saveListBoxOrder(list, settings);

    return true;
}

function _addListBoxDropTarget(listBox, settings) {
    const dropTarget = new Gtk.DropTarget({
        actions: Gdk.DragAction.MOVE,
        formats: Gdk.ContentFormats.new_for_gtype(SystemItemsRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
        if (!(value instanceof SystemItemsRow))
            return false;
        const src = value.get_parent();
        if (!src)
            return false;
        const name = value._item;
        src.remove(value);
        const newRow = _createRow(name, settings);
        listBox.append(newRow);
        _saveListBoxOrder(listBox, settings);
        return true;
    });
    listBox.add_controller(dropTarget);
}

function _saveListBoxOrder(listBox, settings) {
    const items = [];
    for (const child of listBox) {
        if (child instanceof SystemItemsRow)
            items.push(child._item);
    }
    try {
        settings.set_strv('qst-system-items-order', items);
    } catch (e) {
        console.error('[LIDSoL] error saving system items order:', e);
    }
}

function _populateListBox(listBox, settings) {
    const order = getOrder(settings);
    for (const name of order) {
        listBox.append(_createRow(name, settings));
    }
}
