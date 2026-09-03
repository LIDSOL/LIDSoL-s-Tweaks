'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

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

    _getIcon() {
        return this._settings.get_string('launcher-provider-icon') || DEFAULT_ICON;
    }

    _getCommands() {
        const commands = [];
        this._settings.get_strv('launcher-commands').forEach(entry => {
            const idx = entry.indexOf(PREFS_TERM_SEPARATOR);
            if (idx < 0)
                return;
            const name = entry.slice(0, idx).trim();
            const command = entry.slice(idx + 1).trim();
            if (name && command)
                commands.push({ name, command });
        });
        return commands;
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
        const iconName = this._getIcon();
        return this._findByNames(ids).map(c => ({
            id: c.name,
            name: c.name,
            description: c.command,
            createIcon: size => new St.Icon({
                icon_name: iconName,
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
        Util.spawnCommandLine(command.command);
        Main.overview.hide();
    }

    _parseCommandQuery(terms) {
        const first = (terms && terms.length > 0) ? terms[0] : '';
        if (!first.startsWith(':'))
            return null;
        return first.slice(1).trim();
    }
}
