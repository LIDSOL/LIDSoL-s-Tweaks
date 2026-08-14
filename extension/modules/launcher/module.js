'use strict';

import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class LauncherModule {
    constructor() {
        this._settings = null;
        this._extension = null;
        this._keybindingId = null;
        this._hideSearchChangedId = null;
        this._searchActiveId = null;
        this._searchEntry = null;
        this._searchBarContainer = null;
        this._searchController = null;
        this._searchBarSavedOpacity = 255;
        this._savedContainerHeight = -1;
        this._searchModeActive = false;
        this._stageKeyPressId = 0;
        this._hintIcon = null;
        this._termsChangedId = 0;
        this._searchResults = null;
        this._focusSearchPatched = false;
        this._hotkeyChangedId = 0;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._registerKeybinding();
        this._hotkeyChangedId = this._settings.connect('changed::launcher-hotkey', () => {
            this._unregisterKeybinding();
            this._registerKeybinding();
        });

        try {
            this._setupSearchBarHiding();
        } catch (e) {
            log(`[LIDSoL] Search bar hiding setup failed: ${e}`);
        }

        this._setupFocusSearchHook();

        // Capture phase: runs before the focused search entry sees the key,
        // so Esc is not swallowed by its own handler (which only clears the
        // search, requiring a second press to close the overview).
        this._stageKeyPressId =
            global.stage.connect('captured-event', this._onStageKeyPress.bind(this));
    }

    disable() {
        this._unregisterKeybinding();
        if (this._hotkeyChangedId) {
            this._settings.disconnect(this._hotkeyChangedId);
            this._hotkeyChangedId = 0;
        }
        if (this._hideSearchChangedId) {
            this._settings.disconnect(this._hideSearchChangedId);
            this._hideSearchChangedId = null;
        }
        if (this._stageKeyPressId !== 0) {
            global.stage.disconnect(this._stageKeyPressId);
            this._stageKeyPressId = 0;
        }
        this._teardownFocusSearchHook();
        this._destroySearchBarHiding();
        this._settings = null;
        this._extension = null;
    }

    _onStageKeyPress(actor, event) {
        if (Main.modalCount > 1)
            return Clutter.EVENT_PROPAGATE;
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_PROPAGATE;
        const search = Main.overview?.searchController;
        if (!search || !search.searchActive || !this._searchModeActive)
            return Clutter.EVENT_PROPAGATE;

        // Esc in our search view exits the overview entirely (like Super).
        // Do NOT reset the search first: resetting clears the entry text and
        // makes the native status show "No results" during the fade-out.
        // Hiding first resets at unmap (already invisible) -> no flash.
        Main.overview.hide();
        return Clutter.EVENT_STOP;
    }

    // The native "Search" shortcut (Keyboard Shortcuts -> Launcher -> Search)
    // is handled by gnome-settings-daemon, which calls Main.overview.focusSearch()
    // via D-Bus. focusSearch() only opens the overview and focuses the search
    // entry, so with the bar hidden it looked like "just the overview". Patch it
    // so the native shortcut behaves exactly like the extension hotkey: a toggle
    // that opens our custom search view and closes it again.
    _setupFocusSearchHook() {
        const overview = Main.overview;
        if (!overview || this._focusSearchPatched)
            return;
        const original = overview.focusSearch.bind(overview);
        overview.focusSearch = () => {
            original();
            this._toggleSearchMode();
        };
        this._focusSearchPatched = true;
    }

    _teardownFocusSearchHook() {
        if (this._focusSearchPatched && Main.overview) {
            delete Main.overview.focusSearch;
            this._focusSearchPatched = false;
        }
    }

    // ── Search mode hotkey ──────────────────────────────────────────
    // Opens the overview's native search (full "search mode" interface)
    // even when the search bar is hidden (launcher-hide-search).

    _registerKeybinding() {
        if (this._collidesWithNativeSearch()) {
            // Same accelerator as the native "Search" shortcut: skip our own
            // binding to avoid a double-fire race. The focusSearch hook makes
            // the native shortcut show our view instead.
            log(`[LIDSoL] Launcher hotkey matches the native "Search" shortcut; ` +
                `not registering own keybinding`);
            return;
        }
        const action = Main.wm.addKeybinding(
            'launcher-hotkey',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleSearchMode(),
        );
        this._keybindingId = 'launcher-hotkey';
        log(`[LIDSoL] Launcher keybinding registered, action=${action} accel=${this._settings.get_strv('launcher-hotkey')}`);
    }

    _collidesWithNativeSearch() {
        const ours = this._settings.get_strv('launcher-hotkey').map(s => s.trim());
        if (ours.length === 0)
            return false;
        const gsd = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.media-keys'});
        const native = gsd.get_strv('search').map(s => s.trim());
        return ours.some(accel => native.includes(accel));
    }

    _unregisterKeybinding() {
        if (this._keybindingId) {
            Main.wm.removeKeybinding(this._keybindingId);
            this._keybindingId = null;
        }
    }

    _toggleSearchMode() {
        const search = Main.overview?.searchController;
        const entry = Main.overview?.searchEntry;
        log(`[LIDSoL] _toggleSearchMode: search=${!!search} entry=${!!entry} ` +
            `searchActive=${search?.searchActive} overviewVisible=${Main.overview?.visible}`);
        if (!search || !entry) return;

        if (search.searchActive) {
            this._closeSearchMode();
        } else if (Main.overview.visible) {
            this._enterSearchMode();
        } else {
            Main.overview.show();
            this._enterSearchMode();
        }
    }

    _closeSearchMode() {
        // Just hide: reset happens at unmap (invisible), avoiding the
        // "No results" flash that resetting before hiding would cause.
        this._searchModeActive = false;
        if (Main.overview.visible)
            Main.overview.hide();
    }

    _enterSearchMode() {
        const search = Main.overview.searchController;
        const entry = Main.overview.searchEntry;
        if (!search || !entry) return;

        // Force the native "search mode": the whole search interface is
        // shown (workspaces/app display fade out) instead of only opening
        // the overview with a hidden search bar.
        this._searchModeActive = true;
        search._setSearchActive(true);
        entry.grab_key_focus();

        // No terms typed yet: show a hint instead of an empty search area.
        // Mirror the native "Searching" layout: a 64px item above the status
        // text with the same 24px spacing. Hide the stopped spinner so it
        // doesn't keep its empty 64px slot (it reappears on play()).
        const results = search._searchResults;
        if (results) {
            results._scrollView.visible = false;
            results._statusContainer.visible = true;
            results._statusSpinner.stop();
            results._statusSpinner.visible = false;
            this._ensureHintIcon(results);
            results._statusText.set_text(_('Type to search'));
        }
        log(`[LIDSoL] _enterSearchMode done: searchActive=${search.searchActive} ` +
            `controllerVisible=${search.visible} controllerOpacity=${search.opacity} ` +
            `searchBarH=${this._searchBarContainer ? this._searchBarContainer.height : -2} ` +
            `entryOpacity=${this._searchEntry ? this._searchEntry.opacity : -2}`);
    }

    // Shows a symbolic icon above the hint text, mirroring how the spinner
    // sits above the "Searching"/"No results" status: same 64px slot, so the
    // text keeps the exact same position/size/color. Hidden once the user
    // actually types (native status takes over).
    _ensureHintIcon(results) {
        if (!this._hintIcon) {
            this._hintIcon = new St.Icon({
                icon_name: 'system-search-symbolic',
                icon_size: 64,
            });
            results._statusContainer.insert_child_at_index(this._hintIcon, 0);
            this._searchResults = results;
            this._termsChangedId = results.connect('terms-changed', view => {
                if (this._hintIcon && view.terms.length > 0)
                    this._hintIcon.visible = false;
            });
        }
        this._hintIcon.visible = true;
    }

    // ── Search bar hiding (launcher-hide-search) ────────────────────

    _setupSearchBarHiding() {
        const entry = Main.overview?.searchEntry;
        if (!entry) return;

        this._searchEntry = entry;
        this._searchBarContainer = entry.get_parent();
        if (!this._searchBarContainer) return;

        this._searchBarSavedOpacity = this._searchBarContainer.opacity;
        this._savedContainerHeight = this._searchBarContainer.height;

        this._searchController = Main.overview.searchController;
        if (!this._searchController) return;

        this._applySearchBarVisibility();

        this._searchActiveId = this._searchController.connect('notify::search-active', () => {
            const active = this._searchController.searchActive;
            if (!active)
                this._searchModeActive = false;
            if (!this._settings.get_boolean('launcher-hide-search')) return;
            if (active) {
                this._showSearchBar();
            } else {
                this._hideSearchBar();
            }
        });

        this._hideSearchChangedId = this._settings.connect('changed::launcher-hide-search', () => {
            this._applySearchBarVisibility();
        });
    }

    _applySearchBarVisibility() {
        if (!this._searchBarContainer) return;
        const hide = this._settings.get_boolean('launcher-hide-search');
        if (hide) {
            this._hideSearchBar();
        } else {
            this._searchEntry.opacity = 255;
            this._searchBarContainer.opacity = 255;
            this._searchBarContainer.height = -1;
        }
    }

    _hideSearchBar() {
        if (!this._searchEntry || !this._searchBarContainer) return;
        this._searchEntry.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE,
            duration: 50,
            onComplete: () => {
                this._searchBarContainer.ease({
                    height: 0,
                    opacity: 0,
                    mode: Clutter.AnimationMode.EASE,
                    duration: 120,
                });
            },
        });
    }

    _showSearchBar() {
        if (!this._searchEntry || !this._searchBarContainer) return;
        // Use the entry's preferred height: after the bar is collapsed the
        // entry's allocated height is 0, which would keep the bar invisible.
        const [, entryHeight] = this._searchEntry.get_preferred_height(-1);
        this._searchBarContainer.ease({
            height: Math.max(entryHeight, 1),
            opacity: 255,
            mode: Clutter.AnimationMode.EASE,
            duration: 110,
            onComplete: () => {
                this._searchBarContainer.height = -1;
                this._searchEntry.ease({
                    opacity: 255,
                    mode: Clutter.AnimationMode.EASE,
                    duration: 700,
                });
            },
        });
    }

    _destroySearchBarHiding() {
        if (this._termsChangedId && this._searchResults) {
            this._searchResults.disconnect(this._termsChangedId);
            this._termsChangedId = 0;
            this._searchResults = null;
        }
        if (this._hintIcon) {
            this._hintIcon.destroy();
            this._hintIcon = null;
        }
        if (this._searchActiveId && this._searchController) {
            this._searchController.disconnect(this._searchActiveId);
            this._searchActiveId = null;
            this._searchController = null;
        }
        if (this._searchBarContainer) {
            this._searchBarContainer.ease({
                height: this._savedContainerHeight,
                opacity: this._searchBarSavedOpacity,
                mode: Clutter.AnimationMode.EASE,
                duration: 120,
                onComplete: () => {
                    if (this._searchBarContainer)
                        this._searchBarContainer.height = -1;
                },
            });
            this._searchBarContainer = null;
        }
        if (this._searchEntry) {
            this._searchEntry.opacity = 255;
            this._searchEntry = null;
        }
    }
}
