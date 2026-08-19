import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Settings } from './settings.js';
import { Workspaces } from './workspaces.js';

export class KeyBindings {
    static _instance = null;

    static init() {
        KeyBindings._instance = new KeyBindings();
        KeyBindings._instance._init();
    }

    static destroy() {
        KeyBindings._instance?._destroy();
        KeyBindings._instance = null;
    }

    static getInstance() {
        return KeyBindings._instance;
    }

    _init() {
        this._settings = Settings.getInstance();
        this._ws = Workspaces.getInstance();
        this._desktopKeybindings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.keybindings' });
        this._systemBindingSettings = [
            this._desktopKeybindings,
            new Gio.Settings({ schema: 'org.gnome.shell.keybindings' }),
            new Gio.Settings({ schema: 'org.gnome.settings-daemon.plugins.media-keys' }),
        ];
        this._addedKeyBindings = [];
        this._replacedSystemBindings = {};
        this._savedSystemKeyBindings = {};

        this._registerActivateByNumber();
        this._registerMoveToByNumber();
        this._addExtensionKeyBindings();
    }

    _destroy() {
        for (const name of this._addedKeyBindings)
            Main.wm.removeKeybinding(name);
        this._addedKeyBindings = [];
        for (const shortcutName in this._replacedSystemBindings)
            this._restoreSystemBinding(shortcutName);
        for (const key in this._savedSystemKeyBindings) {
            const saved = this._savedSystemKeyBindings[key];
            const s = new Gio.Settings({ schema_id: saved.schema });
            s.set_strv(saved.key, saved.value);
        }
        this._savedSystemKeyBindings = {};
    }

    addKeyBinding(name, handler) {
        Main.wm.addKeybinding(
            name,
            this._settings._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            handler,
        );
        this._addedKeyBindings.push(name);
    }

    removeKeybinding(name) {
        const index = this._addedKeyBindings.indexOf(name);
        if (index >= 0) {
            Main.wm.removeKeybinding(name);
            this._addedKeyBindings.splice(index, 1);
        }
    }

    _addExtensionKeyBindings() {
        this._replaceConflictingSystemBinding('ws-move-workspace-left');
        this.addKeyBinding('ws-move-workspace-left', () => this._ws.moveCurrentWorkspace(-1));
        this._replaceConflictingSystemBinding('ws-move-workspace-right');
        this.addKeyBinding('ws-move-workspace-right', () => this._ws.moveCurrentWorkspace(1));
        this.addKeyBinding('ws-activate-previous-key', () => this._ws.activatePrevious());
        this.addKeyBinding('ws-activate-empty-key', () => this._ws.activateEmptyOrAdd());
    }

    _registerActivateByNumber() {
        this._settings.enableActivateWorkspaceShortcuts.subscribe((value) => {
            for (let i = 0; i < 10; i++) {
                const name = `ws-activate-${i + 1}-key`;
                if (value) {
                    this._replaceConflictingSystemBinding(name);
                    this.addKeyBinding(name, () => this._ws.switchTo(i, 'keyboard-shortcut'));
                } else {
                    this.removeKeybinding(name);
                    this._restoreSystemBinding(name);
                }
            }
        }, { emitCurrentValue: true });
    }

    _registerMoveToByNumber() {
        this._settings.enableMoveToWorkspaceShortcuts.subscribe((value) => {
            for (let i = 0; i < 10; i++) {
                const name = `move-to-workspace-${i + 1}`;
                if (value) {
                    this._saveAndOverwriteSystemBinding(this._desktopKeybindings, name);
                } else {
                    this._restoreSystemKeyBinding(this._desktopKeybindings, name);
                }
            }
        }, { emitCurrentValue: true });
    }

    _replaceConflictingSystemBinding(shortcutName) {
        const binding = this._settings._settings.get_strv(shortcutName)[0];
        if (!binding)
            return null;
        for (const settings of this._systemBindingSettings) {
            for (const key of settings.list_keys()) {
                const variant = settings.get_value(key);
                if (variant.get_type_string() === 'as') {
                    const value = variant.get_strv();
                    if (value.includes(binding)) {
                        this._replacedSystemBindings[shortcutName] = {
                            schema: settings.schema_id,
                            key,
                            value,
                            default: settings.get_user_value(key) == null,
                        };
                        settings.set_strv(key, value.filter((v) => v !== binding));
                        return;
                    }
                }
            }
        }
    }

    _restoreSystemBinding(shortcutName) {
        if (this._replacedSystemBindings[shortcutName]) {
            const r = this._replacedSystemBindings[shortcutName];
            const settings = new Gio.Settings({ schema_id: r.schema });
            if (r.default)
                settings.reset(r.key);
            else
                settings.set_strv(r.key, r.value);
            delete this._replacedSystemBindings[shortcutName];
        }
    }

    _saveAndOverwriteSystemBinding(settings, key) {
        const current = settings.get_strv(key);
        if (current.length === 0)
            return;
        if (!(key in this._savedSystemKeyBindings))
            this._savedSystemKeyBindings[key] = {
                schema: settings.schema_id,
                key,
                value: current,
            };
        settings.set_strv(key, []);
    }

    _restoreSystemKeyBinding(settings, key) {
        if (key in this._savedSystemKeyBindings) {
            settings.set_strv(key, this._savedSystemKeyBindings[key].value);
            delete this._savedSystemKeyBindings[key];
        }
    }
}
