'use strict';

import GLib from 'gi://GLib';

// #region Text helpers

/**
 * Escape a string for safe use inside Pango markup.
 * Kept separate from UI code to be reusable and easy to test.
 */
export function escapeMarkup(s) {
    return GLib.markup_escape_text(String(s ?? ''), -1);
}

// #endregion
