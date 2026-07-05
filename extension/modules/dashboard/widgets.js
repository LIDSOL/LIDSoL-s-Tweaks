'use strict';

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

import { MprisService } from '../../utils/mprisService.js';

function _parseAlign(num) {
    switch (num) {
    case 1: return Clutter.ActorAlign.START;
    case 2: return Clutter.ActorAlign.CENTER;
    case 3: return Clutter.ActorAlign.END;
    default: return Clutter.ActorAlign.FILL;
    }
}

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
        this._connect('y-align');
        this._connect('x-align');
        this._connect('y-expand');
        this._connect('x-expand');
        this._connect('width');
        this._connect('height');
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
        this.y_align = _parseAlign(this._settings.get_int(`dashboard-${this._module}-y-align`));
        this.x_align = _parseAlign(this._settings.get_int(`dashboard-${this._module}-x-align`));
        this.y_expand = this._settings.get_boolean(`dashboard-${this._module}-y-expand`);
        this.x_expand = this._settings.get_boolean(`dashboard-${this._module}-x-expand`);
        const width = this._settings.get_int(`dashboard-${this._module}-width`);
        const height = this._settings.get_int(`dashboard-${this._module}-height`);
        this.set_style(`
            ${width > 0 ? `width: ${width}px;` : ''}
            ${height > 0 ? `height: ${height}px;` : ''}
        `);
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
        this._sync();
    }

    _sync() {
        this.vertical = this._settings.get_boolean('dashboard-user-vertical');
        this._buildUI();
        super._sync();
    }

    _buildUI() {
        this.destroy_all_children();

        const roundness = this._settings.get_int('dashboard-user-icon-roundness');
        const iconWidth = this._settings.get_int('dashboard-user-icon-width');
        const iconHeight = this._settings.get_int('dashboard-user-icon-height');

        const userBtn = new St.Button({
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.END,
            y_align: this.vertical ? Clutter.ActorAlign.END : Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'user-icon-button button',
            style: `
                border-radius: ${roundness}px;
                width: ${iconWidth}px;
                height: ${iconHeight}px;
            `,
        });

        const avatarIcon = new St.Icon({
            icon_name: 'avatar-default-symbolic',
            icon_size: Math.round(iconWidth * 0.7),
            style_class: 'avatar-icon',
        });
        userBtn.set_child(avatarIcon);

        userBtn.connect('clicked', () => {
            if (this._parentDialog) this._parentDialog.close();
            Shell.AppSystem.get_default().lookup_app('gnome-user-accounts-panel.desktop').activate();
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            style_class: 'text-box',
            y_align: this.vertical ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER,
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });

        if (this._settings.get_boolean('dashboard-user-real-name')) {
            const nameLabel = new St.Label({
                style_class: 'user-name',
                y_align: Clutter.ActorAlign.END,
                x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
                text: GLib.get_real_name(),
            });
            textBox.add_child(nameLabel);
        }

        const greetingLabel = new St.Label({
            style_class: 'greetings',
            y_align: Clutter.ActorAlign.START,
            x_align: this.vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            text: _getGreeting(),
        });
        textBox.add_child(greetingLabel);

        this.add_child(userBtn);
        this.add_child(textBox);
    }
});

function _getGreeting() {
    const hour = GLib.DateTime.new_now_local().get_hour();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
}

export var LevelsWidget = GObject.registerClass(
class LevelsWidget extends DashWidget {
    _init(settings, parentDialog) {
        super._init(settings, 'levels', parentDialog);
        this._connect('vertical');
        this._sync();
    }

    _sync() {
        this.vertical = this._settings.get_boolean('dashboard-levels-vertical');
        this._buildUI();
        super._sync();
    }

    _buildUI() {
        this.destroy_all_children();
        this._levels = new LevelsBox(this._settings);
        this.add_child(this._levels);
    }
});

