'use strict';

import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { MprisService } from '../mprisService.js';

const ART_CACHE_MAX_BYTES = 20 * 1024 * 1024;

var MediaPlayerManager = GObject.registerClass({
    Signals: {
        'player-changed': { param_types: [GObject.TYPE_STRING] },
        'media-changed': {},
        'screen-unlocked': {},
    },
}, class MediaPlayerManager extends GObject.Object {
    static _instance = null;

    static getDefault() {
        if (!MediaPlayerManager._instance) {
            MediaPlayerManager._instance = new MediaPlayerManager();
            MediaPlayerManager._instance._initManager();
        }
        return MediaPlayerManager._instance;
    }

    constructor() {
        super();
        this._service = null;
        this._activePlayer = null;
        this._lastActivePlayer = null;
        this._lastTrackId = null;
        this._artCache = new Map();
        this._artCacheMaxBytes = ART_CACHE_MAX_BYTES;
        this._cacheDir = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'lidsol-widgets', 'art',
        ]);
        GLib.mkdir_with_parents(this._cacheDir, 0o755);
        this._started = false;
        this._screenSaverSubId = 0;
        this._lastKnownCover = null;
    }

    _initManager() {
        if (this._started) return;
        this._started = true;

        this._service = MprisService.getDefault();

        this._service.connectObject(
            'player-added', () => this._onPlayerListChanged(),
            'player-removed', () => this._onPlayerListChanged(),
            this
        );

        this._connectAllPlayers();
        this._selectActivePlayer({ silent: true });

        this._subscribeScreenSaver();
    }

    _subscribeScreenSaver() {
        try {
            this._screenSaverSubId = Gio.DBus.session.signal_subscribe(
                'org.gnome.ScreenSaver',
                'org.gnome.ScreenSaver',
                'ActiveChanged',
                '/org/gnome/ScreenSaver',
                null,
                Gio.DBusSignalFlags.NONE,
                (conn, sender, path, iface, signal, params) => {
                    let [isActive] = params.deepUnpack();
                    if (!isActive)
                        this._onScreenUnlock();
                }
            );
        } catch (e) {
            console.error('[MediaPlayerManager] Failed to subscribe ScreenSaver:', e);
        }
    }

    _onScreenUnlock() {
        this.emit('screen-unlocked');
        if (this._activePlayer)
            this._emitMediaChanged();
    }

    _connectAllPlayers() {
        for (const player of this._service.allPlayers) {
            if (!player._mpmConnected) {
                player.connectObject('changed', () => {
                    this._onAnyPlayerUpdate(player);
                }, this);
                player._mpmConnected = true;
            }
        }
    }

    _onPlayerListChanged() {
        this._connectAllPlayers();
        this._selectActivePlayer();
    }

    _onAnyPlayerUpdate(player) {
        const wasActive = player === this._activePlayer;

        if (wasActive || player.isPlaying()) {
            if (wasActive) {
                // When the active player pauses/stops, immediately check
                // if another player is still playing and switch to it
                if (!player.isPlaying()) {
                    const otherPlaying = this._service.players.find(
                        p => p !== player && p.isPlaying()
                    );
                    if (otherPlaying) {
                        this._selectActivePlayer();
                        return;
                    }
                }
                this._emitMediaChanged();
            } else {
                this._selectActivePlayer();
            }
        }
    }

    _selectActivePlayer(opts = {}) {
        const previous = this._activePlayer;
        const active = this._service.getActivePlayer();
        const lastActive = this._lastActivePlayer;

        this._activePlayer = active || lastActive || null;

        if (!this._activePlayer || !this._activePlayer.isPlaying()) {
            const playing = this._service.players.find(p => p.isPlaying());
            if (playing)
                this._activePlayer = playing;
        }

        if (this._activePlayer && this._activePlayer.isPlaying())
            this._lastActivePlayer = this._activePlayer;

        if (this._activePlayer !== previous) {
            if (opts.silent) return;
            this.emit('player-changed', this._activePlayer?.busName || '');
            if (this._activePlayer)
                this._emitMediaChanged();
        }
    }

    _emitMediaChanged() {
        if (!this._activePlayer) return;
        this.emit('media-changed');
    }

    getActivePlayer() {
        return this._activePlayer;
    }

    getLastKnownCover() {
        return this._lastKnownCover;
    }

    getActivePlayerMeta() {
        if (!this._activePlayer) return null;
        const p = this._activePlayer;
        return {
            title: p.trackTitle || '',
            artist: p.trackArtists ? p.trackArtists.join(', ') : '',
            coverUrl: p.trackCoverUrl || '',
            isPlaying: p.isPlaying(),
            playbackStatus: p.playbackStatus,
            canGoNext: p.canGoNext,
            canGoPrevious: p.canGoPrevious,
            canSeek: p.canSeek,
            busName: p.busName,
        };
    }

    _hashUrl(url) {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            let chr = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }

    getArtUrl(artUrl) {
        if (!artUrl) return null;

        let cached = this._artCache.get(artUrl);
        if (cached) {
            this._lastKnownCover = cached;
            return cached;
        }

        let cacheKey = this._hashUrl(artUrl);
        let cachedPath = GLib.build_filenamev([this._cacheDir, cacheKey + '.jpg']);

        if (GLib.file_test(cachedPath, GLib.FileTest.EXISTS)) {
            let uri = 'file://' + cachedPath;
            this._artCache.set(artUrl, uri);
            this._lastKnownCover = uri;
            return uri;
        }

        this._downloadArt(artUrl, cachedPath, cacheKey);

        if (artUrl.startsWith('file://')) {
            let localPath = artUrl.replace('file://', '');
            if (GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
                try {
                    GLib.file_set_contents(cachedPath,
                        Gio.File.new_for_path(localPath).load_contents(null)[1]
                    );
                    let uri = 'file://' + cachedPath;
                    this._artCache.set(artUrl, uri);
                    this._lastKnownCover = uri;
                    return uri;
                } catch (e) { /* ignore */ }
            }
        }

        return artUrl;
    }

    _downloadArt(artUrl, targetPath) {
        if (artUrl.startsWith('file://')) {
            let localPath = artUrl.replace('file://', '');
            try {
                let f = Gio.File.new_for_path(localPath);
                let src = f.read(null);
                let dst = Gio.File.new_for_path(targetPath);
                let out = dst.replace(null, false, Gio.FileCreateFlags.NONE, null);
                let buf = new Uint8Array(65536);
                let bytes;
                while ((bytes = src.read(buf, null)) > 0)
                    out.write(buf.slice(0, bytes), null);
                src.close(null);
                out.close(null);
                let uri = 'file://' + targetPath;
                this._artCache.set(artUrl, uri);
                this._lastKnownCover = uri;
            } catch (e) { /* ignore */ }
            return;
        }

        if (!artUrl.startsWith('http://') && !artUrl.startsWith('https://')) return;

        try {
            let session = new Gio.SocketClient();
            let file = Gio.File.new_for_path(targetPath);

            let httpSession = new Gio.HttpClient({ timeout: 10 });

            let request = Gio.HttpRequest.new(artUrl);
            httpSession.send_async(request, GLib.PRIORITY_DEFAULT, null, (session_, res) => {
                try {
                    let response = httpSession.send_finish(res);
                    let bytes = response.get_body_bytes();
                    file.replace_contents_bytes_async(
                        bytes, null, false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION,
                        null,
                        (file_, result) => {
                            try {
                                file.replace_contents_finish(result);
                                let uri = 'file://' + targetPath;
                                this._artCache.set(artUrl, uri);
                                this._lastKnownCover = uri;
                                this._trimDiskCache();
                            } catch (e) { /* ignore */ }
                        }
                    );
                } catch (e) { /* ignore */ }
            });
        } catch (e) { /* ignore */ }
    }

    setArtCacheSizeLimit(megabytes) {
        this._artCacheMaxBytes = megabytes * 1024 * 1024;
        this._trimDiskCache();
    }

    _scanDiskCacheSize() {
        let total = 0;
        try {
            let dir = Gio.File.new_for_path(this._cacheDir);
            if (!dir.query_exists(null)) return 0;
            let en = dir.enumerate_children(
                'standard::size',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            let fi;
            while ((fi = en.next_file(null)) !== null)
                total += fi.get_size() || 0;
            en.close(null);
        } catch (e) { /* ignore */ }
        return total;
    }

    _trimDiskCache() {
        let currentSize = this._scanDiskCacheSize();
        if (currentSize <= this._artCacheMaxBytes) return;
        try {
            let dir = Gio.File.new_for_path(this._cacheDir);
            if (!dir.query_exists(null)) return;
            let en = dir.enumerate_children(
                'standard::name,standard::size,time::modified',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            let files = [];
            let fi;
            while ((fi = en.next_file(null)) !== null) {
                files.push({
                    file: dir.get_child(fi.get_name()),
                    size: fi.get_size() || 0,
                    time: fi.get_attribute_uint64('time::modified') || 0,
                });
            }
            en.close(null);
            files.sort((a, b) => a.time - b.time);
            for (let f of files) {
                if (currentSize <= this._artCacheMaxBytes) break;
                try {
                    let size = f.size;
                    f.file.delete(null);
                    currentSize -= size;
                    let deletedUri = 'file://' + f.file.get_path();
                    for (const [key, val] of this._artCache) {
                        if (val === deletedUri) {
                            this._artCache.delete(key);
                            break;
                        }
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    }

    getAverageColorFromUrl(artUrl) {
        if (!artUrl) return null;
        try {
            let filePath = artUrl.replace('file://', '');
            if (!GLib.file_test(filePath, GLib.FileTest.EXISTS))
                return null;
            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(filePath);
            return this._getAverageColor(pixbuf);
        } catch (e) {
            return null;
        }
    }

    _getAverageColor(pixbuf) {
        let w = pixbuf.get_width();
        let h = pixbuf.get_height();
        let pixels = pixbuf.get_pixels();
        let rowstride = pixbuf.get_rowstride();
        let nChannels = pixbuf.get_n_channels();
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = 0; y < h; y += 20) {
            for (let x = 0; x < w; x += 20) {
                let idx = y * rowstride + x * nChannels;
                r += pixels[idx];
                g += pixels[idx + 1];
                b += pixels[idx + 2];
                count++;
            }
        }
        return { r: Math.floor(r / count), g: Math.floor(g / count), b: Math.floor(b / count) };
    }

    destroy() {
        if (this._screenSaverSubId) {
            Gio.DBus.session.signal_unsubscribe(this._screenSaverSubId);
            this._screenSaverSubId = 0;
        }
        if (this._service)
            this._service.disconnectObject(this);
        for (const player of this._service?.allPlayers || [])
            player.disconnectObject(this);
        this._activePlayer = null;
        this._lastActivePlayer = null;
        this._artCache.clear();
        MediaPlayerManager._instance = null;
        this._started = false;
    }
});

export { MediaPlayerManager };
