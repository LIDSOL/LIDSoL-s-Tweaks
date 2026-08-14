#!/usr/bin/gjs -m

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { createQWindow } from './interface.js';
import { vevent, vtodo, treated } from './events.js';

const MOD_PATH = ARGV[0];
const SCHEMA_ID = 'org.gnome.shell.extensions.lidsol-widgets';

function getSettings() {
    const schemaSource = Gio.SettingsSchemaSource.get_default();
    const schema = schemaSource.lookup(SCHEMA_ID, true);
    if (!schema)
        throw new Error('Schema not found: ' + SCHEMA_ID);
    return new Gio.Settings({settings_schema: schema});
}

function fopen(path) {
    const file = Gio.File.new_for_path(path);
    const [ok, string] = file.load_contents(null);
    if (ok) {
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(string);
    }
    console.error('Failed to open file');
    return '';
}

function doSave(str) {
    const settings = getSettings();
    const fpath = settings.get_string('qt-filepath');
    const file = Gio.File.new_for_path(fpath);
    file.replace_contents(str, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

function getTimeFormat() {
    const gSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    return gSettings.get_string('clock-format');
}

const QuickTextApp = GObject.registerClass({
    GTypeName: 'QuickTextApp',
}, class QuickTextApp extends Adw.Application {
    _init() {
        this.items = [];
        this.recycle = {};
        this.ID = 'com.github.brainstormtrooper.QuickText';
        super._init({application_id: this.ID});
        GLib.set_prgname(this.ID);
        GLib.set_application_name('QuickText');
    }

    vfunc_activate() {
        super.vfunc_activate();
        this.timeFmt = getTimeFormat();

        try {
            const cssProvider = Gtk.CssProvider.new();
            cssProvider.load_from_path(MOD_PATH + '/stylesheet.css');
            const display = Gdk.Display.get_default();
            Gtk.StyleContext.add_provider_for_display(
                display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        } catch (error) {
            console.error(error);
        }

        const QWindow = createQWindow(MOD_PATH + '/interface.ui');
        this.window = new QWindow({application: this});
        this.openButton = this.window._openButton;
        this.toastOverlay = this.window._toast_overlay;
        this.launcher = new Gio.SubprocessLauncher();

        this.openButton.connect('clicked', () => {
            const settings = getSettings();
            this.launcher.spawnv(['xdg-open', settings.get_string('qt-filepath')]);
        });

        const populate = () => {
            this.window._listBox.append(this._getListUI());
            this.window.queue_allocate();
        };
        if (this.window.get_mapped())
            populate();
        else
            this.window.connect('map', populate);
        this.window.present();

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            if (!this.window || !this.window.get_mapped())
                return GLib.SOURCE_REMOVE;
            const [w, h] = this.window.get_size();
            this.window.set_default_size(w + 1, h + 1);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                if (this.window)
                    this.window.set_default_size(w, h);
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _getTimeFormat() {
        return getTimeFormat();
    }

    _updateListUI() {
        this.window._listBox.remove(this.listBox);
        this.window._listBox.append(this._getListUI());
    }

    _leadingZeros(spinButton) {
        const adjustment = spinButton.get_adjustment();
        spinButton.set_text(String(adjustment.get_value()).padStart(2, '0'));
        return true;
    }

    _getPicker(i) {
        const now = GLib.DateTime.new_now_local();

        const tbtn = Gtk.ToggleButton.new_with_label('Task');
        const ebtn = Gtk.ToggleButton.new_with_label('Event');
        ebtn.set_group(tbtn);
        ebtn.set_active(true);
        const rowLabel = new Gtk.Label({label: 'Create new : '});
        const rowLimit = new Gtk.Label({label: 'Duration : '});
        const dAdjust = new Gtk.Adjustment({
            value: 1, lower: 1, upper: 24, step_increment: 1,
        });
        const duration = new Gtk.SpinButton({
            adjustment: dAdjust, climb_rate: 1, numeric: true,
            digits: 0, value: 1, hexpand: false,
        });
        duration.set_orientation(Gtk.Orientation.HORIZONTAL);

        tbtn.connect('toggled', () => {
            rowLimit.set_label('Due :');
            duration.set_visible(false);
        });
        ebtn.connect('toggled', () => {
            rowLimit.set_label('Duration :');
            duration.set_visible(true);
        });

        const row1 = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 6});
        const row2 = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 6});
        row1.append(rowLabel);
        row1.append(tbtn);
        row1.append(ebtn);
        row2.append(rowLimit);
        row2.append(duration);

        const row3 = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 6});
        const calendar = new Gtk.Calendar();

        const hAdjust = new Gtk.Adjustment({
            value: now.get_hour(), lower: 1,
            upper: (this.timeFmt === '12h' ? 12 : 24),
            step_increment: 1,
        });
        const hours = new Gtk.SpinButton({
            adjustment: hAdjust, climb_rate: 1, numeric: true,
            digits: 0, value: now.get_hour(), vexpand: false,
        });
        hours.set_orientation(Gtk.Orientation.VERTICAL);
        hours.connect('output', this._leadingZeros);

        const mAdjust = new Gtk.Adjustment({
            value: now.get_minute(), lower: 0, upper: 59, step_increment: 10,
        });
        const minutes = new Gtk.SpinButton({
            adjustment: mAdjust, climb_rate: 10, numeric: true,
            digits: 0, value: now.get_minute(), vexpand: false,
        });
        minutes.set_orientation(Gtk.Orientation.VERTICAL);
        minutes.connect('output', this._leadingZeros);

        const timeSep = new Gtk.Label({label: ':'});
        const am = Gtk.ToggleButton.new_with_label('AM');
        const pm = Gtk.ToggleButton.new_with_label('PM');
        pm.set_group(am);
        if (now.get_hour() >= 12) {
            pm.set_active(true);
            if (this.timeFmt === '12h' && now.get_hour() > 12)
                hours.set_value(now.get_hour() - 12);
        } else {
            am.set_active(true);
        }
        const ampmBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL, spacing: 6,
            visible: (this.timeFmt === '12h'),
        });
        ampmBox.append(am);
        ampmBox.append(pm);

        const timeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 6,
            baseline_position: Gtk.BaselinePosition.CENTER, vexpand: false,
        });
        timeBox.append(hours);
        timeBox.append(timeSep);
        timeBox.append(minutes);
        timeBox.append(ampmBox);

        const times = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL, spacing: 6, homogeneous: true,
        });
        const above = new Gtk.Separator({orientation: Gtk.Orientation.VERTICAL});
        const below = new Gtk.Separator({orientation: Gtk.Orientation.VERTICAL});
        above.add_css_class('spacer');
        below.add_css_class('spacer');
        times.append(above);
        times.append(timeBox);
        times.append(below);

        row3.append(calendar);
        row3.append(times);

        const pickBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6});
        const save = new Gtk.Button({label: 'Save'});
        const row4 = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 6,
            halign: Gtk.Align.END,
        });
        row4.append(save);
        pickBox.append(row1);
        pickBox.append(row2);
        pickBox.append(row3);
        pickBox.append(row4);

        save.connect('clicked', () => {
            const note = this.items[i];
            const isEvent = ebtn.get_active();
            const selDate = calendar.get_date();
            const hour = (pm.get_active() && this.timeFmt === '12h'
                && parseInt(hours.get_value()) < 12)
                ? String(parseInt(hours.get_value()) + 12)
                : hours.get_value();
            const start = GLib.DateTime.new_local(
                selDate.get_year(),
                selDate.get_month(),
                selDate.get_day_of_month(),
                parseInt(hour),
                parseInt(minutes.get_value()),
                0,
            );
            const due = start;
            const end = start.add_hours(parseInt(duration.get_value()));

            const obj = {note, start, end, due, isEvent};
            const tpl = (isEvent ? vevent : vtodo);
            const eventstr = this._strRepl(tpl, obj);

            const [tmpEvent] = Gio.File.new_tmp('quick-XXXXXX.ics');
            const bytes = new GLib.Bytes(eventstr);
            tmpEvent.replace_contents(bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            this.launcher.spawnv(['xdg-open', tmpEvent.get_path()]);
            this.items[i] = this._doFlag(this.items[i]);
            this._doSave(this._doJoin(this.items));
            this._updateListUI();
        });

        return pickBox;
    }

    _getListUI() {
        const settings = getSettings();
        const hideActed = settings.get_boolean('qt-hideacted');
        this.listBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6});

        try {
            this._doList();
            this.items.filter(item => /\S/.test(item)).forEach((item, i) => {
                if ((hideActed && !item.match(/Quick treated/m)) || !hideActed) {
                    const frame = new Gtk.Frame({label: null});
                    const liBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});

                    const undeleteAction = new Gio.SimpleAction({name: `undelete_${i}`});
                    undeleteAction.connect('activate', () => {
                        this.items.splice(i, 0, this.recycle[i]);
                        this._doSave(this._doJoin(this.items));
                        this._updateListUI();
                    });
                    this.add_action(undeleteAction);

                    const undeleteToast = new Adw.Toast({title: 'Note deleted'});
                    undeleteToast.set_button_label('Undo');
                    undeleteToast.set_action_name(`app.undelete_${i}`);

                    const liTxtView = new Gtk.TextView();
                    const liBuffer = new Gtk.TextBuffer();
                    liBuffer.set_text(this._cleanItem(item), -1);
                    liTxtView.set_buffer(liBuffer);
                    liTxtView.set_editable(false);

                    const ePopover = new Gtk.Popover();
                    ePopover.set_child(this._getPicker(i));

                    const liBtns = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        halign: Gtk.Align.END,
                    });

                    const liDeleteBtn = new Gtk.Button({
                        icon_name: 'user-trash-symbolic',
                        tooltip_text: 'Delete',
                    });
                    const liEditBtn = new Gtk.Button({
                        icon_name: 'document-edit-symbolic',
                        tooltip_text: 'Edit',
                    });
                    const liSaveBtn = new Gtk.Button({
                        icon_name: 'document-save-symbolic',
                        tooltip_text: 'Save',
                        visible: false,
                    });
                    const liCancelBtn = new Gtk.Button({
                        icon_name: 'edit-delete-symbolic',
                        tooltip_text: 'Cancel',
                        visible: false,
                    });
                    const liEventBtn = new Gtk.MenuButton({
                        icon_name: 'x-office-calendar-symbolic',
                        tooltip_text: 'New Event',
                        popover: ePopover,
                    });

                    liDeleteBtn.connect('clicked', () => {
                        this.recycle[i] = item;
                        this.items = this.items.filter(v => v !== item);
                        this._doSave(this._doJoin(this.items));
                        this.toastOverlay.add_toast(undeleteToast);
                        this._updateListUI();
                    });

                    liEditBtn.connect('clicked', () => {
                        liEditBtn.set_visible(false);
                        liSaveBtn.set_visible(true);
                        liCancelBtn.set_visible(true);
                        liTxtView.set_editable(true);
                    });

                    liCancelBtn.connect('clicked', () => {
                        liEditBtn.set_visible(true);
                        liSaveBtn.set_visible(false);
                        liCancelBtn.set_visible(false);
                        liTxtView.set_editable(false);
                        this._updateListUI();
                    });

                    liSaveBtn.connect('clicked', () => {
                        liEditBtn.set_visible(true);
                        liSaveBtn.set_visible(false);
                        liCancelBtn.set_visible(false);
                        liTxtView.set_editable(false);
                        const text = liBuffer.get_text(
                            liBuffer.get_start_iter(),
                            liBuffer.get_end_iter(), true).trim();
                        this.items[i] = text;
                        this._doSave(this._doJoin(this.items));
                        this._updateListUI();
                    });

                    liBtns.append(liEditBtn);
                    liBtns.append(liSaveBtn);
                    liBtns.append(liCancelBtn);
                    liBtns.append(liEventBtn);
                    liBtns.append(liDeleteBtn);
                    liBtns.add_css_class('toolbar');

                    liBox.append(liTxtView);
                    liBox.append(liBtns);
                    liBox.add_css_class('card');
                    frame.set_child(liBox);
                    this.listBox.append(frame);
                }
            });
        } catch (error) {
            console.error(error);
        }

        return this.listBox;
    }

    _doFlag(item) {
        const now = GLib.DateTime.new_now_utc();
        const stamp = now.format('%Y%m%dT%H%M%SZ');
        return `${item}${treated.replace('{{stamp}}', stamp)}\r`;
    }

    _doJoin(items) {
        return items.join('\n');
    }

    _doList() {
        const settings = getSettings();
        const fpath = settings.get_string('qt-filepath');
        const append = settings.get_string('qt-append');
        try {
            const fileStr = fopen(fpath);
            if (append && fileStr.includes(append)) {
                this.items = fileStr.split(append);
            } else {
                this.items = fileStr.split(/\r?\n/g);
            }
            this.items = this.items
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } catch (error) {
            console.error(error);
        }
    }

    _doSave(str) {
        doSave(str);
    }

    _cleanItem(item) {
        const append = getSettings().get_string('qt-append');
        if (!append)
            return item;
        const esc = append.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return item.replace(new RegExp(`^[ \\t]*${esc}[ \\t]*$`, 'gm'), '');
    }

    _getSummary(note) {
        const lines = this._cleanItem(note).trim().split(/\r\n|\r|\n/gm);
        const summary = (lines[1] && lines[1].length > 72)
            ? lines[1].slice(0, 71) + '...'
            : (lines[1] || '');
        const mapped = lines.map(l => l.match(/.{1,72}/g).join('\r\n '));
        const desc = mapped.join('\\n');
        return [summary, desc];
    }

    _strRepl(tpl, obj) {
        let myCal = tpl;
        const id = this._makeid();
        const [summary, note] = this._getSummary(obj.note);

        const now = GLib.DateTime.new_now_utc();
        const stamp = now.format('%Y%m%dT%H%M%SZ');
        const start = obj.start.to_utc();
        const startdate = start.format('%Y%m%dT%H%M%SZ');
        const due = obj.due.to_utc();
        const duedate = due.format('%Y%m%dT%H%M%SZ');
        const end = obj.end.to_utc();
        const enddate = end.format('%Y%m%dT%H%M%SZ');

        myCal = myCal.replace(/{{stamp}}/gm, stamp);
        myCal = myCal.replace(/{{duedate}}/gm, duedate);
        myCal = myCal.replace(/{{startdate}}/gm, startdate);
        myCal = myCal.replace(/{{enddate}}/gm, enddate);
        myCal = myCal.replace(/{{uuid}}/gm, id);
        myCal = myCal.replace(/{{summary}}/gm, summary);
        myCal = myCal.replace(/{{note}}/gm, note);

        return myCal;
    }

    _makeid() {
        let result = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let counter = 0; counter < 6; counter++)
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }
});

const app = new QuickTextApp();
try {
    app.run(null);
} catch (error) {
    console.error(error);
}