const LevelsBox = GObject.registerClass(
class LevelsBox extends St.BoxLayout {
    _init(settings) {
        super._init({
            vertical: true,
            style_class: 'levels-box',
            x_expand: true,
            y_expand: true,
        });
        this._settings = settings;
        this._levels = {};
        this._updateLevels();
    }

    _updateLevels() {
        this.destroy_all_children();
        const showBattery = this._settings.get_boolean('dashboard-levels-show-battery');
        const showStorage = this._settings.get_boolean('dashboard-levels-show-storage');
        const showCpu = this._settings.get_boolean('dashboard-levels-show-cpu');
        const showRam = this._settings.get_boolean('dashboard-levels-show-ram');
        const showTemp = this._settings.get_boolean('dashboard-levels-show-temp');

        if (showBattery) this.add_child(this._createLevel('battery-symbolic', 'Battery', 0.75));
        if (showStorage) this.add_child(this._createLevel('drive-harddisk-symbolic', 'Storage', 0.5));
        if (showCpu) this.add_child(this._createLevel('cpu-symbolic', 'CPU', 0.3));
        if (showRam) this.add_child(this._createLevel('memory-symbolic', 'RAM', 0.6));
        if (showTemp) this.add_child(this._createLevel('weather-clear-night-symbolic', 'Temperature', 0.4));
    }

    _createLevel(icon, label, value) {
        const box = new St.BoxLayout({
            style_class: 'level-item',
            x_expand: true,
        });
        const iconActor = new St.Icon({
            icon_name: icon,
            icon_size: 16,
            style_class: 'level-icon',
        });
        box.add_child(iconActor);

        const levelBar = new St.DrawingArea({
            style_class: 'level-bar',
            x_expand: true,
            height: 8,
        });
        levelBar.connect('repaint', () => {
            const cr = levelBar.get_context();
            const [w, h] = levelBar.get_surface_size();
            cr.setSourceRGBA(0.5, 0.5, 0.5, 0.3);
            cr.rectangle(0, 0, w, h);
            cr.fill();
            cr.setSourceRGBA(0.3, 0.6, 1.0, 0.8);
            cr.rectangle(0, 0, w * value, h);
            cr.fill();
        });
        box.add_child(levelBar);

        const labelActor = new St.Label({
            text: label,
            style_class: 'level-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(labelActor);
        return box;
    }
});

const MediaBoxImpl = GObject.registerClass(
class MediaBoxImpl extends St.BoxLayout {
    _init(settings) {
        super._init({
            vertical: true,
            x_expand: true,
            y_expand: true,
        });
        this._settings = settings;
        this._mpris = null;
        this._player = null;
        this._controlsBox = null;

        try {
            this._mpris = MprisService.getDefault();
        } catch (e) {
            console.error('[LIDSoL Dashboard] MprisService not available:', e);
        }

        if (this._mpris) {
            this._mpris.connectObject('player-added', (_mpris, player) => {
                if (!this._player) {
                    this._player = player;
                    this._sync();
                }
            }, this);
            this._mpris.connectObject('player-removed', (_mpris, player) => {
                if (this._player === player) {
                    if (this._mpris.players.length > 0) {
                        this._player = this._mpris.players[0];
                    } else {
                        this._player = null;
                    }
                    this._sync();
                }
            }, this);

            this.connect('destroy', () => {
                if (this._mpris) this._mpris.disconnectObject(this);
            });
        } else {
            this.connect('destroy', () => {});
        }
        this._sync();
    }

    _sync() {
        this.destroy_all_children();
        if (!this._mpris || !this._player) {
            this._onNoPlayer();
            return;
        }
        this._buildPlayerUI();
    }

    _onNoPlayer() {
        this.add_child(new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            x_expand: true,
            text: 'Nothing Playing',
            style_class: 'dim-label',
        }));
    }

    _buildPlayerUI() {
        const coverSize = this._settings.get_int('dashboard-media-cover-width');
        const roundness = this._settings.get_int('dashboard-media-cover-roundness');

        const coverBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            style_class: 'media-cover-box',
        });

        const cover = new St.Bin({
            style_class: 'media-cover',
            style: `
                width: ${coverSize}px;
                height: ${coverSize}px;
                border-radius: ${roundness}px;
            `,
        });

        if (this._player.coverArt && this._player.coverArt !== '') {
            const coverIcon = new St.Icon({
                gicon: Gio.icon_new_for_string(this._player.coverArt),
                icon_size: coverSize,
            });
            cover.set_child(coverIcon);
        } else {
            cover.set_child(new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: coverSize,
                style_class: 'media-cover-fallback',
            }));
        }
        coverBox.add_child(cover);

        if (this._settings.get_boolean('dashboard-media-show-text')) {
            const textBox = new St.BoxLayout({
                vertical: true,
                style_class: 'media-text-box',
                x_expand: true,
            });
            const title = new St.Label({
                text: this._player.title || 'Unknown',
                style_class: 'media-title',
                x_align: Clutter.ActorAlign.CENTER,
            });
            const artist = new St.Label({
                text: this._player.artist || 'Unknown Artist',
                style_class: 'media-artist',
                x_align: Clutter.ActorAlign.CENTER,
            });
            textBox.add_child(title);
            textBox.add_child(artist);

            const controlsBox = new St.BoxLayout({
                style_class: 'media-controls',
                x_align: Clutter.ActorAlign.CENTER,
            });

            const prevBtn = this._controlBtn('media-skip-backward-symbolic', () => this._player?.prev());
            const playBtn = this._controlBtn(
                this._player.playbackStatus === 'Playing'
                    ? 'media-playback-pause-symbolic'
                    : 'media-playback-start-symbolic',
                () => {
                    if (this._player?.playbackStatus === 'Playing')
                        this._player?.pause();
                    else
                        this._player?.play();
                }
            );
            const nextBtn = this._controlBtn('media-skip-forward-symbolic', () => this._player?.next());

            controlsBox.add_child(prevBtn);
            controlsBox.add_child(playBtn);
            controlsBox.add_child(nextBtn);
            textBox.add_child(controlsBox);

            coverBox.add_child(textBox);
        }

        this.add_child(coverBox);
    }

    _controlBtn(icon, action) {
        const btn = new St.Button({
            style_class: 'media-control-button',
        });
        const ic = new St.Icon({
            icon_name: icon,
            icon_size: 16,
        });
        btn.set_child(ic);
        btn.connect('clicked', action);
        return btn;
    }
});

export var MediaWidget = GObject.registerClass(
class MediaWidget extends DashWidget {
    _init(settings) {
        super._init(settings, 'media');
        this._media = new MediaBoxImpl(settings);
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
        super._init(settings, 'settings', parentDialog);
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
        super._init(settings, 'system', parentDialog);
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
