'use strict';

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import Shell from 'gi://Shell';
import St from 'gi://St';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { PACKAGE_VERSION } from 'resource:///org/gnome/shell/misc/config.js';

import { DashboardMediaWidget } from './mediaWidget.js';
import {
    PowerLevel,
    StorageLevel,
    CpuLevel,
    RamLevel,
    TempLevel,
} from './systemMonitor.js';

function _getSettingKey(module, name) {
    return `dashboard-${module}-${name.replace(/_/g, '-')}`;
}

const DashWidget = GObject.registerClass(
class DashWidget extends St.BoxLayout {
    _init(settings, module, parentDialog = null, properties = {}) {
        super._init(properties);
        this._parentDialog = parentDialog;
        this._settings = settings;
        this._module = module;
        this._handlerIds = [];
        this._connect('background');
        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        this._handlerIds.forEach(id => {
            if (this._settings) this._settings.disconnect(id);
        });
        this._handlerIds = [];
        this._settings = null;
        this._parentDialog = null;
    }

    _connect(name) {
        const key = _getSettingKey(this._module, name);
        this._handlerIds.push(
            this._settings.connect(`changed::${key}`,
                () => this._sync()
            )
        );
    }

    _sync() {
        this._hasBackground = this._settings.get_boolean(`dashboard-${this._module}-background`);
        this.style_class = `container dash-widget ${this._module}-widget` +
            (this._hasBackground ? ' events-button' : '');
    }
});

