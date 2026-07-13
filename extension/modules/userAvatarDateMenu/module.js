'use strict';

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const SETTINGS = ['uadm-show-realname', 'uadm-show-username'];

export class UserAvatarDateMenuModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._handlerIds = [];
        this._widget = null;
        this._containerBox = null;
    }

    enable(gsettings, extension) {
        try {
            this._settings = gsettings;
            this._extension = extension;

            this._loadStylesheet();

            const dateMenu = Main.panel.statusArea.dateMenu;
            if (!dateMenu) {
                console.warn('[UserAvatarDateMenu] No dateMenu found');
                return;
            }

            // Navigate to the _menuBox: menu.box → wrapper → _menuBox
            const wrapper = dateMenu.menu.box.get_first_child();
            if (!wrapper) {
                console.warn('[UserAvatarDateMenu] No wrapper found');
                return;
            }

            const menuContent = wrapper.get_first_child();
            if (!menuContent) {
                console.warn('[UserAvatarDateMenu] No menuContent found');
                return;
            }

            // The right column is the last child of _menuBox (contains calendar + events)
            this._containerBox = menuContent.get_last_child();

            this._buildWidget();
            this._injectWidget();

            this._handlerIds = SETTINGS.map(key =>
                this._settings.connect(`changed::${key}`, () => {
                    const gs = this._settings;
                    this.disable();
                    this.enable(gs, extension);
                })
            );
        } catch (e) {
            console.error('[UserAvatarDateMenu] enable error:', e);
        }
    }

    _buildWidget() {
        this._widget = new St.BoxLayout({
            vertical: true,
            style_class: 'uadm-user-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            visible: true,
        });

        const iconFile = this._getUserIcon();
        const avatar = new St.Widget({
            style_class: 'uadm-avatar',
            style: iconFile
                ? `background-image: url("${iconFile}"); background-size: cover;`
                : '',
        });

        if (!iconFile) {
            const fallback = new St.Icon({
                icon_name: 'avatar-default-symbolic',
                icon_size: 48,
                style_class: 'uadm-avatar-fallback',
            });
            avatar.set_child(fallback);
        }

        const nameBox = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'uadm-name-box',
        });

        if (this._settings.get_boolean('uadm-show-realname')) {
            const realName = new St.Label({
                text: GLib.get_real_name(),
                style_class: 'uadm-realname',
            });
            nameBox.add_child(realName);
        }

        if (this._settings.get_boolean('uadm-show-username')) {
            const userName = new St.Label({
                text: GLib.get_user_name(),
                style_class: 'uadm-username',
            });
            nameBox.add_child(userName);
        }

        this._widget.add_child(avatar);
        this._widget.add_child(nameBox);

        // Click to open user settings
        avatar.reactive = true;
        avatar.connect('button-press-event', () => {
            Util.spawn(['gnome-control-center', 'user-accounts']);
            Main.panel.closeCalendar();
            return Clutter.EVENT_STOP;
        });
    }

    _getUserIcon() {
        try {
            const manager = AccountsService.UserManager.get_default();
            const users = manager.list_users();
            const currentUser = users.find(u => u.user_name === GLib.get_user_name());
            if (currentUser && currentUser.icon_file)
                return currentUser.icon_file;
        } catch (e) {
            console.warn('[UserAvatarDateMenu] Failed to get user icon:', e);
        }
        return null;
    }

    _injectWidget() {
        if (!this._containerBox || !this._widget) return;

        // Insert at position 0 (above the calendar, in the right column)
        this._containerBox.insert_child_at_index(this._widget, 0);
    }

    _loadStylesheet() {
        if (!this._extension) return;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/userAvatarDateMenu/stylesheet.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    disable() {
        try {
            this._handlerIds.forEach(id => {
                if (this._settings) this._settings.disconnect(id);
            });
            this._handlerIds = [];

            if (this._widget) {
                if (this._widget.get_parent())
                    this._widget.get_parent().remove_child(this._widget);
                this._widget.destroy();
                this._widget = null;
            }
            this._containerBox = null;

            if (this._stylesheetFile) {
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
                this._stylesheetFile = null;
            }

            this._settings = null;
            this._extension = null;
        } catch (e) {
            console.error('[UserAvatarDateMenu] disable error:', e);
        }
    }
}
