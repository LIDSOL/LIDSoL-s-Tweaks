'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import { createDialog } from '../../utils/prefsHelpers.js';

const SYSTEM_NAMES = {
    NMWiredToggle: 'Cableada',
    NMWirelessToggle: 'Wi-Fi',
    NMModemToggle: 'Red Móvil',
    NMBluetoothToggle: 'BT Tethering',
    NMVpnToggle: 'VPN',
    BluetoothToggle: 'Bluetooth',
    PowerProfilesToggle: 'Modo de Energía',
    NightLightToggle: 'Luz Nocturna',
    DarkModeToggle: 'Modo Oscuro',
    DoNotDisturbToggle: 'No Molestar',
    KeyboardBrightnessToggle: 'Teclado Retroiluminado',
    RfkillToggle: 'Modo Avión',
    RotationToggle: 'Auto Rotar',
    DndQuickToggle: 'DND',
    UnsafeQuickToggle: 'Modo Inseguro',
};

const SYSTEM_ICONS = {
    NMWiredToggle: 'network-wired-symbolic',
    NMWirelessToggle: 'network-wireless-signal-excellent-symbolic',
    NMModemToggle: 'network-cellular-symbolic',
    NMBluetoothToggle: 'network-cellular-symbolic',
    NMVpnToggle: 'network-vpn-symbolic',
    BluetoothToggle: 'bluetooth-active-symbolic',
    PowerProfilesToggle: 'power-profile-balanced-symbolic',
    NightLightToggle: 'night-light-symbolic',
    DarkModeToggle: 'weather-clear-night',
    DoNotDisturbToggle: 'notifications-disabled-symbolic',
    KeyboardBrightnessToggle: 'preferences-desktop-keyboard',
    RfkillToggle: 'airplane-mode-symbolic',
    RotationToggle: 'object-rotate-right',
    DndQuickToggle: 'emblem-system-symbolic',
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

function skip(list, _moving, _movingIndex, target, _targetIndex) {
    return shouldShow(target);
}

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
    upBtn.has_frame = false;
    upBtn.valign = Gtk.Align.CENTER;
    upBtn.connect('clicked', () => {
        if (moveItem(list, item, -1)) {
            saveList(list);
            rebuild();
        }
    });
    row.add_prefix(upBtn);

    const downBtn = Gtk.Button.new_from_icon_name('go-down-symbolic');
    downBtn.has_frame = false;
    downBtn.valign = Gtk.Align.CENTER;
    downBtn.connect('clicked', () => {
        if (moveItem(list, item, 1)) {
            saveList(list);
            rebuild();
        }
    });
    row.add_prefix(downBtn);
}