const HoverButton = GObject.registerClass(
class HoverButton extends St.Button {
    _init(content, hoverText, callback = () => {}, styleClass = '') {
        super._init({
            child: content,
            style_class: styleClass,
            x_expand: true,
            y_expand: true,
            can_focus: true,
            track_hover: true,
        });
        this.connect('clicked', callback);
        this.connect('notify::hover', () => this._toggleHoverLabel());
        this._hoverLabel = new St.Label({
            style_class: 'dash-label',
            text: hoverText,
        });
        this.child.x_align = Clutter.ActorAlign.CENTER;
        this.child.y_align = Clutter.ActorAlign.CENTER;
    }

    _toggleHoverLabel() {
        if (!this.hover) {
            Main.layoutManager.removeChrome(this._hoverLabel);
            return;
        }

        Main.layoutManager.addTopChrome(this._hoverLabel);
        this._hoverLabel.opacity = 0;
        const [stageX, stageY] = this.get_transformed_position();
        const iconWidth = this.allocation.get_width();
        const labelWidth = this._hoverLabel.get_width();
        const xOffset = Math.floor((iconWidth - labelWidth) / 2);
        const x = Math.clamp(stageX + xOffset, 0, global.stage.width - labelWidth);
        const y = stageY - this._hoverLabel.height;
        this._hoverLabel.set_position(x, y);

        this._hoverLabel.ease({
            opacity: 255,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
});

export var UserWidget = GObject.registerClass(
class UserWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'user', parentDialog);
        this._connect('icon-roundness');
        this._connect('icon-width');
        this._connect('icon-height');
        this._connect('vertical');
        this._connect('real-name');
        this._connect('text-spacing');
        this._sync();
        this._scheduleGreetingUpdate(10000);
        this.reactive = true;
        this.connect('button-press-event', () => {
            if (this._parentDialog) this._parentDialog.close();
            Main.overview.hide();
            Main.panel.closeQuickSettings();
            if (this._userSettingsApp) {
                const windows = this._userSettingsApp.get_windows();
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
            return Clutter.EVENT_STOP;
        });
        this.connect('destroy', () => {
            this._user?.disconnectObject(this);
            if (this._greetingTimeout) {
                clearTimeout(this._greetingTimeout);
                this._greetingTimeout = 0;
            }
        });
    }

    _sync() {
        this.vertical = this._settings.get_boolean('dashboard-user-vertical');
        this._buildUI();
        this._hasBackground = this._settings.get_boolean('dashboard-user-background');
        this.style_class = `dash-widget user-widget` +
            (this._hasBackground ? ' events-button' : '');
        const fw = this._settings.get_int('dashboard-levels-fixed-width');
        if (fw > 0) this.style = `width: ${fw}px;`;
    }

    _buildUI() {
        this.destroy_all_children();

        this._user?.disconnectObject(this);
        this._user = null;
        this._nameLabel = null;
        this._greetingLabel = null;

        const roundness = this._settings.get_int('dashboard-user-icon-roundness');
        const iconWidth = this._settings.get_int('dashboard-user-icon-width');
        const iconHeight = this._settings.get_int('dashboard-user-icon-height');

        const userBtn = new St.Button({
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.END,
            y_align: this.vertical ? Clutter.ActorAlign.END : Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'user-icon-button button',
        });

        this._user = AccountsService.UserManager.get_default().get_user(GLib.get_user_name());
        this._loadAvatar(userBtn, roundness, iconWidth, iconHeight);
        this._user.connectObject(
            'changed', () => this._loadAvatar(userBtn, roundness, iconWidth, iconHeight),
            'notify::is-loaded', () => this._syncUserName(),
            this);

        const [major] = PACKAGE_VERSION.split('.').map(v => Number(v));
        this._userSettingsApp = Shell.AppSystem.get_default().lookup_app(
            major >= 46 ? 'gnome-users-panel.desktop' : 'gnome-user-accounts-panel.desktop');

        const textBox = new St.BoxLayout({
            vertical: true,
            style_class: 'text-box',
            y_align: this.vertical ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER,
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });

        if (this._settings.get_boolean('dashboard-user-real-name')) {
            this._nameLabel = new St.Label({
                style_class: 'user-name',
                y_align: Clutter.ActorAlign.END,
                x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
                text: this._user.get_real_name() || GLib.get_real_name(),
            });
            textBox.add_child(this._nameLabel);
        }

        this._greetingLabel = new St.Label({
            style_class: 'greetings',
            y_align: Clutter.ActorAlign.START,
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            text: _getGreeting(),
        });
        textBox.add_child(this._greetingLabel);

        this.add_child(userBtn);
        const textSpacing = this._settings.get_int('dashboard-user-text-spacing');
        if (textSpacing > 0) {
            const spacer = new St.BoxLayout({
                style: this.vertical
                    ? `min-height: ${textSpacing}px;`
                    : `min-width: ${textSpacing}px;`,
            });
            this.add_child(spacer);
        }
        this.add_child(textBox);
    }

    _scheduleGreetingUpdate(interval) {
        this._greetingTimeout = setTimeout(() => {
            if (this._greetingLabel)
                this._greetingLabel.text = _getGreeting();
            this._scheduleGreetingUpdate(interval);
        }, interval);
    }

    _syncUserName() {
        if (this._nameLabel) {
            this._nameLabel.text = this._user.get_real_name() || GLib.get_real_name();
        }
    }

    _loadAvatar(btn, roundness, iconWidth, iconHeight) {
        const iconFile = this._user.get_icon_file();

        btn.child = null;
        btn.style = `
            border-radius: ${roundness}px;
            width: ${iconWidth}px;
            height: ${iconHeight}px;
            padding: 0;
            border-width: 0;
            background-color: transparent;
        `;

        if (iconFile && GLib.file_test(iconFile, GLib.FileTest.EXISTS)) {
            btn.style += `
                background-image: url("${iconFile}");
                background-size: cover;
                background-position: center;
            `;
        } else {
            btn.child = new St.Icon({
                icon_name: 'avatar-default-symbolic',
                icon_size: Math.round(Math.min(iconWidth, iconHeight) * 0.7),
                x_expand: true,
                y_expand: true,
            });
        }
    }
});

function _getGreeting() {
    const hour = GLib.DateTime.new_now_local().get_hour();
    if (hour < 5) return 'Night Time';
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
}

export var LevelsWidget = GObject.registerClass(
class LevelsWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'levels', parentDialog);
        this._connect('vertical');
        this._connect('fixed-width');
        this._sync();
    }

    startTimeout() {
        if (this._levels)
            this._levels.startTimeout();
    }

    stopTimeout() {
        if (this._levels)
            this._levels.stopTimeout();
    }

    _sync() {
        this.vertical = this._settings.get_boolean('dashboard-levels-vertical');
        this._buildUI();
        super._sync();
        const fw = this._settings.get_int('dashboard-levels-fixed-width');
        this.style = fw > 0 ? `width: ${fw}px;` : '';
    }

    _buildUI() {
        this.destroy_all_children();
        this._levels = new LevelsBox(this._settings, this._parentDialog);
        this.add_child(this._levels);
    }

    _onDestroy() {
        this.stopTimeout();
        super._onDestroy();
    }
});

