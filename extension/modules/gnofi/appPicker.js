'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

const GRID_COLUMNS = 4;
const BUTTON_SIZE = 64;
const ICON_SIZE = 48;

export var AppPicker = GObject.registerClass(
class AppPicker extends St.Widget {
    _init() {
        super._init({
            layout_manager: new Clutter.GridLayout(),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this._apps = [];
        this._filteredApps = [];
        this._buttons = new Map();
        this._loadApps();
    }

    _loadApps() {
        const appSystem = Shell.AppSystem.get_default();
        const installed = appSystem.get_installed();
        this._apps = [];
        for (const app of installed) {
            const name = app.get_name();
            if (!name)
                continue;
            try {
                if (app.get_nodisplay())
                    continue;
            } catch (_e) {
                // fallback: check via DesktopAppInfo
                const info = app.get_app_info?.();
                if (info && info.get_nodisplay())
                    continue;
            }
            this._apps.push(app);
        }
        this._apps.sort((a, b) => a.get_name().localeCompare(b.get_name()));
        this._filteredApps = [...this._apps];
    }

    filter(text) {
        const lower = text.toLowerCase();
        this._filteredApps = lower
            ? this._apps.filter(app => {
                const name = app.get_name().toLowerCase();
                let generic = '';
                try {
                    const info = app.get_app_info?.();
                    if (info)
                        generic = (info.get_generic_name() || '').toLowerCase();
                } catch (_e) { /* ignore */ }
                return name.includes(lower) || generic.includes(lower);
            })
            : [...this._apps];
        this._layout();
    }

    _layout() {
        this.destroy_all_children();
        this._buttons.clear();

        const cols = GRID_COLUMNS;
        const layout = this.get_layout_manager();

        this._filteredApps.forEach((app, i) => {
            const btn = this._makeButton(app);
            const row = Math.floor(i / cols);
            const col = i % cols;
            layout.attach(btn, col, row, 1, 1);
            this._buttons.set(app.get_id(), btn);
        });
    }

    _makeButton(app) {
        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'gnofi-app-button',
            reactive: true,
            track_hover: true,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE + 24,
        });

        const icon = new St.Icon({
            gicon: app.get_icon(),
            icon_size: ICON_SIZE,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'gnofi-app-icon',
        });
        box.add_child(icon);

        const label = new St.Label({
            text: app.get_name(),
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'gnofi-app-label',
        });
        label.clutterText.ellipsize = 3;
        label.clutterText.line_wrap = false;
        box.add_child(label);

        box.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 1) {
                app.activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        box.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Return ||
                event.get_key_symbol() === Clutter.KEY_KP_Enter) {
                app.activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        return box;
    }

    getFirst() {
        return this._filteredApps[0] || null;
    }

    getCount() {
        return this._filteredApps.length;
    }
});
