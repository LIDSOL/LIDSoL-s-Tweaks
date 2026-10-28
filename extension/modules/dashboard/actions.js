'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

// #region GSettings
function getSettings(schemaId) {
    try {
        const source = Gio.SettingsSchemaSource.get_default();
        if (source.lookup(schemaId, true))
            return new Gio.Settings({ schema_id: schemaId });
    } catch (_) {}
    return null;
}

// #endregion

// #region Helpers
export function openSettingsPanel(panel) {
    const id = panel ? `gnome-control-center.desktop` : 'gnome-control-center.desktop';
    const app = Shell.AppSystem.get_default().lookup_app(id);
    if (app) {
        if (panel) {
            try {
                app.launch([], null, ['panel', panel]);
                return;
            } catch (_) {}
        }
        app.activate();
        return;
    }
    try {
        if (panel)
            GLib.spawn_command_line_async(`gnome-control-center ${panel}`);
        else
            GLib.spawn_command_line_async('gnome-control-center');
    } catch (_) {}
}

export function getNightLightEnabled() {
    const s = getSettings('org.gnome.settings-daemon.plugins.color');
    if (!s) return false;
    try {
        return s.get_boolean('night-light-enabled');
    } catch (_) {
        return false;
    }
}

export function toggleNightLight() {
    const s = getSettings('org.gnome.settings-daemon.plugins.color');
    if (!s) return;
    try {
        s.set_boolean('night-light-enabled', !s.get_boolean('night-light-enabled'));
    } catch (_) {}
}

export function getDarkStyleEnabled() {
    const s = getSettings('org.gnome.desktop.interface');
    if (!s) return false;
    try {
        return s.get_string('color-scheme') === 'prefer-dark';
    } catch (_) {
        return false;
    }
}

export function toggleDarkStyle() {
    const s = getSettings('org.gnome.desktop.interface');
    if (!s) return;
    try {
        const current = s.get_string('color-scheme');
        s.set_string('color-scheme', current === 'prefer-dark' ? 'default' : 'prefer-dark');
    } catch (_) {}
}

export function getDndEnabled() {
    const s = getSettings('org.gnome.desktop.notifications');
    if (!s) return false;
    try {
        // Do Not Disturb: when enabled, banners are disabled
        return !s.get_boolean('show-banners');
    } catch (_) {
        return false;
    }
}

export function toggleDnd() {
    const s = getSettings('org.gnome.desktop.notifications');
    if (!s) return;
    try {
        s.set_boolean('show-banners', !s.get_boolean('show-banners'));
    } catch (_) {}
}

// #endregion