const LevelsBox = GObject.registerClass(
class LevelsBox extends St.BoxLayout {
    _init(settings, parentDialog = null) {
        super._init({
            vertical: true,
            style_class: 'levels-box',
            x_expand: true,
            y_expand: true,
            reactive: true,
            track_hover: true,
        });
        this._settings = settings;
        this._parentDialog = parentDialog;
        this.levels = [];
        this._handlerIds = [];

        this._connect('battery');
        this._connect('storage');
        this._connect('cpu');
        this._connect('ram');
        this._connect('temp');

        this._sync();
        this._timeout = null;

        this.connect('button-press-event', () => {
            if (this._parentDialog)
                this._parentDialog.close();
            const cmd = this._settings.get_string('dashboard-levels-command');
            if (cmd)
                Util.spawnCommandLine(cmd);
            return Clutter.EVENT_STOP;
        });

        this.connect('destroy', () => {
            this.stopTimeout();
            this._handlerIds.forEach(id => {
                if (this._settings) this._settings.disconnect(id);
            });
            this._handlerIds = [];
            this._settings = null;
        });
    }

    _connect(name) {
        this._handlerIds.push(
            this._settings.connect(`changed::dashboard-levels-show-${name}`,
                () => this._sync())
        );
    }

    _sync() {
        this.destroy_all_children();
        this.levels = [];

        const vertical = this._settings.get_boolean('dashboard-levels-vertical');
        const showBattery = this._settings.get_boolean('dashboard-levels-show-battery');
        const showStorage = this._settings.get_boolean('dashboard-levels-show-storage');
        const showCpu = this._settings.get_boolean('dashboard-levels-show-cpu');
        const showRam = this._settings.get_boolean('dashboard-levels-show-ram');
        const showTemp = this._settings.get_boolean('dashboard-levels-show-temp');

        if (showBattery) this._addLevel(new PowerLevel(vertical));
        if (showStorage) this._addLevel(new StorageLevel(vertical));
        if (showCpu) this._addLevel(new CpuLevel(vertical));
        if (showRam) this._addLevel(new RamLevel(vertical));
        if (showTemp) this._addLevel(new TempLevel(vertical));
    }

    _addLevel(level) {
        this.add_child(level);
        this.levels.push(level);
    }

    startTimeout() {
        if (this._timeout) return;
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1,
            () => {
                this.levels.forEach(l => l.updateLevel());
                return GLib.SOURCE_CONTINUE;
            });
    }

    stopTimeout() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    }
});

export var MediaWidget = GObject.registerClass(
class MediaWidget extends DashWidget {
    _init(settings) {
        super._init(settings, 'media');
        this._media = new DashboardMediaWidget(settings);
        this.add_child(this._media);
        this._sync();
    }

    _sync() {
        super._sync();
    }
});

export var LinksWidget = GObject.registerClass(
class LinksWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'links', parentDialog);
        this._connect('names');
        this._connect('urls');
        this._connect('icon-size');
        this._connect('vertical');
        this._sync();
    }

    _sync() {
        super._sync();
        this.vertical = this._settings.get_boolean('dashboard-links-vertical');
        this.remove_all_children();

        const names = this._settings.get_strv('dashboard-links-names');
        const urls = this._settings.get_strv('dashboard-links-urls');

        for (let i = 0; i < urls.length; i++)
            this.add_child(this._button(names[i] || 'weblink', urls[i]));
    }

    _button(name, link) {
        return new HoverButton(
            new St.Icon({
                icon_name: 'web-browser-symbolic',
                icon_size: this._settings.get_int('dashboard-links-icon-size'),
            }),
            link,
            () => {
                Util.spawnCommandLine(`xdg-open ${link}`);
                if (this._parentDialog) this._parentDialog.close();
            },
            this._hasBackground ? 'message-media-control' : 'events-button'
        );
    }
});

export var ClockWidget = GObject.registerClass(
class ClockWidget extends DashWidget {
    _init(settings) {
        super._init(settings, 'clock');
        this._connect('vertical');
        this._sync();

        this.clock = this._label('clock');
        this.date = this._label('date');
        this.day = this._label('day');

        const vbox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            x_expand: true,
        });
        vbox.add_child(this.day);
        vbox.add_child(this.date);
        this.add_child(this.clock);
        this.add_child(vbox);

        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._updateClock();
            return GLib.SOURCE_CONTINUE;
        });
        this.connect('destroy', () => {
            if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
            }
        });

        this._updateClock();
    }

    _updateClock() {
        const now = GLib.DateTime.new_now_local();
        this.clock.text = now.format('%H:%M');
        this.date.text = now.format('%Y. %m. %d.');
        this.day.text = now.format('%A');
    }

    _sync() {
        this.vertical = this._settings.get_boolean('dashboard-clock-vertical');
        super._sync();
    }

    _label(name) {
        return new St.Label({
            style_class: name,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
    }
});

const AppBtn = GObject.registerClass(
class AppBtn extends Dash.DashIcon {
    _init(app, parentDialog, settings, pos) {
        super._init(app);

        this.x_align = Clutter.ActorAlign.CENTER;
        this.y_align = Clutter.ActorAlign.CENTER;
        this.x_expand = true;
        this.y_expand = true;
        this.app = app;
        this.pos = pos;
        this.settings = settings;

        this.connect('clicked', () => {
            if (parentDialog) parentDialog.close();
        });
        this._changeIconSize();
        this.settings.connectObject('changed::dashboard-apps-icon-size',
            this._changeIconSize.bind(this), this);
        this.connect('destroy', () => this.settings.disconnectObject(this));
    }

    _changeIconSize() {
        this.icon.setIconSize(this.settings.get_int('dashboard-apps-icon-size'));
    }

    acceptDrop(source) {
        AppFavorites.getAppFavorites().moveFavoriteToPos(
            source.app.get_id(),
            this.pos
        );
    }
});

