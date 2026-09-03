'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PREFS_TERM_SEPARATOR = '|';
const DEFAULT_ICON = 'utilities-terminal-symbolic';

export class LauncherSearchProvider {
    constructor(settings) {
        this._settings = settings;

        // A truthy `appInfo` makes GNOME Shell render this provider as a
        // list section with a header (icon + name) instead of a flat grid of
        // letter-circles, exactly like the native "Settings" provider.
        this.appInfo = {
            get_name: () => 'Comandos',
            // A real installed desktop id keeps parental-controls happy and
            // lets the launch animation resolve an app.
            get_id: () => 'org.gnome.Settings.desktop',
            // The category header always shows the generic terminal icon;
            // the configurable icon applies to each result row.
            get_icon: () => Gio.icon_new_for_string(DEFAULT_ICON),
            // Required by ParentalControlsManager.shouldShowApp().
            should_show: () => true,
        };
    }

    _getCommands() {
        const commands = [];
        this._settings.get_strv('launcher-commands').forEach(entry => {
            const command = this._parseCommand(entry);
            if (command)
                commands.push(command);
        });
        return commands;
    }

    // Parses a stored entry of the form "nombre|comando|icono".
    // The command may itself contain '|', so the icon is taken from the
    // last field and the command is the join of the middle fields.
    _parseCommand(entry) {
        const parts = entry.split(PREFS_TERM_SEPARATOR);
        const name = parts[0].trim();
        if (!name)
            return null;
        let command;
        let icon = '';
        if (parts.length >= 3) {
            icon = parts[parts.length - 1].trim();
            command = parts.slice(1, -1).join(PREFS_TERM_SEPARATOR).trim();
        } else {
            command = parts[1] ? parts[1].trim() : '';
        }
        if (!command)
            return null;
        return { name, command, icon };
    }

    _findByNames(names) {
        const byName = new Map(this._getCommands().map(c => [c.name, c]));
        return names.map(name => byName.get(name)).filter(Boolean);
    }

    // ── Shell.SearchProvider interface (promise-based, GNOME 45+) ─────

    async getInitialResultSet(terms) {
        const query = this._parseCommandQuery(terms);
        if (query === null)
            return [];

        const q = query.toLowerCase();
        return this._getCommands()
            .filter(c => c.name.toLowerCase().includes(q))
            .map(c => c.name);
    }

    async getSubsearchResultSet(previousResults, terms) {
        const query = this._parseCommandQuery(terms);
        if (query === null)
            return [];

        const q = query.toLowerCase();
        return (previousResults || []).filter(name =>
            name.toLowerCase().includes(q));
    }

    async getResultMetas(ids) {
        return this._findByNames(ids).map(c => ({
            id: c.name,
            name: c.name,
            description: c.command,
            createIcon: size => new St.Icon({
                icon_name: c.icon || DEFAULT_ICON,
                icon_size: size,
            }),
        }));
    }

    // Required by ListSearchResults: it calls filterResults when the display
    // caps the number of rows (MAX_LIST_SEARCH_RESULTS_ROWS = 5).
    filterResults(results, max) {
        return results.slice(0, max);
    }

    async activateResult(id, terms) {
        const [command] = this._findByNames([id]);
        if (!command)
            return;
        try {
            GLib.spawn_async(
                GLib.get_home_dir(),
                ['/bin/sh', '-c', command.command],
                null,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                null, null);
        } catch (e) {
            log(`[LIDSoL] Failed to run launcher command: ${e}`);
        }
        Main.overview.hide();
    }

    _parseCommandQuery(terms) {
        const first = (terms && terms.length > 0) ? terms[0] : '';
        if (!first.startsWith(':'))
            return null;
        return first.slice(1).trim();
    }
}
