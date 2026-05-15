'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
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
        }
        return dict;
    });
}

function shouldShow(item) {
    return true;
}

function moveBlocking(_list, _moving, _movingIndex, _target, _targetIndex) {
    return false;
}

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

export function openToggleOrderDialog(parentWindow, settings) {
    let dialog = null;

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

    dialog = createDialog({
        window: parentWindow,
        title: 'Ordenar y ocultar toggles',
        childrenRequest: (page) => {
            const group = new Adw.PreferencesGroup({
                title: 'Toggles del sistema',
                description: 'Usa las flechas para reordenar. Activa "Ocultar" para esconder un toggle.',
            });
            page.add(group);

            const rows = [];

            const rebuild = () => {
                for (const row of rows)
                    group.remove(row);
                rows.length = 0;

                const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
                resetBtn.has_frame = false;
                resetBtn.valign = Gtk.Align.CENTER;
                resetBtn.tooltip_text = 'Restablecer valores predeterminados';
                resetBtn.connect('clicked', () => {
                    settings.reset('qst-toggles-order');
                    rebuild();
                });
                const headerBox = new Gtk.Box({});
                headerBox.append(resetBtn);
                group.header_suffix = headerBox;

                const list = getList();

                const addRow = (item) => {
                    const row = new Adw.ActionRow({
                        title: getDisplayName(item),
                        subtitle: getSubtitle(item),
                        activatable: false,
                    });

                    if (item.nonOrdered) {
                        const icon = Gtk.Image.new_from_icon_name('emblem-system-symbolic');
                        icon.pixel_size = 18;
                        icon.margin_start = 4;
                        icon.margin_end = 4;
                        row.add_prefix(icon);

                        addMoveButtons(row, list, item, saveList, rebuild);

                        rows.push(row);
                        group.add(row);
                        return;
                    }

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

                    if (!item.isSystem) {
                        const editBtn = Gtk.Button.new_from_icon_name('document-edit-symbolic');
                        editBtn.has_frame = false;
                        editBtn.valign = Gtk.Align.CENTER;
                        editBtn.connect('clicked', () => {
                            const idx = list.indexOf(item);
                            openEditDialog(dialog || parentWindow, settings, list, idx, () => rebuild());
                        });
                        row.add_suffix(editBtn);

                        const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
                        delBtn.has_frame = false;
                        delBtn.valign = Gtk.Align.CENTER;
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

                const addCounter = list.filter(it => !it.isSystem && !it.nonOrdered).length;
                const addRowBtn = new Adw.ActionRow({
                    title: 'Añadir toggle personalizado',
                    subtitle: 'Crea un toggle con reglas de coincidencia personalizadas',
                    activatable: true,
                });
                addRowBtn.connect('activated', () => {
                    const newItem = {
                        hide: false,
                        isSystem: false,
                        constructorName: '',
                        friendlyName: `Toggle ${addCounter + 1}`,
                        titleRegex: '',
                        gtypeName: '',
                    };
                    const newList = getList();
                    newList.push(newItem);
                    saveList(newList);
                    rebuild();
                });
                const addIcon = Gtk.Image.new_from_icon_name('list-add-symbolic');
                addIcon.pixel_size = 16;
                addRowBtn.add_suffix(addIcon);
                rows.push(addRowBtn);
                group.add(addRowBtn);
            };

            rebuild();
        },
    });
}

function openEditDialog(parentDialog, settings, list, index, onSave) {
    const item = list[index];
    if (!item) return;

    const editDialog = new Adw.PreferencesDialog({
        title: 'Editar toggle',
        presentation_mode: Adw.DialogPresentationMode.BOTTOM_SHEET,
    });

    const editPage = new Adw.PreferencesPage();

    const group = new Adw.PreferencesGroup({ title: 'Propiedades del toggle' });
    editPage.add(group);

    const nameRow = new Adw.EntryRow({ title: 'Nombre visible' });
    nameRow.set_text(item.friendlyName || '');
    group.add(nameRow);

    const ctorRow = new Adw.EntryRow({
        title: 'Constructor name',
        subtitle: 'Nombre JS del constructor (ej: NMWirelessToggle)',
    });
    ctorRow.set_text(item.constructorName || '');
    group.add(ctorRow);

    const regexRow = new Adw.EntryRow({
        title: 'Regex de título',
        subtitle: 'Expresión regular para coincidir con toggle.title',
    });
    regexRow.set_text(item.titleRegex || '');
    group.add(regexRow);

    const gtypeRow = new Adw.EntryRow({
        title: 'GType name',
        subtitle: 'GObject type name (si aplica)',
    });
    gtypeRow.set_text(item.gtypeName || '');
    group.add(gtypeRow);

    const actionGroup = new Adw.PreferencesGroup();
    const saveBtn = new Gtk.Button({
        label: 'Guardar',
        halign: Gtk.Align.END,
        margin_top: 12,
        margin_bottom: 12,
        margin_end: 12,
    });
    saveBtn.connect('clicked', () => {
        item.friendlyName = nameRow.get_text();
        item.constructorName = ctorRow.get_text();
        item.titleRegex = regexRow.get_text();
        item.gtypeName = gtypeRow.get_text();
        settings.set_value('qst-toggles-order',
            new GLib.Variant('aa{sv}', serializeToList(list)));
        editDialog.close();
        onSave();
    });
    actionGroup.add(saveBtn);
    editPage.add(actionGroup);

    editDialog.add(editPage);
    editDialog.present(parentDialog);
}