function saveItem(item, rows) {
    item.friendlyName = rows.nameRow.get_text();
    item.icon = rows.iconRow.get_text();
    item.constructorName = rows.ctorRow.get_text();
    item.titleRegex = rows.regexRow.get_text();
    item.gtypeName = rows.gtypeRow.get_text();
    item.commandOn = rows.onCmdRow.get_text();
    item.commandOff = rows.offCmdRow.get_text();
    item.checkCommand = rows.checkCmdRow.get_text();
    item.checkRegex = rows.checkRegexRow.get_text();
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

function getNextName(list) {
    let nth = 1;
    while (true) {
        const name = `My item #${nth}`;
        if (!list.find(item => item.friendlyName === name)) return name;
        nth++;
    }
}

// ── Push edit subpage with proper ToolbarView + HeaderBar ──────────
function pushEditPage(dialog, list, index, saveList, rebuild) {
    try {
        const item = list[index];
        if (!item) {
            console.warn('[LIDSoL] pushEditPage: item not found at index', index);
            return;
        }
        if (!dialog || typeof dialog.push_subpage !== 'function') {
            console.error('[LIDSoL] pushEditPage: dialog.push_subpage not available');
            return;
        }

        const rows = {};
        const editPage = new Adw.PreferencesPage();

        // ── Apariencia ──
        const appearanceGroup = new Adw.PreferencesGroup({ title: 'Apariencia' });
        editPage.add(appearanceGroup);

        rows.nameRow = new Adw.EntryRow({ title: 'Nombre' });
        rows.nameRow.set_text(item.friendlyName || '');
        appearanceGroup.add(rows.nameRow);

        rows.iconRow = new Adw.EntryRow({
            title: 'Icono',
            subtitle: 'Nombre del icono (ej: face-smile-symbolic)',
        });
        rows.iconRow.set_text(item.icon || '');
        appearanceGroup.add(rows.iconRow);

        // ── Reglas de coincidencia ──
        const matchGroup = new Adw.PreferencesGroup({
            title: 'Reglas de coincidencia',
            description: 'Identifica el toggle en el sistema. Vacío si es sólo comandos.',
        });
        editPage.add(matchGroup);

        rows.ctorRow = new Adw.EntryRow({ title: 'Constructor name' });
        rows.ctorRow.set_text(item.constructorName || '');
        matchGroup.add(rows.ctorRow);

        rows.regexRow = new Adw.EntryRow({ title: 'Regex de título' });
        rows.regexRow.set_text(item.titleRegex || '');
        matchGroup.add(rows.regexRow);

        rows.gtypeRow = new Adw.EntryRow({ title: 'GType name' });
        rows.gtypeRow.set_text(item.gtypeName || '');
        matchGroup.add(rows.gtypeRow);

        // ── Comandos ──
        const cmdGroup = new Adw.PreferencesGroup({
            title: 'Comandos',
            description: 'Comandos a ejecutar al activar/desactivar',
        });
        editPage.add(cmdGroup);

        rows.onCmdRow = new Adw.EntryRow({ title: 'Comando ON' });
        rows.onCmdRow.set_text(item.commandOn || '');
        cmdGroup.add(rows.onCmdRow);

        rows.offCmdRow = new Adw.EntryRow({ title: 'Comando OFF' });
        rows.offCmdRow.set_text(item.commandOff || '');
        cmdGroup.add(rows.offCmdRow);

        rows.checkCmdRow = new Adw.EntryRow({
            title: 'Comando de verificación',
            subtitle: 'Consulta el estado actual',
        });
        rows.checkCmdRow.set_text(item.checkCommand || '');
        cmdGroup.add(rows.checkCmdRow);

        rows.checkRegexRow = new Adw.EntryRow({
            title: 'Término de búsqueda',
            subtitle: 'Texto a buscar en la salida del comando',
        });
        rows.checkRegexRow.set_text(item.checkRegex || '');
        cmdGroup.add(rows.checkRegexRow);

        // ── Comportamiento de inicio ──
        const startupGroup = new Adw.PreferencesGroup({ title: 'Comportamiento de inicio' });
        editPage.add(startupGroup);

        const initialStateOptions = new Gtk.StringList();
        initialStateOptions.append('Activado');
        initialStateOptions.append('Desactivado');
        initialStateOptions.append('Estado anterior');
        initialStateOptions.append('Salida del comando');

        rows.initialStateCombo = new Adw.ComboRow({
            title: 'Estado inicial',
            subtitle: 'Estado al iniciar sesión',
            model: initialStateOptions,
            selected: item.initialState ?? 2,
        });
        startupGroup.add(rows.initialStateCombo);

        rows.runAtBootSwitch = new Adw.SwitchRow({
            title: 'Ejecutar comando al inicio',
            subtitle: 'Ejecuta ON/OFF al iniciar sesión',
            active: !!item.runAtBoot,
        });
        startupGroup.add(rows.runAtBootSwitch);

        rows.delaySpin = new Adw.SpinRow({
            title: 'Retardo (segundos)',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 10, step_increment: 1 }),
            value: item.delayTime ?? 3,
        });
        startupGroup.add(rows.delaySpin);

        // ── Comportamiento del toggle ──
        const toggleGroup = new Adw.PreferencesGroup({ title: 'Comportamiento del toggle' });
        editPage.add(toggleGroup);

        const clickOptions = new Gtk.StringList();
        clickOptions.append('Siempre activado');
        clickOptions.append('Siempre desactivado');
        clickOptions.append('Alternar');

        rows.buttonClickCombo = new Adw.ComboRow({
            title: 'Acción al hacer clic',
            subtitle: 'Comportamiento al presionar',
            model: clickOptions,
            selected: item.buttonClick ?? 2,
        });
        toggleGroup.add(rows.buttonClickCombo);

        rows.showIndicatorSwitch = new Adw.SwitchRow({
            title: 'Mostrar indicador',
            subtitle: 'Icono en la barra superior cuando está activado',
            active: !!item.showIndicator,
        });
        toggleGroup.add(rows.showIndicatorSwitch);

        rows.closeMenuSwitch = new Adw.SwitchRow({
            title: 'Cerrar menú al presionar',
            active: !!item.closeMenu,
        });
        toggleGroup.add(rows.closeMenuSwitch);

        rows.checkExitCodeSwitch = new Adw.SwitchRow({
            title: 'Verificar código de salida',
            subtitle: 'Sólo alternar si el comando se ejecuta correctamente',
            active: !!item.checkExitCode,
        });
        toggleGroup.add(rows.checkExitCodeSwitch);

        // ── Sincronización ──
        const syncGroup = new Adw.PreferencesGroup({ title: 'Sincronización' });
        editPage.add(syncGroup);

        rows.commandSyncSwitch = new Adw.SwitchRow({
            title: 'Mantener sincronizado',
            subtitle: 'Actualiza periódicamente el estado según la salida del comando',
            active: !!item.commandSync,
        });
        syncGroup.add(rows.commandSyncSwitch);

        rows.pollIntervalSpin = new Adw.SpinRow({
            title: 'Frecuencia (segundos)',
            subtitle: 'Cada cuánto verificar el estado',
            adjustment: new Gtk.Adjustment({ lower: 2, upper: 900, step_increment: 1 }),
            value: item.pollInterval ?? 10,
        });
        syncGroup.add(rows.pollIntervalSpin);

        // ── Atajo de teclado ──
        const shortcutGroup = new Adw.PreferencesGroup({ title: 'Atajo de teclado' });
        editPage.add(shortcutGroup);

        rows.shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: item.keybinding || null,
            disabled_text: 'Sin atajo',
            valign: Gtk.Align.CENTER,
        });
        const shortcutRow = new Adw.ActionRow({ title: 'Atajo', activatable: true });
        shortcutRow.add_suffix(rows.shortcutLabel);
        shortcutGroup.add(shortcutRow);

        shortcutRow.connect('activated', () => {
            const captureWin = new Adw.Window({
                modal: true,
                transient_for: dialog.get_root(),
                width_request: 400,
                height_request: 250,
                content: new Adw.StatusPage({
                    title: 'Capturar atajo',
                    description: 'Esc para cancelar, Retroceso para desactivar',
                    icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
                }),
            });
            const controller = new Gtk.EventControllerKey();
            captureWin.add_controller(controller);
            controller.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
                const mask = state & Gtk.accelerator_get_default_mod_mask();
                if (!mask && keyval === Gdk.KEY_Escape) {
                    captureWin.close(); return Gdk.EVENT_STOP;
                }
                if (keyval === Gdk.KEY_BackSpace && !mask) {
                    rows.shortcutLabel.accelerator = '';
                    captureWin.close(); return Gdk.EVENT_STOP;
                }
                if (!mask || !Gtk.accelerator_valid(keyval, mask))
                    return Gdk.EVENT_STOP;
                rows.shortcutLabel.accelerator = Gtk.accelerator_name(keyval, mask);
                captureWin.close(); return Gdk.EVENT_STOP;
            });
            captureWin.present();
        });

        // ── Botón Guardar ──
        const saveBtn = new Gtk.Button({
            label: 'Guardar',
            css_classes: ['suggested-action'],
            halign: Gtk.Align.END,
            margin_top: 12,
        });
        saveBtn.connect('clicked', () => {
            try {
                saveItem(item, rows);
                saveList(list);
                if (typeof dialog?.pop_subpage === 'function')
                    dialog.pop_subpage();
                else
                    console.warn('[LIDSoL] save: dialog.pop_subpage not available');
                if (rebuild) rebuild();
            } catch (e) {
                console.error('[LIDSoL] Error saving toggle:', e);
                dialog.add_toast(new Adw.Toast({
                    title: 'Error al guardar: ' + (e.message || e),
                    timeout: 6,
                }));
            }
        });
        const actionGroup = new Adw.PreferencesGroup();
        actionGroup.add(saveBtn);
        editPage.add(actionGroup);

        // ── NavigationPage con ToolbarView + HeaderBar ──
        const navPage = new Adw.NavigationPage({
            title: item.friendlyName || 'Nuevo toggle',
            can_pop: true,
        });
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.set_content(editPage);
        navPage.set_child(view);

        dialog.push_subpage(navPage);
    } catch (e) {
        console.error('[LIDSoL] Error in pushEditPage:', e);
    }
}

