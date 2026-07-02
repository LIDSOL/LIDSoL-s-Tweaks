'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

export function createModuleRow({ settings, bindKey, title, subtitle, onDetailed, sensitiveBind }) {
    const row = new Adw.SwitchRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        active: settings.get_boolean(bindKey),
    });
    settings.bind(bindKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);

    if (sensitiveBind)
        settings.bind(sensitiveBind, row, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

    if (onDetailed)
        _pushDetailedButton(row, onDetailed);

    return row;
}

function _pushDetailedButton(row, onDetailed) {
    const btn = new Gtk.Button({
        icon_name: 'emblem-system-symbolic',
        has_frame: false,
        valign: Gtk.Align.CENTER,
        tooltip_text: 'Configuración detallada',
    });
    const img = btn.get_first_child();
    if (img) {
        img.pixel_size = 12;
        img.opacity = 0.75;
    }
    btn.connect('clicked', () => onDetailed());
    row.activatable_widget = null;
    row.connect('activated', () => onDetailed());
    row.add_suffix(btn);
    return btn;
}

export function createSwitchRow({ settings, bindKey, title, subtitle, sensitiveBind }) {
    const row = new Adw.SwitchRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        active: settings.get_boolean(bindKey),
    });
    settings.bind(bindKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);

    if (sensitiveBind)
        settings.bind(sensitiveBind, row, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

    return row;
}

export function createSpinButtonRow({ settings, bindKey, title, subtitle, adjProps = {} }) {
    const adj = new Gtk.Adjustment({
        lower: adjProps.lower ?? 0,
        upper: adjProps.upper ?? 100,
        step_increment: adjProps.step ?? 1,
    });
    const spin = new Gtk.SpinButton({
        adjustment: adj,
        numeric: true,
        digits: adjProps.digits ?? 0,
        valign: Gtk.Align.CENTER,
    });
    if (settings && bindKey)
        settings.bind(bindKey, spin, 'value', Gio.SettingsBindFlags.DEFAULT);

    const row = new Adw.ActionRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        activatable_widget: spin,
    });
    row.add_suffix(spin);
    return row;
}

export function createColorButtonRow({ settings, bindKey, title, subtitle, useAlpha = false }) {
    const btn = new Gtk.ColorButton({
        valign: Gtk.Align.CENTER,
        show_editor: true,
        use_alpha: useAlpha,
    });

    const _updateColor = () => {
        const color = new Gdk.RGBA();
        if (color.parse(settings.get_string(bindKey)))
            btn.set_rgba(color);
    };
    _updateColor();
    settings.connect(`changed::${bindKey}`, _updateColor);
    btn.connect('color-set', () => {
        settings.set_string(bindKey, btn.rgba.to_string());
    });

    const row = new Adw.ActionRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        activatable_widget: btn,
    });
    row.add_suffix(btn);
    return row;
}

