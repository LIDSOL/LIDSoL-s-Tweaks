'use strict';

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { Avatar } from 'resource:///org/gnome/shell/ui/userWidget.js';
import { QuickSettingsItem, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { PACKAGE_VERSION } from 'resource:///org/gnome/shell/misc/config.js';

const QuickSettingsMenu = Main.panel.statusArea.quickSettings;
const [major] = PACKAGE_VERSION.split('.').map(v => Number(v));

const SETTINGS = [
    'ua-mode',
    'ua-position',
    'ua-size',
    'ua-realname',
    'ua-username',
    'ua-hostname',
    'ua-nobackground',
];

const AvatarItem = GObject.registerClass(
    class AvatarItem extends QuickSettingsItem {
        _init(settings) {
            super._init({
                style_class: 'icon-button avatar-button',
                canFocus: true,
                hasMenu: false,
            });

            if (settings.avatarNoBackground)
                this.add_style_class_name('no-bg');

            this._user = AccountsService.UserManager.get_default().get_user(GLib.get_user_name());

            this._container = new St.BoxLayout({
                style_class: 'avatar-name-box',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
                vertical: false,
            });

            this.set_y_align(Clutter.ActorAlign.CENTER);
            this.set_child(this._container);

            const iconSize = settings.avatarSize % 2 === 0 ? settings.avatarSize + 1 : settings.avatarSize;
            this._avatarPicture = new Avatar(this._user, {
                iconSize,
                styleClass: 'avatar-picture',
            });
            this._avatarPicture.style = `icon-size: ${iconSize}px;`;

            const { avatarRealname, avatarUsername, avatarHostname } = settings;
            const isOnRight = settings.avatarPosition === 0;

            this._realNameLabel = new St.Label({
                style_class: 'avatar-realname-label',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: isOnRight ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
                text: this._user.get_real_name() || GLib.get_real_name(),
            });

            this._userNameLabel = new St.Label({
                style_class: 'avatar-username-label',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: isOnRight ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
                text: (avatarUsername ? GLib.get_user_name() : '') + (avatarHostname ? `@${GLib.get_host_name()}` : ''),
            });

            const labelsContainer = new St.BoxLayout({
                style_class: 'avatar-labels-box',
                y_align: Clutter.ActorAlign.CENTER,
                vertical: true,
            });

            if (avatarRealname) {
                labelsContainer.add_child(this._realNameLabel);
                this._userNameLabel.add_style_class_name('with-real-name');
            }

            if (avatarUsername || avatarHostname)
                labelsContainer.add_child(this._userNameLabel);

            if (isOnRight) {
                this._container.add_child(labelsContainer);
                this._container.add_child(this._avatarPicture);
            } else {
                this._container.add_child(this._avatarPicture);
                this._container.add_child(labelsContainer);
            }

            this._bindModeActions();
            this._user.connectObject('changed', this._updateAvatar.bind(this), this);
        }

        _updateAvatar() {
            this._avatarPicture.update();
            this._realNameLabel.text = this._user.get_real_name();
        }

        _bindModeActions() {
            let userSettings = 'gnome-user-accounts-panel.desktop';
            if (major >= 46)
                userSettings = 'gnome-users-panel.desktop';

            this._settingsApp = Shell.AppSystem.get_default().lookup_app(userSettings);

            if (!this._settingsApp)
                log('[UserAvatar] Missing users settings core component, expect trouble…');

            this.accessible_name = this._settingsApp?.get_name() ?? null;

            // St.Button "clicked" is gesture-based in GNOME 50 and ignores
            // tap/synthetic events, so handle press/release directly too.
            this._clickedFired = false;
            this.connect('button-press-event', () => {
                this._clickedFired = false;
                return Clutter.EVENT_STOP;
            });
            this.connect('button-release-event', () => {
                if (!this._clickedFired)
                    this._openSettings();
                return Clutter.EVENT_STOP;
            });
            this.connect('clicked', () => {
                this._clickedFired = true;
                this._openSettings();
            });
        }

        _openSettings() {
            Main.overview.hide();
            Main.panel.closeQuickSettings();
            if (this._settingsApp) {
                const windows = this._settingsApp.get_windows();
                if (windows.length > 0) {
                    const win = windows[0];
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                        win.activate(0);
                        return GLib.SOURCE_REMOVE;
                    });
                } else {
                    Util.spawn(['gnome-control-center', 'system', 'users']);
                }
            }
        }
    }
);

const Indicator = GObject.registerClass(
    class Indicator extends SystemIndicator {
        _init(settings) {
            super._init();
            this._settings = settings;
            this._load();
        }

        _load() {
            this._avatarItem = new AvatarItem(this._settings);

            this._systemItemsBox = QuickSettingsMenu._system._systemItem.child;

            if (this._systemItemsBox)
                this._addAvatar();

            this.connect('destroy', () => {
                this._avatarItem.destroy();
            });
        }

        _addAvatar() {
            const tmpSystemItems = [];
            this._systemItemsBox.get_children().forEach(item => {
                tmpSystemItems.push({ item, isVisible: item.visible, yAlign: item.get_y_align() });
            });

            this._systemItemsBox.remove_all_children();
            if (this._settings.avatarPosition === 0) {
                this._addSystemItems(tmpSystemItems);
                this._systemItemsBox.add_child(this._avatarItem);
            } else {
                this._systemItemsBox.add_child(this._avatarItem);
                this._addSystemItems(tmpSystemItems);
            }
        }

        _addSystemItems(items) {
            items.forEach(({ item, isVisible }) => {
                item.visible = isVisible;
                item.set_y_align(Clutter.ActorAlign.CENTER);
                if (item.constructor?.name === 'PowerToggle')
                    item.set_style('height: 41px;');
                this._systemItemsBox.add_child(item);
            });
        }
    }
);

export class UserAvatarModule {
    constructor() {
        this._indicator = null;
        this._handlerIds = [];
        this._sourceId = null;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._loadStylesheet();

        this._handlerIds = SETTINGS.map(setting =>
            this._settings.connect(`changed::${setting}`, () => {
                const gs = this._settings;
                this.disable();
                this.enable(gs, extension);
            })
        );

        if (QuickSettingsMenu._system) {
            this._indicator = new Indicator(this._mapSettings());
        } else {
            this._sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (!QuickSettingsMenu._system)
                    return GLib.SOURCE_CONTINUE;
                this._indicator = new Indicator(this._mapSettings());
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _loadStylesheet() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stylesheetFile = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/userAvatar/stylesheet.css'
        );
        themeContext.get_theme().load_stylesheet(this._stylesheetFile);
    }

    disable() {
        this._handlerIds.forEach(handler => this._settings.disconnect(handler));
        this._handlerIds = [];

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = null;
        }

        this._unloadStylesheet();
        this._extension = null;
        this._settings = null;
    }

    _unloadStylesheet() {
        if (this._stylesheetFile) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }
    }

    _mapSettings() {
        return {
            avatarMode: this._settings.get_int('ua-mode'),
            avatarPosition: this._settings.get_int('ua-position'),
            avatarSize: this._settings.get_int('ua-size'),
            avatarRealname: this._settings.get_boolean('ua-realname'),
            avatarUsername: this._settings.get_boolean('ua-username'),
            avatarHostname: this._settings.get_boolean('ua-hostname'),
            avatarNoBackground: this._settings.get_boolean('ua-nobackground'),
        };
    }
}
