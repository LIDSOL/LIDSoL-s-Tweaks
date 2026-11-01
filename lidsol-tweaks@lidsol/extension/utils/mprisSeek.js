'use strict';

// #region Seek strategy

/**
 * Apply an absolute seek to an MPRIS player proxy.
 *
 * `SetPosition` is the precise path, but it needs a valid `mpris:trackid`.
 * Players such as GSConnect report none, and some local players expose one
 * and still reject the call, so the relative `Seek` is used as a fallback:
 * every seekable MPRIS player implements it and it only needs an offset from
 * the position the player is believed to be at.
 *
 * Kept free of Gio/Shell imports so the strategy can be exercised with plain
 * fake proxies (see the seek harness), and so `mprisService` stays a thin
 * adapter over the D-Bus state.
 *
 * @param {?object} proxy GDBusProxy for org.mpris.MediaPlayer2.Player
 * @param {object} state
 * @param {?string} state.trackId current mpris:trackid, may be null
 * @param {number} state.targetUs absolute target position, in microseconds
 * @param {?number} state.estimatedUs position the player is believed to be at
 * @returns {Promise<?number>} applied position in microseconds, or null
 */
export async function seekPlayer(proxy, { trackId, targetUs, estimatedUs }) {
    if (!proxy || !Number.isFinite(targetUs))
        return null;

    if (trackId) {
        try {
            await proxy.SetPositionAsync(trackId, targetUs);
            return targetUs;
        } catch (_) {
            // Exposed a trackid but refused SetPosition: fall back to Seek.
        }
    }

    try {
        const offset = targetUs - (Number(estimatedUs) || 0);
        await proxy.SeekAsync(offset);
        return targetUs;
    } catch (_) {
        return null;
    }
}

// #endregion
