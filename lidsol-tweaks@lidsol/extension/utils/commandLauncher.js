'use strict';

import * as Util from 'resource:///org/gnome/shell/misc/util.js';

// #region Command launcher

/**
 * Launch a shell command.
 *
 * Centralises the call so dashboard widgets share the same behaviour as
 * System Levels (and so it can be swapped for a safer launcher later).
 * An empty or null command is ignored.
 *
 * @param {?string} cmd
 */
export function launchCommand(cmd) {
    if (!cmd || typeof cmd !== 'string')
        return;
    const trimmed = cmd.trim();
    if (!trimmed)
        return;
    Util.spawnCommandLine(trimmed);
}

// #endregion
