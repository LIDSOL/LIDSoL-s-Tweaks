'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

export class QuickTextModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._dialog = null;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        Main.wm.addKeybinding(
            'qt-hotkey',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._doDialog.bind(this));
    }

    disable() {
        if (this._dialog) {
            this._dialog.close();
            this._dialog = null;
        }
        Main.wm.removeKeybinding('qt-hotkey');
        this._settings = null;
        this._extension = null;
    }

    _doDialog() {
        const maxLenMulti = 1000;
        const maxLenSingle = 256;
        const filepath = this._settings.get_string('qt-filepath');
        const pendLoc = this._settings.get_string('qt-pendlocation');
        const append = this._settings.get_string('qt-append');
        const prependStr = this._settings.get_string('qt-prepend');

        const dialog = new ModalDialog.ModalDialog();
        this._dialog = dialog;

        const title = 'Save A Note';
        const content = new Dialog.MessageDialogContent({title});
        dialog.contentLayout.add_child(content);

        const entry = new St.Entry({
            width: 400,
            y_expand: true,
            x_expand: false,
        });
        entry.clutter_text.max_length = 1000;
        entry.clutter_text.activatable = false;
        entry.clutter_text.single_line_mode = false;
        entry.clutter_text.line_wrap = true;
        entry.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;

        ShellEntry.addContextMenu(entry);

        const layout = new St.BoxLayout({width: 400});
        layout.add_child(entry);

        const scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            width: 400,
            style_class: 'scroll-box',
        });
        scrollView.add_child(layout);

        const counter = new St.Label({
            text: `${entry.get_text().length}/${maxLenMulti}`,
        });

        entry.clutter_text.connect('text-changed', () => {
            counter.set_text(`${entry.get_text().length}/${maxLenMulti}`);
        });

        const box = new St.BoxLayout({width: 400, vertical: true});
        box.add_child(scrollView);
        box.add_child(counter);
        content.add_child(box);

        dialog.setInitialKeyFocus(entry);

        const efpath = new St.Entry({can_focus: false, text: filepath});
        const ependLoc = new St.Entry({can_focus: false, text: pendLoc});
        const eappend = new St.Entry({can_focus: false, text: append});
        const eprepend = new St.Entry({can_focus: false, text: prependStr});

        dialog.addButton({
            label: 'OK',
            action: () => this._doSaveSnippet(entry, filepath, pendLoc, append, prependStr, dialog),
        });
        dialog.addButton({
            label: 'Cancel',
            action: () => dialog.close(),
            key: Clutter.KEY_Escape,
        });
        dialog.addButton({
            label: 'Actions',
            action: () => {
                this._doWindow();
                dialog.close();
            },
        });
        dialog.open();

        this._settings.bind(
            'qt-multiline',
            entry.clutter_text,
            'single_line_mode',
            Gio.SettingsBindFlags.DEFAULT,
        );

        let maxLen = maxLenMulti;
        if (entry.clutter_text.single_line_mode) {
            maxLen = maxLenSingle;
            entry.clutter_text.connect('activate', () => {
                this._doSaveSnippet(entry, filepath, pendLoc, append, prependStr, dialog);
            });
        }
        entry.clutter_text.max_length = maxLen;

        this._settings.bind('qt-filepath', efpath, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('qt-pendlocation', ependLoc, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('qt-append', eappend, 'text', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('qt-prepend', eprepend, 'text', Gio.SettingsBindFlags.DEFAULT);

        counter.set_text(`${entry.get_text().length}/${maxLen}`);
    }

    _doWindow() {
        const modPath = this._extension.path + '/extension/modules/quickText';
        Util.spawn([modPath + '/actions.js', modPath]);
    }

    _fopen(path) {
        return new Promise((resolve, reject) => {
            const file = Gio.File.new_for_path(path);
            file.load_contents_async(null, (file_, res) => {
                try {
                    const contents = file_.load_contents_finish(res)[1];
                    const decoder = new TextDecoder('utf-8');
                    resolve(decoder.decode(contents));
                } catch (e) {
                    console.error(e);
                    reject(e);
                }
            });
        });
    }

    _save(path, dataStr) {
        GLib.file_set_contents(path, dataStr);
    }

    _wrap(str, eprependText, eappendText) {
        let prepend;
        if (eprependText === '') {
            prepend = new Date().toString();
        } else {
            prepend = eprependText;
        }
        const linebreak = this._settings?.get_boolean('qt-linebreak');
        const body = linebreak ? `${prepend}\n${str}` : `${prepend}${str}`;
        if (!this._settings?.get_boolean('qt-append-enabled'))
            return body;
        if (eappendText === '')
            return `${body}\n`;
        return `${body}\n${eappendText}`;
    }

    async _doSaveSnippet(entry, filepath, pendLoc, append, prependStr, dialog) {
        try {
            const fstr = await this._fopen(filepath);
            const snippet = entry.clutter_text.get_text();
            const wrapped = this._wrap(snippet, prependStr, append);
            let result;
            if (pendLoc === 'BEG') {
                result = `${wrapped}\n${fstr.trim()}`;
            } else {
                result = `${fstr.trim()}\n${wrapped}`;
            }
            this._save(filepath, result);
        } catch (error) {
            console.error(error);
        }
        dialog.close();
    }
}

export default QuickTextModule;
