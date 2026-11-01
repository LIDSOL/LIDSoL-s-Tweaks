'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
            title: _('Enable Workspace Indicator'),
            subtitle: _('Replaces the native workspace indicator'),
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
        group.set_title(_('Behavior'));

        this._addCombo(group, {
            key: 'ws-indicator-style',
            title: _('Indicator style'),
            options: {
                'current-workspace': _('Current workspace'),
                'workspaces-bar': _('Workspaces bar'),
            },
        });

        this._addToggle(group, { key: 'ws-always-show-numbers', title: _('Always show numbers') });
        this._addToggle(group, { key: 'ws-show-empty-workspaces', title: _('Show empty workspaces') });
        this._addToggle(group, { key: 'ws-toggle-overview', title: _('Open overview'), subtitle: _('When clicking the active or empty workspace') });
        this._addToggle(group, { key: 'ws-show-app-icons', title: _('Show app icons'),
            subtitle: _('Shows icons of open windows in each workspace (workspaces bar only)') });
        this._addToggle(group, { key: 'ws-middle-click-close', title: _('Close window with middle click') });

        this._addNativeIndicatorToggle(group);

        this._addCombo(group, {
            key: 'ws-scroll-wheel',
            title: _('Mouse wheel'),
            options: { panel: _('Over the panel'), 'workspaces-bar': _('Over the indicator'), disabled: _('Disabled') },
        });
        this._addToggle(group, { key: 'ws-scroll-wheel-debounce', title: _('Debounce'), subtitle: _('Prevents a fast wheel spin from "jumping" several workspaces at once (or an accidental scroll from changing many workspaces)') });
        this._addSpinButton(group, { key: 'ws-scroll-wheel-debounce-time', title: _('Debounce time (ms)'), lower: 0, upper: 2000, step: 50 });
        this._addCombo(group, {
            key: 'ws-scroll-wheel-vertical',
            title: _('Vertical scroll'),
            options: { normal: _('Normal'), inverted: _('Inverted'), disabled: _('Disabled') },
        });
        this._addCombo(group, {
            key: 'ws-scroll-wheel-horizontal',
            title: _('Horizontal scroll'),
            options: { normal: _('Normal'), inverted: _('Inverted'), disabled: _('Disabled') },
        });
        this._addToggle(group, { key: 'ws-scroll-wheel-wrap-around', title: _('Wrap around') });

        // Custom labels
        this._addToggle(group, { key: 'ws-enable-custom-label', title: _('Use custom labels') });
        this._addToggle(group, { key: 'ws-enable-custom-label-in-menu', title: _('Custom labels in menu') });
        this._addTextEntry(group, { key: 'ws-custom-label-named', title: _('Label for named workspaces') });
        this._addTextEntry(group, { key: 'ws-custom-label-unnamed', title: _('Label for unnamed workspaces') });

        page.add(group);

        // Smart workspace names
        const smartGroup = new Adw.PreferencesGroup();
        smartGroup.set_title(_('Smart names'));
        smartGroup.set_description(_('Remembers open apps when renaming a workspace and assigns names automatically.'));
        this._addToggle(smartGroup, { key: 'ws-smart-workspace-names', title: _('Enable smart names') });
        this._addToggle(smartGroup, { key: 'ws-reevaluate-smart-workspace-names', title: _('Re-evaluate names') });
        page.add(smartGroup);
    }

    // "Keep native indicator": mirrored onto Top Bar Organizer's own
    // mechanism (tbo-hide/tbo-show) for the `activities` role, so both switches
    // behave as one. Disabled unless Top Bar Organizer (tbo-enabled) is on.
    _addNativeIndicatorToggle(group) {
        const row = new Adw.ActionRow({
            title: _('Keep native indicator'),
            subtitle: _('Keeps the system Activities button visible (managed by Top Bar Organizer)'),
        });
        group.add(row);

        const toggle = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        const getHide = () => {
            try { return this._settings.get_strv('tbo-hide'); }
            catch (e) { return []; }
        };
        const getShow = () => {
            try { return this._settings.get_strv('tbo-show'); }
            catch (e) { return []; }
        };
        const isHidden = () => getHide().includes('activities');
        const isTboOn = () => {
            try { return this._settings.get_boolean('tbo-enabled'); }
            catch (e) { return false; }
        };

        const refresh = () => {
            toggle.set_active(!isHidden());
            toggle.set_sensitive(isTboOn());
        };
        refresh();
        this._settings.connect('changed::tbo-hide', refresh);
        this._settings.connect('changed::tbo-show', refresh);
        this._settings.connect('changed::tbo-enabled', refresh);

        toggle.connect('notify::active', () => {
            if (!toggle.sensitive)
                return;
            const hide = getHide();
            const show = getShow();
            if (toggle.active) {
                const hi = hide.indexOf('activities');
                if (hi !== -1)
                    hide.splice(hi, 1);
                if (!show.includes('activities'))
                    show.push('activities');
            } else {
                const si = show.indexOf('activities');
                if (si !== -1)
                    show.splice(si, 1);
                if (!hide.includes('activities'))
                    hide.push('activities');
            }
            try {
                this._settings.set_strv('tbo-hide', hide);
                this._settings.set_strv('tbo-show', show);
            } catch (e) {
                console.error('[WI] error toggling native indicator:', e);
            }
        });
    }

    _addAppearanceGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.set_title(_('Appearance'));
        this._addSpinButton(group, { key: 'ws-workspaces-bar-padding', title: _('Bar padding'), lower: 0, upper: 255 });
        this._addSpinButton(group, { key: 'ws-workspace-margin', title: _('Margin between workspaces'), lower: 0, upper: 255 });
        this._addSpinButton(group, { key: 'ws-workspace-name-icons-spacing', title: _('Name/icons spacing'), subtitle: _('Separates the workspace name from its icons'), lower: 0, upper: 255 });

        this._addCombo(group, {
            key: 'ws-icon-size-mode',
            title: _('Icon size'),
            subtitle: _('Controls the size of icons and font'),
            options: { small: _('Small (16px)'), medium: _('Medium (20px)'), large: _('Large (26px)') },
        });

        this._addToggle(group, { key: 'ws-dim-inactive-icons', title: _('Dim inactive icons'),
            subtitle: _('Shows all icons except the focused one with reduced opacity') });
        this._addToggle(group, { key: 'ws-desaturate-inactive-icons', title: _('Desaturate inactive icons'),
            subtitle: _('Shows all icons except the focused one in grayscale') });

        this._addToggle(group, { key: 'ws-focus-scale-effect', title: _('Focus scale effect'),
            subtitle: _('Slightly reduces the icons of unfocused apps with a smooth transition') });
        this._addSpinButton(group, { key: 'ws-focus-scale-reduction', title: _('Reduction amount'),
            subtitle: _('Percentage by which unfocused icons are reduced'), lower: 5, upper: 40 });

        this._addToggle(group, { key: 'ws-enable-animations', title: _('Enable icon animations'),
            subtitle: _('Smoothly animates openings, closings, movements, creations and reorderings. Disable for instant updates.') });

        this._addCombo(group, {
            key: 'ws-transition-animation',
            title: _('Transition animation'),
            options: {
                fade: _('Fade'),
                'soft-pulse': _('Pulse'),
                'soft-slide': _('Slide + fade'),
                none: _('None'),
            },
        });

        page.add(group);

        // Active workspace
        const activeGroup = new Adw.PreferencesGroup();
        activeGroup.set_title(_('Active workspace'));

        const accentRow = new Adw.ActionRow({
            title: _('Use GNOME accent color'),
            subtitle: _('The border uses the system accent color; the background, a dark tone derived from that color. Text always #F6F5F4.'),
        });
        const accentSwitch = new Gtk.Switch({
            active: this._settings.get_boolean('ws-use-accent-color'),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind('ws-use-accent-color', accentSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        accentRow.add_suffix(accentSwitch);
        accentRow.activatable_widget = accentSwitch;
        activeGroup.add(accentRow);

        const bgColorRow = this._addColorButton(activeGroup, { key: 'ws-active-workspace-background-color', title: _('Background color') });
        const textColorRow = this._addColorButton(activeGroup, { key: 'ws-active-workspace-text-color', title: _('Text color') });
        const borderColorRow = this._addColorButton(activeGroup, { key: 'ws-active-workspace-border-color', title: _('Border color') });

        const colorRows = [bgColorRow, textColorRow, borderColorRow];
        const updateAccentSensitivity = () => {
            const accent = this._settings.get_boolean('ws-use-accent-color');
            for (const row of colorRows) {
                row.set_sensitive(!accent);
            }
        };
        updateAccentSensitivity();
        this._settings.connect('changed::ws-use-accent-color', updateAccentSensitivity);

        this._addCombo(activeGroup, {
            key: 'ws-active-workspace-font-weight',
            title: _('Font weight'),
            options: { '100': _('Thin'), '200': _('Extra Light'), '300': _('Light'), '400': _('Normal'), '500': _('Medium'), '600': _('Semi Bold'), '700': _('Bold'), '800': _('Extra Bold'), '900': _('Black') },
        });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-border-radius', title: _('Border radius'), lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-border-width', title: _('Border width'), lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-padding-h', title: _('Horizontal padding'), lower: 0, upper: 255 });
        this._addSpinButton(activeGroup, { key: 'ws-active-workspace-padding-v', title: _('Vertical padding'), lower: 0, upper: 255 });
        page.add(activeGroup);

        // Inactive workspace
        const inactiveGroup = new Adw.PreferencesGroup();
        inactiveGroup.set_title(_('Inactive workspace'));
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-background-color', title: _('Background color') });
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-text-color', title: _('Text color') });
        this._addColorButton(inactiveGroup, { key: 'ws-inactive-workspace-border-color', title: _('Border color') });
        this._addCombo(inactiveGroup, {
            key: 'ws-inactive-workspace-font-weight',
            title: _('Font weight'),
            options: { '100': _('Thin'), '200': _('Extra Light'), '300': _('Light'), '400': _('Normal'), '500': _('Medium'), '600': _('Semi Bold'), '700': _('Bold'), '800': _('Extra Bold'), '900': _('Black') },
        });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-border-radius', title: _('Border radius'), lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-border-width', title: _('Border width'), lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-padding-h', title: _('Horizontal padding'), lower: 0, upper: 255 });
        this._addSpinButton(inactiveGroup, { key: 'ws-inactive-workspace-padding-v', title: _('Vertical padding'), lower: 0, upper: 255 });
        page.add(inactiveGroup);

        // Empty workspace
        const emptyGroup = new Adw.PreferencesGroup();
        emptyGroup.set_title(_('Empty workspace'));
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-background-color', title: _('Background color') });
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-text-color', title: _('Text color') });
        this._addColorButton(emptyGroup, { key: 'ws-empty-workspace-border-color', title: _('Border color') });
        this._addCombo(emptyGroup, {
            key: 'ws-empty-workspace-font-weight',
            title: _('Font weight'),
            options: { '100': _('Thin'), '200': _('Extra Light'), '300': _('Light'), '400': _('Normal'), '500': _('Medium'), '600': _('Semi Bold'), '700': _('Bold'), '800': _('Extra Bold'), '900': _('Black') },
        });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-border-radius', title: _('Border radius'), lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-border-width', title: _('Border width'), lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-padding-h', title: _('Horizontal padding'), lower: 0, upper: 255 });
        this._addSpinButton(emptyGroup, { key: 'ws-empty-workspace-padding-v', title: _('Vertical padding'), lower: 0, upper: 255 });
        page.add(emptyGroup);
    }

    _addShortcutsGroup(page) {
        const group = new Adw.PreferencesGroup();
        group.set_title(_('Keyboard shortcuts'));
        group.set_description(_('Shortcuts may not work if they are already assigned to another action.'));

        this._addToggle(group, { key: 'ws-enable-activate-workspace-shortcuts', title: _('Activate workspaces (<Super>1-0)'),
            shortcutLabel: '<Super>1...0' });
        this._addToggle(group, { key: 'ws-back-and-forth', title: _('Go back and forth') });
        this._addToggle(group, { key: 'ws-enable-move-to-workspace-shortcuts', title: _('Move to workspace (<Super><Shift>1-0)'),
            shortcutLabel: '<Super><Shift>1...0' });

        this._addKeyboardShortcut(group, { key: 'ws-move-workspace-left', title: _('Move workspace left') });
        this._addKeyboardShortcut(group, { key: 'ws-move-workspace-right', title: _('Move workspace right') });
        this._addKeyboardShortcut(group, { key: 'ws-activate-previous-key', title: _('Go to previous workspace') });
        this._addKeyboardShortcut(group, { key: 'ws-activate-empty-key', title: _('Go to empty workspace') });
        this._addKeyboardShortcut(group, { key: 'ws-open-menu', title: _('Open menu') });

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
        return row;
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
            label: _('Disabled'),
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
                title: _('Set shortcut'),
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
                label: _('Enter a new shortcut:'),
                marginBottom: 12,
            }));
            box.append(new Gtk.Label({
                label: _('Esc to cancel, Backspace to disable'),
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