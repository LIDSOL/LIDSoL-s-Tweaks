'use strict';

import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
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
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;

        this._registerKeybinding();

        try {
            this._setupSearchBarHiding();
        } catch (e) {
            log(`[LIDSoL] Search bar hiding setup failed: ${e}`);
        }
    }

    disable() {
        this._unregisterKeybinding();
        if (this._hideSearchChangedId) {
            this._settings.disconnect(this._hideSearchChangedId);
            this._hideSearchChangedId = null;
        }
        this._destroySearchBarHiding();
        this._settings = null;
        this._extension = null;
    }

    // ── Search mode hotkey ──────────────────────────────────────────
    // Opens the overview's native search (full "search mode" interface)
    // even when the search bar is hidden (launcher-hide-search).

    _registerKeybinding() {
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
            search.reset();
            if (Main.overview.visible)
                Main.overview.hide();
        } else if (Main.overview.visible) {
            this._enterSearchMode();
        } else {
            Main.overview.show();
            this._enterSearchMode();
        }
    }

    _enterSearchMode() {
        const search = Main.overview.searchController;
        const entry = Main.overview.searchEntry;
        if (!search || !entry) return;

        // Force the native "search mode": the whole search interface is
        // shown (workspaces/app display fade out) instead of only opening
        // the overview with a hidden search bar.
        search._setSearchActive(true);
        entry.grab_key_focus();

        // No terms typed yet: keep the initial search display clean by
        // hiding the empty results/status boxes until the user types.
        const results = search._searchResults;
        if (results) {
            results._scrollView.visible = false;
            results._statusContainer.visible = false;
        }
        log(`[LIDSoL] _enterSearchMode done: searchActive=${search.searchActive} ` +
            `controllerVisible=${search.visible} controllerOpacity=${search.opacity} ` +
            `searchBarH=${this._searchBarContainer ? this._searchBarContainer.height : -2} ` +
            `entryOpacity=${this._searchEntry ? this._searchEntry.opacity : -2}`);
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
            if (!this._settings.get_boolean('launcher-hide-search')) return;
            const active = this._searchController.searchActive;
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
