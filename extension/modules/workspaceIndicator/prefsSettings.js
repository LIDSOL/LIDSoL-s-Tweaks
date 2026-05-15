'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export class WorkspaceIndicatorPrefs {
    constructor(settings) {
        this._settings = settings;
    }

    populatePage(page) {
        const wsSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('workspace-indicator-enabled'),
        });
        this._settings.bind('workspace-indicator-enabled', wsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const enableRow = new Adw.ActionRow({
            title: 'Habilitar Workspace Indicator',
            subtitle: 'Reemplaza el indicador nativo de espacios de trabajo',
        });
        enableRow.add_suffix(wsSwitch);
        enableRow.activatable_widget = wsSwitch;
        const mainGroup = new Adw.PreferencesGroup();
        mainGroup.add(enableRow);
        page.add(mainGroup);

        this.populateGroups(page);
    }

    populateGroups(page) {
        this._addBehaviorGroup(page);
        this._addAppearanceGroup(page);
        this._addShortcutsGroup(page);
    }

    _addBehaviorGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.set_title('Comportamiento');

        this._addCombo(group, {
            key: 'ws-indicator-style',
            title: 'Estilo del indicador',
            options: {
                'current-workspace': 'Espacio actual',
                'workspaces-bar': 'Barra de espacios',
            },
        });

        this._addToggle(group, { key: 'ws-always-show-numbers', title: 'Mostrar números siempre' });
        this._addToggle(group, { key: 'ws-show-empty-workspaces', title: 'Mostrar espacios vacíos' });
        this._addToggle(group, { key: 'ws-toggle-overview', title: 'Abrir vista general', subtitle: 'Al hacer clic en espacio activo o vacío' });

        this._addCombo(group, {
            key: 'ws-position',
            title: 'Posición en el panel',
            options: { left: 'Izquierda', center: 'Centro', right: 'Derecha' },
        });
        this._addSpinButton(group, { key: 'ws-position-index', title: 'Índice de posición', lower: 0, upper: 100 });

        this._addToggle(group, { key: 'ws-system-workspace-indicator', title: 'Conservar indicador nativo' });

        this._addCombo(group, {
            key: 'ws-scroll-wheel',
            title: 'Rueda del ratón',
            options: { panel: 'Sobre el panel', 'workspaces-bar': 'Sobre el indicador', disabled: 'Desactivado' },
        });
        this._addToggle(group, { key: 'ws-scroll-wheel-debounce', title: 'Debounce' });
        this._addSpinButton(group, { key: 'ws-scroll-wheel-debounce-time', title: 'Tiempo de debounce (ms)', lower: 0, upper: 2000, step: 50 });
        this._addCombo(group, {
            key: 'ws-scroll-wheel-vertical',
            title: 'Scroll vertical',
            options: { normal: 'Normal', inverted: 'Invertido', disabled: 'Desactivado' },
        });
        this._addCombo(group, {
            key: 'ws-scroll-wheel-horizontal',
            title: 'Scroll horizontal',
            options: { normal: 'Normal', inverted: 'Invertido', disabled: 'Desactivado' },
        });
        this._addToggle(group, { key: 'ws-scroll-wheel-wrap-around', title: 'Wrap around' });

        // Custom labels
        this._addToggle(group, { key: 'ws-enable-custom-label', title: 'Usar etiquetas personalizadas' });
        this._addToggle(group, { key: 'ws-enable-custom-label-in-menu', title: 'Etiquetas personalizadas en menú' });
        this._addTextEntry(group, { key: 'ws-custom-label-named', title: 'Etiqueta para espacios con nombre' });
        this._addTextEntry(group, { key: 'ws-custom-label-unnamed', title: 'Etiqueta para espacios sin nombre' });

        page.add(group);

        // Smart workspace names
        const smartGroup = new Adw.PreferencesGroup();
        smartGroup.set_title('Nombres inteligentes');
        smartGroup.set_description('Recuerda aplicaciones abiertas al renombrar un espacio y asigna nombres automáticamente.');
        this._addToggle(smartGroup, { key: 'ws-smart-workspace-names', title: 'Activar nombres inteligentes' });
        this._addToggle(smartGroup, { key: 'ws-reevaluate-smart-workspace-names', title: 'Reevaluar nombres' });
        page.add(smartGroup);
    }

    _addAppearanceGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.set_title('Apariencia');

        this._addSpinButton(group, { key: 'ws-workspaces-bar-padding', title: 'Padding de la barra', lower: 0, upper: 255 });
        this._addSpinButton(group, { key: 'ws-workspace-margin', title: 'Margen entre espacios', lower: 0, upper: 255 });

        page.add(group);

        // Active workspace
        const activeGroup = new Adw.PreferencesGroup();
        activeGroup.set_title('Espacio activo');
        this._addColorButton(activeGroup, { key: 'ws-active-workspace-background-color', title: 'Color de fondo' });
        this._addColorButton(activeGroup, { key: 'ws-active-workspace-text-color', title: 'Color de texto' });
        this._addColorButton(activeGroup, { key: 'ws-active-workspace-border-color', title: 'Color del borde' });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-font-size', title: 'Tamaño de fuente', lower: 0, upper: 255 });
        this._addCombo(activeGroup, {
            key: 'ws-active-workspace-font-weight',
            title: 'Grosor de fuente',
            options: { '100': 'Thin', '200': 'Extra Light', '300': 'Light', '400': 'Normal', '500': 'Medium', '600': 'Semi Bold', '700': 'Bold', '800': 'Extra Bold', '900': 'Black' },
        });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-border-radius', title: 'Radio del borde', lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-border-width', title: 'Ancho del borde', lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-padding-h', title: 'Padding horizontal', lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-padding-v', title: 'Padding vertical', lower: 0, upper: 255 });
        page.add(activeGroup);

        // Inactive workspace
        const inactiveGroup = new Adw.PreferencesGroup();
        inactiveGroup.set_title('Espacio inactivo');
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-background-color', title: 'Color de fondo' });
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-text-color', title: 'Color de texto' });
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-border-color', title: 'Color del borde' });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-font-size', title: 'Tamaño de fuente', lower: 0, upper: 255 });
        this._addCombo(inactiveGroup, {
            key: 'ws-inactive-workspace-font-weight',
            title: 'Grosor de fuente',
            options: { '100': 'Thin', '200': 'Extra Light', '300': 'Light', '400': 'Normal', '500': 'Medium', '600': 'Semi Bold', '700': 'Bold', '800': 'Extra Bold', '900': 'Black' },
        });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-border-radius', title: 'Radio del borde', lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-border-width', title: 'Ancho del borde', lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-padding-h', title: 'Padding horizontal', lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-padding-v', title: 'Padding vertical', lower: 0, upper: 255 });
        page.add(inactiveGroup);

        // Empty workspace
        const emptyGroup = new Adw.PreferencesGroup();
        emptyGroup.set_title('Espacio vacío');
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-background-color', title: 'Color de fondo' });
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-text-color', title: 'Color de texto' });
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-border-color', title: 'Color del borde' });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-font-size', title: 'Tamaño de fuente', lower: 0, upper: 255 });
        this._addCombo(emptyGroup, {
            key: 'ws-empty-workspace-font-weight',
            title: 'Grosor de fuente',
            options: { '100': 'Thin', '200': 'Extra Light', '300': 'Light', '400': 'Normal', '500': 'Medium', '600': 'Semi Bold', '700': 'Bold', '800': 'Extra Bold', '900': 'Black' },
        });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-border-radius', title: 'Radio del borde', lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-border-width', title: 'Ancho del borde', lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-padding-h', title: 'Padding horizontal', lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-padding-v', title: 'Padding vertical', lower: 0, upper: 255 });
        page.add(emptyGroup);
    }

    _addShortcutsGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.set_title('Atajos de teclado');
        group.set_description('Los atajos pueden no funcionar si ya están asignados a otra acción.');

        this._addToggle(group, { key: 'ws-enable-activate-workspace-shortcuts', title: 'Activar espacios (<Super>1-0)',
            shortcutLabel: '<Super>1...0' });
        this._addToggle(group, { key: 'ws-back-and-forth', title: 'Ir y volver' });
        this._addToggle(group, { key: 'ws-enable-move-to-workspace-shortcuts', title: 'Mover a espacio (<Super><Shift>1-0)',
            shortcutLabel: '<Super><Shift>1...0' });

        this._addKeyboardShortcut(group, { key: 'ws-move-workspace-left', title: 'Mover espacio a la izquierda' });
        this._addKeyboardShortcut(group, { key: 'ws-move-workspace-right', title: 'Mover espacio a la derecha' });
        this._addKeyboardShortcut(group, { key: 'ws-activate-previous-key', title: 'Volver al espacio anterior' });
        this._addKeyboardShortcut(group, { key: 'ws-activate-empty-key', title: 'Ir a espacio vacío' });
        this._addKeyboardShortcut(group, { key: 'ws-open-menu', title: 'Abrir menú' });

        page.add(group);
    }

    _addToggle(group, { key, title, subtitle = null, shortcutLabel = null }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);

        if (shortcutLabel) {
            const gtkShortcut = new Gtk.ShortcutLabel({
                accelerator: shortcutLabel,
                valign: Gtk.Align.CENTER,
            });
            row.add_prefix(gtkShortcut);
        }

        const toggle = new Gtk.Switch({
            active: this._settings.get_boolean(key),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(toggle);
        row.activatable_widget = toggle;
    }

    _addCombo(group, { key, title, subtitle = null, options }) {
        const model = Gio.ListStore.new(DropDownChoice);
        for (const id in options)
            model.append(new DropDownChoice({ id, title: options[id] }));

        const row = new Adw.ComboRow({
            title,
            subtitle,
            model,
            expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
        });
        group.add(row);

        row.connect('notify::selected-item', () => {
            const value = row.selectedItem?.id;
            if (this._settings.get_user_value(key) !== null || this._settings.get_string(key) !== value)
                this._settings.set_string(key, value);
        });

        const updateSelected = () => {
            const current = this._settings.get_string(key);
            for (let i = 0; i < model.get_n_items(); i++) {
                if (model.get_item(i).id === current) {
                    row.selected = i;
                    return;
                }
            }
            row.selected = Gtk.INVALID_LIST_POSITION;
        };
        updateSelected();
        this._settings.connect(`changed::${key}`, updateSelected);
    }

    _addSpinButton(group, { key, title, subtitle = null, lower, upper, step = 1 }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);
        const spinner = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ stepIncrement: step, lower, upper }),
            value: this._settings.get_int(key),
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        this._settings.bind(key, spinner, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(spinner);
        row.activatable_widget = spinner;
    }

    _addTextEntry(group, { key, title, subtitle = null }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);
        const entry = new Gtk.Entry({
            text: this._settings.get_string(key) || '',
            valign: Gtk.Align.CENTER,
        });
        const focusController = new Gtk.EventControllerFocus();
        focusController.connect('leave', () => {
            this._settings.set_string(key, entry.get_buffer().text || '');
        });
        entry.add_controller(focusController);
        const changed = this._settings.connect(`changed::${key}`, () => {
            entry.set_text(this._settings.get_string(key) || '');
        });
        row.add_suffix(entry);
        row.activatable_widget = entry;
    }

    _addColorButton(group, { key, title, subtitle = null }) {
        const row = new Adw.ActionRow({ title, subtitle });
        group.add(row);
        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            useAlpha: true,
        });
        const updateColor = () => {
            const color = new Gdk.RGBA();
            color.parse(this._settings.get_string(key) || 'rgba(0,0,0,0)');
            colorButton.set_rgba(color);
        };
        updateColor();
        colorButton.connect('color-set', () => {
            this._settings.set_string(key, colorButton.rgba.to_string());
        });
        const changed = this._settings.connect(`changed::${key}`, updateColor);
        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;
    }

    _addKeyboardShortcut(group, { key, title, subtitle = null }) {
        const row = new Adw.ActionRow({ title, subtitle, activatable: true });
        group.add(row);

        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: this._settings.get_strv(key)[0] ?? null,
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(shortcutLabel);
        const disabledLabel = new Gtk.Label({
            label: 'Desactivado',
            cssClasses: ['dim-label'],
        });
        row.add_suffix(disabledLabel);
        if (this._settings.get_strv(key).length > 0) {
            disabledLabel.hide();
        } else {
            shortcutLabel.hide();
        }

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
                marginBottom: 12,
                marginEnd: 12,
                marginStart: 12,
                marginTop: 12,
                orientation: Gtk.Orientation.VERTICAL,
                valign: Gtk.Align.CENTER,
            });
            box.append(new Gtk.Label({
                label: `Introduce un nuevo atajo:`,
                marginBottom: 12,
            }));
            box.append(new Gtk.Label({
                label: 'Esc para cancelar, Retroceso para desactivar',
                cssClasses: ['dim-label'],
            }));
            dialog.set_child(box);

            const keyController = new Gtk.EventControllerKey({
                propagationPhase: Gtk.PropagationPhase.CAPTURE,
            });
            dialog.add_controller(keyController);
            keyController.connect('key-pressed', (_, keyval, keycode, modifier) => {
                modifier = modifier & ~64 & ~16;
                if (Gtk.accelerator_valid(keyval, modifier)) {
                    if (keyval === Gdk.KEY_Escape) {
                        dialog.close();
                    } else if (keyval === Gdk.KEY_BackSpace && !modifier) {
                        shortcutLabel.hide();
                        disabledLabel.show();
                        this._settings.set_strv(key, []);
                        dialog.close();
                    } else {
                        const accel = Gtk.accelerator_name(keyval, modifier);
                        shortcutLabel.accelerator = accel;
                        shortcutLabel.show();
                        disabledLabel.hide();
                        this._settings.set_strv(key, [accel]);
                        dialog.close();
                    }
                }
            });
            dialog.show();
        });
    }
}

const DropDownChoice = GObject.registerClass({
    GTypeName: 'WsIndicatorDropDownChoice',
    Properties: {
        id: GObject.ParamSpec.string('id', 'ID', 'Identifier', GObject.ParamFlags.READWRITE, null),
        title: GObject.ParamSpec.string('title', 'Title', 'Displayed title', GObject.ParamFlags.READWRITE, null),
    },
}, class DropDownChoice extends GObject.Object {});