export function createComboRow({ settings, bindKey, title, subtitle, options }) {
    const model = Gio.ListStore.new(DropDownChoice);
    for (const id in options)
        model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        model,
        expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    row.connect('notify::selected-item', () => {
        const value = row.selectedItem?.id;
        if (value !== undefined && value !== null)
            settings.set_string(bindKey, value);
    });

    const updateSelected = () => {
        const current = settings.get_string(bindKey);
        for (let i = 0; i < model.get_n_items(); i++) {
            if (model.get_item(i).id === current) {
                row.selected = i;
                return;
            }
        }
        row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();
    settings.connect(`changed::${bindKey}`, updateSelected);

    return row;
}

export function createIntComboRow({ settings, bindKey, title, subtitle, options }) {
    const model = Gio.ListStore.new(DropDownChoice);
    for (const id in options)
        model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        model,
        expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    const updateSelected = () => {
        const current = settings.get_string(bindKey);
        for (let i = 0; i < model.get_n_items(); i++) {
            if (model.get_item(i).id === current) {
                row.selected = i;
                return;
            }
        }
        row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();

    row.connect('notify::selected-item', () => {
        const value = row.selectedItem?.id;
        if (value !== undefined && value !== null)
            settings.set_string(bindKey, value);
    });
    settings.connect(`changed::${bindKey}`, updateSelected);

    return row;
}

export function createEntryRow({ settings, bindKey, title, subtitle }) {
    const row = new Adw.ActionRow({ title: title ?? '', subtitle: subtitle ?? null });
    const entry = new Gtk.Entry({
        text: settings.get_string(bindKey) || '',
        valign: Gtk.Align.CENTER,
    });
    const focusController = new Gtk.EventControllerFocus();
    focusController.connect('leave', () => {
        settings.set_string(bindKey, entry.get_buffer().text || '');
    });
    entry.add_controller(focusController);
    settings.connect(`changed::${bindKey}`, () => {
        entry.set_text(settings.get_string(bindKey) || '');
    });
    row.add_suffix(entry);
    row.activatable_widget = entry;
    return row;
}

export function createKeyboardShortcutRow({ settings, bindKey, title, subtitle }) {
    const row = new Adw.ActionRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        activatable: true,
    });

    const shortcutLabel = new Gtk.ShortcutLabel({
        accelerator: settings.get_strv(bindKey)[0] ?? null,
        valign: Gtk.Align.CENTER,
    });
    row.add_suffix(shortcutLabel);

    const disabledLabel = new Gtk.Label({
        label: 'Desactivado',
        css_classes: ['dim-label'],
    });
    row.add_suffix(disabledLabel);

    const hasAccel = settings.get_strv(bindKey).length > 0;
    disabledLabel.visible = hasAccel;
    shortcutLabel.visible = !hasAccel;

    row.connect('activated', () => {
        const dialog = new Gtk.Dialog({
            title: 'Establecer atajo',
            modal: true,
            useHeaderBar: 1,
            transientFor: row.get_root(),
            widthRequest: 400,
            heightRequest: 200,
        });
        const box = new Gtk.Box({
            marginBottom: 12, marginEnd: 12, marginStart: 12, marginTop: 12,
            orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER,
        });
        box.append(new Gtk.Label({ label: 'Introduce un nuevo atajo:', marginBottom: 12 }));
        box.append(new Gtk.Label({
            label: 'Esc para cancelar, Retroceso para desactivar',
            css_classes: ['dim-label'],
        }));
        dialog.set_child(box);

        const keyController = new Gtk.EventControllerKey({
            propagationPhase: Gtk.PropagationPhase.CAPTURE,
        });
        dialog.add_controller(keyController);
        keyController.connect('key-pressed', (_, keyval, _keycode, modifier) => {
            modifier = modifier & ~64 & ~16;
            if (!Gtk.accelerator_valid(keyval, modifier))
                return;

            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
            } else if (keyval === Gdk.KEY_BackSpace && !modifier) {
                shortcutLabel.visible = false;
                disabledLabel.visible = true;
                settings.set_strv(bindKey, []);
                dialog.close();
            } else {
                const accel = Gtk.accelerator_name(keyval, modifier);
                shortcutLabel.accelerator = accel;
                shortcutLabel.visible = true;
                disabledLabel.visible = false;
                settings.set_strv(bindKey, [accel]);
                dialog.close();
            }
        });
        dialog.show();
    });

    return row;
}

export function createDialog({ window, title, childrenRequest }) {
    const dialog = new Adw.PreferencesDialog({
        title: title ?? '',
        search_enabled: true,
        presentation_mode: Adw.DialogPresentationMode.BOTTOM_SHEET,
    });
    const page = new Adw.PreferencesPage();
    if (childrenRequest)
        childrenRequest(page, dialog);
    dialog.add(page);
    dialog.present(window);
    return dialog;
}

export function createGroup({ parent, title, description }) {
    const group = new Adw.PreferencesGroup({
        title: title ?? '',
        description: description ?? null,
    });
    if (parent) parent.add(group);
    return group;
}

export function createRow({ parent, title, subtitle, activatable, onActivated }) {
    const row = new Adw.ActionRow({
        title: title ?? '',
        subtitle: subtitle ?? null,
        activatable: activatable ?? false,
    });
    if (onActivated)
        row.connect('activated', onActivated);
    if (parent) parent.add(row);
    return row;
}

const DropDownChoice = GObject.registerClass({
    GTypeName: 'LidSolDropDownChoice',
    Properties: {
        id: GObject.ParamSpec.string('id', 'ID', 'Identifier',
            GObject.ParamFlags.READWRITE, null),
        title: GObject.ParamSpec.string('title', 'Title', 'Displayed title',
            GObject.ParamFlags.READWRITE, null),
    },
}, class DropDownChoice extends GObject.Object {});
