'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { MonitorConstraint } from 'resource:///org/gnome/shell/ui/layout.js';
import { AppPicker } from './appPicker.js';

const ANIMATION_TIME = 100;

export var GnofiWindow = GObject.registerClass(
class GnofiWindow extends St.Widget {
    _init(settings) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            visible: false,
            reactive: true,
            x_expand: true,
            y_expand: true,
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
        });

        this._settings = settings;
        this._isOpen = false;
        this._opening = false;
        this._grab = null;
        this._searchTimeoutId = 0;
        this._commandLeader = this._settings.get_string('gnofi-command-leader');

        this._buildUI();
        this._loadApps();

        Main.layoutManager.modalDialogGroup.add_child(this);

        this._monitorConstraint = new MonitorConstraint({
            index: global.display.get_current_monitor(),
        });
        this.add_constraint(this._monitorConstraint);

        const stageConstraint = new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        });
        this.add_constraint(stageConstraint);
    }

    _buildUI() {
        const width = this._settings.get_int('gnofi-window-width');
        const marginTop = this._settings.get_int('gnofi-window-margin-top');

        this._backdrop = new St.Widget({
            x_expand: true,
            y_expand: true,
            reactive: true,
            style: 'background-color: rgba(0, 0, 0, 0.3);',
        });
        this._backdrop.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });
        this.add_child(this._backdrop);

        this._content = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
            style: `margin-top: ${marginTop}px; padding: 0 24px;`,
        });
        this.add_child(this._content);

        this._entryBox = new St.BoxLayout({
            style_class: 'gnofi-entry-box popup-menu-content',
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            width,
        });
        this._content.add_child(this._entryBox);

        this._entryIcon = new St.Icon({
            icon_name: 'edit-find-symbolic',
            style_class: 'gnofi-entry-icon',
        });
        this._entryBox.add_child(this._entryIcon);

        this._entry = new St.Entry({
            style_class: 'gnofi-entry',
            x_expand: true,
            can_focus: true,
            hint_text: 'Type to search\u2026',
        });
        this._entry.set_can_focus(true);
        this._entryBox.add_child(this._entry);

        this._clearBtn = new St.Button({
            style_class: 'gnofi-clear-button popup-menu-item',
            child: new St.Icon({ icon_name: 'edit-clear-symbolic', style_class: 'gnofi-clear-icon' }),
            reactive: true,
            visible: false,
        });
        this._clearBtn.connect('clicked', () => {
            this._entry.set_text('');
            this._entry.grab_key_focus();
        });
        this._entryBox.add_child(this._clearBtn);

        this._settingsBtn = new St.Button({
            style_class: 'gnofi-clear-button popup-menu-item',
            child: new St.Icon({ icon_name: 'emblem-system-symbolic', style_class: 'gnofi-clear-icon' }),
            reactive: true,
        });
        this._settingsBtn.connect('clicked', () => {
            this._extension.openPreferences();
            this.close();
        });
        this._entryBox.add_child(this._settingsBtn);

        this._entry.clutter_text.connect('text-changed', () => {
            const text = this._entry.get_text();
            this._clearBtn.visible = text.length > 0;
            this._scheduleSearch(text);
            this._updateIcon(text);
        });

        this._resultsScroll = new St.ScrollView({
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
            style_class: 'gnofi-results-scroll',
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            hscrollbar_policy: St.PolicyType.NEVER,
        });
        this._resultsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'gnofi-results-box popup-menu-content',
        });
        this._resultsScroll.add_child(this._resultsBox);
        this._content.add_child(this._resultsScroll);

        this._noMatchLabel = new St.Label({
            text: 'No match found',
            style_class: 'gnofi-no-match-label',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._content.add_child(this._noMatchLabel);

        this.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_Up) {
                this._scrollResults(symbol === Clutter.KEY_Down ? 1 : -1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    setExtension(ext) {
        this._extension = ext;
    }

    _loadApps() {
        this._appPicker = new AppPicker();
        this._appPicker.filter('');
        this._showApps();
    }

    _updateIcon(text) {
        if (text.startsWith(this._commandLeader)) {
            this._entryIcon.icon_name = 'system-run-symbolic';
        } else {
            this._entryIcon.icon_name = 'edit-find-symbolic';
        }
    }

    _showApps() {
        if (this._appPicker.get_parent())
            this._appPicker.get_parent().remove_child(this._appPicker);
        this._resultsBox.destroy_all_children();
        this._noMatchLabel.visible = false;

        const count = this._appPicker.getCount();
        if (count === 0) {
            this._noMatchLabel.visible = true;
            this._resultsScroll.visible = false;
        } else {
            this._resultsScroll.visible = true;
            this._resultsBox.add_child(this._appPicker);
        }
    }

    _scheduleSearch(text) {
        if (this._searchTimeoutId) {
            GLib.Source.remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }
        const delay = this._settings.get_int('gnofi-search-delay');
        this._searchTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._searchTimeoutId = 0;
            this._doSearch(text);
            return GLib.SOURCE_REMOVE;
        });
    }

    _doSearch(text) {
        if (text.startsWith(this._commandLeader)) {
            this._handleCommand(text.slice(this._commandLeader.length));
        } else {
            this._appPicker.filter(text);
            this._showApps();
        }
    }

    _handleCommand(commandText) {
        if (this._appPicker.get_parent())
            this._appPicker.get_parent().remove_child(this._appPicker);
        this._resultsBox.destroy_all_children();
        this._noMatchLabel.visible = false;
        this._resultsScroll.visible = true;

        if (!commandText || 'help'.startsWith(commandText)) {
            this._showCommand('help', 'Show help', 'List all available commands');
            this._showCommand('apps', 'Applications', 'Search installed applications');
        } else if ('apps'.startsWith(commandText)) {
            this._showCommand('apps', 'Applications', 'Search installed applications');
        } else {
            this._noMatchLabel.visible = true;
            this._resultsScroll.visible = false;
        }
    }

    _showCommand(name, title, description) {
        const btn = new St.Button({
            style_class: 'gnofi-command-button popup-menu-item',
            reactive: true,
            x_expand: true,
        });
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'gnofi-command-content',
        });
        const titleLabel = new St.Label({ text: title, style_class: 'gnofi-command-title' });
        const descLabel = new St.Label({ text: description, style_class: 'gnofi-command-desc' });
        box.add_child(titleLabel);
        box.add_child(descLabel);
        btn.add_child(box);
        btn.connect('clicked', () => this._executeCommand(name));
        this._resultsBox.add_child(btn);
    }

    _executeCommand(name) {
        if (name === 'help' || name === 'apps') {
            this._entry.set_text('');
        }
    }

    _scrollResults(direction) {
        const vscroll = this._resultsScroll.get_vscroll_bar();
        if (vscroll) {
            const adjustment = vscroll.get_adjustment();
            if (adjustment)
                adjustment.set_value(adjustment.get_value() + direction * 50);
        }
    }

    toggle() {
        if (this._isOpen)
            this.close();
        else
            this.open('');
    }

    open(initialText) {
        if (this._isOpen) return;
        this._isOpen = true;
        this._opening = true;

        if (Main.overview.visible)
            Main.overview.hide();

        this._opening = false;

        this._monitorConstraint.index = global.display.get_current_monitor();

        this._entry.set_text(initialText || '');
        this._appPicker.filter('');
        this._showApps();

        this._grab = global.stage.grab(this);
        this.opacity = 0;
        this.show();

        this.ease({
            opacity: 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._entry.grab_key_focus();
    }

    close() {
        if (!this._isOpen || this._opening) return;
        this._isOpen = false;

        if (this._grab) {
            this._grab.dismiss();
            this._grab = null;
        }

        this.ease({
            opacity: 0,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hide(),
        });
    }

    destroy() {
        if (this._searchTimeoutId) {
            GLib.Source.remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }
        if (this._grab) {
            this._grab.dismiss();
            this._grab = null;
        }
        global.focus_manager.remove_group(this);
        super.destroy();
    }
});
