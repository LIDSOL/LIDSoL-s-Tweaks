'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { createDialog, createModuleRow } from '../../utils/prefsHelpers.js';

export class DashboardPrefs {
    constructor(settings, window) {
        this._settings = settings;
        this._window = window;
        this._alignModel = null;
    }

    createModuleRow() {
        return createModuleRow({
            settings: this._settings,
            bindKey: 'dashboard-enabled',
            title: _('Dashboard'),
            subtitle: _('Panel with general widgets'),
            onDetailed: () => this.openDashboardDialog(),
        });
    }

    openDashboardDialog() {
        createDialog({
            window: this._window,
            title: _('Dashboard'),
            childrenRequest: (page) => this.populateGroups(page),
        });
    }

    populateGroups(page) {
        const s = this._settings;

        // ── Dash group ──
        const dashGroup = new Adw.PreferencesGroup({ title: _('Dash') });

        const shortcutRow = new Adw.ActionRow({ title: _('Shortcut Hotkey') });
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: s.get_strv('dashboard-shortcut')[0] ?? null,
            valign: Gtk.Align.CENTER,
        });
        const shortcutBtn = new Gtk.Button({ label: _('Set Hotkey'), valign: Gtk.Align.CENTER });
        shortcutBtn.connect('clicked', () => {
            const dialog = new Gtk.Dialog({
                title: _('Set Hotkey'),
                modal: true,
                useHeaderBar: 1,
                transientFor: page.get_root(),
                widthRequest: 400,
                heightRequest: 200,
            });
            const box = new Gtk.Box({
                marginBottom: 12, marginEnd: 12, marginStart: 12, marginTop: 12,
                orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER,
            });
            box.append(new Gtk.Label({ label: _('Press a key combination:'), marginBottom: 12 }));
            box.append(new Gtk.Label({
                label: _('Esc to cancel, Backspace to disable'),
                css_classes: ['dim-label'],
            }));
            dialog.set_child(box);
            const keyCtrl = new Gtk.EventControllerKey({ propagationPhase: Gtk.PropagationPhase.CAPTURE });
            dialog.add_controller(keyCtrl);
            keyCtrl.connect('key-pressed', (_, keyval, _keycode, modifier) => {
                modifier = modifier & ~64 & ~16;
                if (!Gtk.accelerator_valid(keyval, modifier)) return Gdk.EVENT_STOP;
                if (keyval === Gdk.KEY_Escape) { dialog.close(); return Gdk.EVENT_STOP; }
                if (keyval === Gdk.KEY_BackSpace && !modifier) {
                    s.set_strv('dashboard-shortcut', []);
                    shortcutLabel.accelerator = null;
                    dialog.close(); return Gdk.EVENT_STOP;
                }
                const accel = Gtk.accelerator_name(keyval, modifier);
                s.set_strv('dashboard-shortcut', [accel]);
                shortcutLabel.accelerator = accel;
                dialog.close(); return Gdk.EVENT_STOP;
            });
            dialog.present();
        });
        shortcutRow.add_suffix(shortcutLabel);
        shortcutRow.add_suffix(shortcutBtn);
        dashGroup.add(shortcutRow);

        dashGroup.add(this._makeAlignRow(s, _('X Align'), 'dashboard-x-align'));
        dashGroup.add(this._makeAlignRow(s, _('Y Align'), 'dashboard-y-align'));
        dashGroup.add(this._makeSpinRow(s, _('X Offset'), 'dashboard-x-offset', -1000, 1000, 10));
        dashGroup.add(this._makeSpinRow(s, _('Y Offset'), 'dashboard-y-offset', -1000, 1000, 10));
        dashGroup.add(this._makeExpandRow(s, _('Darken Background'), 'dashboard-darken'));
        dashGroup.add(this._makeSpinRow(s, _('Container Scale (%)'), 'dashboard-dialog-scale', 50, 150, 5));
        page.add(dashGroup);

        // ── Grid group ──
        const gridGroup = new Adw.PreferencesGroup({ title: _('Grid Layout') });
        gridGroup.add(this._makeSpinRow(s, _('Spacing'), 'dashboard-grid-spacing', 0, 30, 1));
        gridGroup.add(this._makeSpinRow(s, _('Columns'), 'dashboard-grid-columns', 1, 6, 1));
        page.add(gridGroup);

        // ── Widgets group ──
        const widgetsGroup = new Adw.PreferencesGroup({ title: _('Widgets') });
        page.add(widgetsGroup);

        widgetsGroup.add(this._makeWidgetExpander(s, 'user', _('User'), exp => {
            exp.add_row(this._makeSpinRow(s, _('Icon Roundness'), 'dashboard-user-icon-roundness', 1, 99, 1));
            exp.add_row(this._makeSpinRow(s, _('Icon Width'), 'dashboard-user-icon-width', 50, 100, 2));
            exp.add_row(this._makeSpinRow(s, _('Icon Height'), 'dashboard-user-icon-height', 50, 100, 2));
            exp.add_row(this._makeSpinRow(s, _('Text Spacing'), 'dashboard-user-text-spacing', 0, 80, 1));
            exp.add_row(this._makeExpandRow(s, _('Vertical'), 'dashboard-user-vertical'));
        }));

        widgetsGroup.add(this._makeWidgetExpander(s, 'levels', _('System Levels'), exp => {
            exp.add_row(this._makeSpinRow(s, _('Width'), 'dashboard-levels-fixed-width', 300, 530, 5));
            exp.add_row(this._makeExpandRow(s, _('Show Battery'), 'dashboard-levels-show-battery'));
            exp.add_row(this._makeExpandRow(s, _('Show Storage'), 'dashboard-levels-show-storage'));
            exp.add_row(this._makeExpandRow(s, _('Show CPU'), 'dashboard-levels-show-cpu'));
            exp.add_row(this._makeExpandRow(s, _('Show RAM'), 'dashboard-levels-show-ram'));
            exp.add_row(this._makeExpandRow(s, _('Show Temperature'), 'dashboard-levels-show-temp'));

            const commandEntry = new Gtk.Entry({
                text: s.get_string('dashboard-levels-command'),
                valign: Gtk.Align.CENTER,
            });
            const cf = new Gtk.EventControllerFocus();
            cf.connect('leave', () => s.set_string('dashboard-levels-command', commandEntry.get_buffer().text));
            commandEntry.add_controller(cf);
            const commandRow = new Adw.ActionRow({ title: _('Command'), activatable_widget: commandEntry });
            commandRow.add_suffix(commandEntry);
            exp.add_row(commandRow);
        }));

        widgetsGroup.add(this._makeWidgetExpander(s, 'media', _('Media Player'), exp => {
            const styleModel = new Gtk.StringList({ strings: [_('Normal Vertical'), _('Normal Horizontal'), _('Full')] });
            const styleRow = new Adw.ComboRow({ title: _('Style'), model: styleModel, selected: s.get_int('dashboard-media-style') });
            styleRow.connect('notify::selected', () => s.set_int('dashboard-media-style', styleRow.selected));
            exp.add_row(styleRow);

            exp.add_row(this._makeSpinRow(s, _('Cover Width'), 'dashboard-media-cover-width', 100, 800, 5));
            exp.add_row(this._makeSpinRow(s, _('Cover Height'), 'dashboard-media-cover-height', 100, 800, 5));
            exp.add_row(this._makeSpinRow(s, _('Cover Roundness'), 'dashboard-media-cover-roundness', 0, 48, 1));
            exp.add_row(this._makeExpandRow(s, _('Fade'), 'dashboard-media-fade'));
            exp.add_row(this._makeExpandRow(s, _('Show Text'), 'dashboard-media-show-text'));

            exp.add_row(this._makeExpandRow(s, _('Show Loop and Shuffle'), 'dashboard-media-show-loop-shuffle'));
        }));

        widgetsGroup.add(this._makeWidgetExpander(s, 'clock', _('Clock'), exp => {
            exp.add_row(this._makeExpandRow(s, _('Vertical'), 'dashboard-clock-vertical'));
            exp.add_row(this._makeSpinRow(s, _('Time Size'), 'dashboard-clock-clock-size', 20, 70, 2));
            exp.add_row(this._makeSpinRow(s, _('Date Size'), 'dashboard-clock-date-size', 15, 30, 1));
            exp.add_row(this._makeSpinRow(s, _('Spacing'), 'dashboard-clock-spacing', 0, 50, 1));
        }));

        widgetsGroup.add(this._makeWidgetExpander(s, 'apps', _('App Launcher'), exp => {
            exp.add_row(this._makeSpinRow(s, _('Rows'), 'dashboard-apps-rows', 1, 6, 1));
            exp.add_row(this._makeSpinRow(s, _('Columns'), 'dashboard-apps-cols', 1, 6, 1));
            exp.add_row(this._makeSpinRow(s, _('Icon Size'), 'dashboard-apps-icon-size', 4, 100, 2));
        }));

        widgetsGroup.add(this._makeWidgetExpander(s, 'system', _('Settings & System'), exp => {
            const layoutModel = new Gtk.StringList({ strings: [_('Stacked'), _('Side by Side')] });
            const layoutRow = new Adw.ComboRow({ title: _('Layout'), subtitle: _('Stacked: two rows (current behavior).\nSide by Side: single row.'), model: layoutModel, selected: s.get_int('dashboard-system-layout') });
            layoutRow.connect('notify::selected', () => s.set_int('dashboard-system-layout', layoutRow.selected));
            exp.add_row(layoutRow);
            exp.add_row(this._makeSpinRow(s, _('Icon Size'), 'dashboard-system-icon-size', 4, 100, 2));
        }));
    }

    _getAlignModel() {
        if (!this._alignModel) {
            this._alignModel = new Gtk.StringList({ strings: [_('Fill'), _('Start'), _('Center'), _('End')] });
        }
        return this._alignModel;
    }

    _makeAlignRow(s, title, bindKey) {
        const row = new Adw.ComboRow({
            title,
            model: this._getAlignModel(),
            selected: s.get_int(bindKey),
        });
        row.connect('notify::selected', () => s.set_int(bindKey, row.selected));
        s.connect(`changed::${bindKey}`, () => { row.selected = s.get_int(bindKey); });
        return row;
    }

    _makeExpandRow(s, title, bindKey) {
        const row = new Adw.SwitchRow({
            title,
            active: s.get_boolean(bindKey),
        });
        s.bind(bindKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _makeSpinRow(s, title, bindKey, low, high, step) {
        const adj = new Gtk.Adjustment({ lower: low, upper: high, step_increment: step });
        const spin = new Gtk.SpinButton({ adjustment: adj, numeric: true, valign: Gtk.Align.CENTER });
        s.bind(bindKey, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
        const row = new Adw.ActionRow({ title, activatable_widget: spin });
        row.add_suffix(spin);
        return row;
    }

    _makeWidgetExpander(s, name, title, extraRows) {
        const prefix = `dashboard-${name}`;
        const expander = new Adw.ExpanderRow({ title });
        expander.add_row(this._makeExpandRow(s, _('Background'), `${prefix}-background`));
        if (extraRows) extraRows(expander);
        return expander;
    }
}