// ── Main dialog ─────────────────────────────────────────────────
export function openToggleOrderDialog(parentWindow, settings) {
    let dialog = null;
    let rebuild = null;

    const getList = () => {
        try {
            return settings.get_value('qst-toggles-order').recursiveUnpack();
        } catch (e) {
            console.warn('[LIDSoL prefs] Failed to read qst-toggles-order:', e);
            return [];
        }
    };

    const saveList = (list) => {
        settings.set_value('qst-toggles-order',
            new GLib.Variant('aa{sv}', serializeToList(list)));
    };

    const addNewItem = () => {
        const list = getList();
        const newItem = newItemDefaults();
        newItem.friendlyName = getNextName(list);
        const idx = list.length;
        list.push(newItem);
        saveList(list);
        pushEditPage(dialog, list, idx, saveList, rebuild);
    };

    dialog = createDialog({
        window: parentWindow,
        title: 'Ordenar y ocultar toggles',
        childrenRequest: (page, dlg) => {
            dialog = dlg;

            const group = new Adw.PreferencesGroup({
                title: 'Toggles',
                description: 'Usa las flechas para reordenar. El switch oculta cada toggle.',
            });
            page.add(group);

            const rows = [];

            rebuild = () => {
                for (const row of rows)
                    group.remove(row);
                rows.length = 0;

                const headerBox = new Gtk.Box({ spacing: 4 });

                const newBtn = Gtk.Button.new_from_icon_name('list-add-symbolic');
                newBtn.has_frame = false;
                newBtn.valign = Gtk.Align.CENTER;
                newBtn.tooltip_text = 'Nuevo toggle personalizado';
                newBtn.connect('clicked', addNewItem);
                headerBox.append(newBtn);

                const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
                resetBtn.has_frame = false;
                resetBtn.valign = Gtk.Align.CENTER;
                resetBtn.tooltip_text = 'Restablecer valores predeterminados';
                resetBtn.connect('clicked', () => {
                    settings.reset('qst-toggles-order');
                    rebuild();
                });
                headerBox.append(resetBtn);

                group.header_suffix = headerBox;

                const list = getList();

                const addRow = (item) => {
                    const row = new Adw.ActionRow({
                        title: getDisplayName(item),
                        subtitle: getSubtitle(item),
                        activatable: false,
                    });

                    const icon = Gtk.Image.new_from_icon_name(getIconName(item));
                    icon.pixel_size = 18;
                    icon.margin_start = 4;
                    icon.margin_end = 4;
                    row.add_prefix(icon);

                    addMoveButtons(row, list, item, saveList, rebuild);

                    const hideSwitch = new Gtk.Switch({
                        active: !item.hide,
                        valign: Gtk.Align.CENTER,
                    });
                    hideSwitch.connect('notify::active', () => {
                        item.hide = !hideSwitch.active;
                        saveList(list);
                        rebuild();
                    });
                    row.add_suffix(hideSwitch);

                    if (!item.isSystem && !item.nonOrdered) {
                        const editBtn = Gtk.Button.new_from_icon_name('document-edit-symbolic');
                        editBtn.has_frame = false;
                        editBtn.valign = Gtk.Align.CENTER;
                        editBtn.connect('clicked', () => {
                            const idx = list.indexOf(item);
                            pushEditPage(dialog, list, idx, saveList, rebuild);
                        });
                        row.add_suffix(editBtn);

                        const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
                        delBtn.has_frame = false;
                        delBtn.valign = Gtk.Align.CENTER;
                        delBtn.tooltip_text = 'Eliminar toggle';
                        delBtn.connect('clicked', () => {
                            const idx = list.indexOf(item);
                            list.splice(idx, 1);
                            saveList(list);
                            rebuild();
                        });
                        row.add_suffix(delBtn);
                    }

                    rows.push(row);
                    group.add(row);
                };

                for (const item of list)
                    addRow(item);
            };

            rebuild();
        },
    });
}