export var AppsWidget = GObject.registerClass(
class AppsWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'apps', parentDialog);
        this.vertical = true;
        this._connect('rows');
        this._connect('cols');
        AppFavorites.getAppFavorites().connectObject('changed', this._sync.bind(this), this);
        this._sync();
    }

    _onDestroy() {
        super._onDestroy();
        AppFavorites.getAppFavorites().disconnectObject(this);
    }

    _sync() {
        this.remove_all_children();
        this._buildUI();
        super._sync();
    }

    _buildUI() {
        const rows = this._settings.get_int('dashboard-apps-rows');
        const cols = this._settings.get_int('dashboard-apps-cols');

        this.rows = [];
        const favs = AppFavorites.getAppFavorites().getFavorites();
        for (let i = 0; i < rows; i++) {
            const row = new St.BoxLayout({
                style_class: 'container',
                y_expand: true,
                x_expand: true,
            });
            this.rows.push(row);
            this.add_child(row);
        }
        let k = 0;
        for (let i = 0; i < favs.length; i++) {
            if (i !== 0 && i % cols === 0)
                k++;
            if (this.rows[k])
                this.rows[k].add_child(new AppBtn(favs[i], this._parentDialog, this._settings, i));
        }
    }
});

export var SettingsWidget = GObject.registerClass(
class SettingsWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'settings', parentDialog, {x_expand: true});
        this._connect('icon-size');
        this._connect('vertical');
        this._sync();
    }

    _sync() {
        super._sync();

        this.vertical = this._settings.get_boolean('dashboard-settings-vertical');
        const iconSize = this._settings.get_int('dashboard-settings-icon-size');

        this.destroy_all_children();
        [
            this._button('network-wireless-signal-good-symbolic', 'gnome-wifi-panel', iconSize, 'WiFi'),
            this._button('bluetooth-active-symbolic', 'gnome-bluetooth-panel', iconSize, 'Bluetooth'),
            this._button('org.gnome.Settings-symbolic', 'org.gnome.Settings', iconSize, 'Settings'),
        ]
        .forEach(btn => this.add_child(btn));
    }

    _button(icon, panel, iconSize, label) {
        return new HoverButton(
            new St.Icon({
                icon_name: icon,
                icon_size: iconSize,
            }),
            label,
            () => {
                Shell.AppSystem.get_default().lookup_app(`${panel}.desktop`).activate();
                if (this._parentDialog) this._parentDialog.close();
            },
            this._hasBackground ? 'message-media-control' : 'events-button'
        );
    }
});

export var SystemWidget = GObject.registerClass(
class SystemWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'system', parentDialog, {x_expand: true});
        this._connect('icon-size');
        this._connect('layout');
        this._sync();
    }

    _sync() {
        super._sync();

        const iconSize = this._settings.get_int('dashboard-system-icon-size');
        const layout = this._settings.get_int('dashboard-system-layout');

        this.destroy_all_children();
        const btns = [
            this._button('system-shutdown-symbolic', 'power-off', iconSize, 'Power Off'),
            this._button('system-reboot-symbolic', 'restart', iconSize, 'Reboot'),
            this._button('system-log-out-symbolic', 'logout', iconSize, 'Log Out'),
            this._button('weather-clear-night-symbolic', 'suspend', iconSize, 'Suspend'),
        ];
        switch (layout) {
        case 2: {
            this.vertical = false;
            const col = () => {
                return new St.BoxLayout({
                    style_class: 'container',
                    vertical: true,
                    x_expand: true,
                    y_expand: true,
                });
            };
            const col1 = col();
            const col2 = col();
            col1.add_child(btns[2]);
            col1.add_child(btns[1]);
            col2.add_child(btns[0]);
            col2.add_child(btns[3]);
            this.add_child(col1);
            this.add_child(col2);
            break;
        }
        case 1:
            this.vertical = true;
            btns.forEach(btn => this.add_child(btn));
            break;

        default:
            this.vertical = false;
            btns.reverse().forEach(btn => this.add_child(btn));
            break;
        }
    }

    _button(icon, action, iconSize, label) {
        return new HoverButton(
            new St.Icon({
                icon_name: icon,
                icon_size: iconSize,
            }),
            label,
            () => {
                SystemActions.getDefault().activateAction(action);
                if (this._parentDialog) this._parentDialog.close();
            },
            this._hasBackground ? 'message-media-control' : 'events-button'
        );
    }
});
