'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';
import St from 'gi://St';

// ---------------------------------------------------------------------------
// AlbumArt: productor + consumidor CSS (modelo de dynamic-music-pill).
//
// El widget renderiza capas St.Widget con background-image (la carga async la
// hace el propio St), nunca decodifica ni toca la red. Un resolver a nivel de
// módulo (compartido por todas las instancias) normaliza la carátula a un
// file:// local del cache propio:
//   - http(s): descarga async con Soup (dedup in-flight) → cache atómico.
//   - file://  : copia al cache clave MD5(url|mtime) y monitoriza el origen
//     (re-escrituras del mismo archivo entre pistas).
//   - data:/otros: passthrough directo al CSS (St renderiza data: URIs).
// Mientras se resuelve una carátula nueva se conserva la anterior; ante un
// fallo definitivo se limpia (nunca stale).
// ---------------------------------------------------------------------------

// Fundido de una carátula nueva sobre la anterior.
const FADE_MS = 300;

// file:// que todavía no existe (o está vacío): reintentos 500ms x10.
const RETRY_INTERVAL_MS = 500;
const RETRY_MAX = 10;

// Debounce del monitor de cambios del archivo origen.
const MONITOR_DEBOUNCE_MS = 200;

// Ventana de no-reintento tras un fallo de red definitivo (evita golpear un
// servidor caído en cada sync del reproductor).
const HTTP_RETRY_DELAY_MS = 30000;

// Cache on disk: LRU de 50 entradas con cleanup diferido.
const CACHE_DIR = GLib.build_filenamev([
    GLib.get_user_cache_dir(),
    'lidsol-widgets',
    'album-art',
]);
const CACHE_MAX_FILES = 50;
const CACHE_CLEANUP_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Sesión Soup + dedup in-flight compartidos entre instancias.
// ---------------------------------------------------------------------------

let _session = null;

function _sessionOnce() {
    if (!_session) {
        _session = new Soup.Session({ timeout: 10 });
        try {
            _session.user_agent = 'lidsol-widgets/album-art/1.0';
        } catch (e) {
            // libsoup sin propiedad user_agent escribible
        }
    }
    return _session;
}

// url http(s) -> Promise<{status:'ok', uri} | {status:'fail'}>
const _inflight = new Map();

// ---------------------------------------------------------------------------
// Vigilancia de fuentes file:// (monitor + reintento), compartida: un único
// monitor/reintento por URL origen para todas las instancias del widget.
//   _sources: srcUri -> { watchers: Set<AlbumArt>, monitor, debounceId,
//                        retryId, retryCount }
// ---------------------------------------------------------------------------

const _sources = new Map();

// Similar a _watchSource pero sin reintento: para fuentes file:// que YA
// existen, de modo que una reescritura del mismo archivo (mismo url, mtime
// nuevo) dispare el monitor y se vuelva a copiar.
function _registerMonitorSource(srcUri, widget) {
    let entry = _sources.get(srcUri);
    if (!entry) {
        entry = {
            watchers: new Set(),
            monitor: null,
            debounceId: 0,
            retryId: 0,
            retryCount: 0,
        };
        _sources.set(srcUri, entry);
    }
    entry.watchers.add(widget);
    _setupMonitor(srcUri, entry);
}

// ---------------------------------------------------------------------------
// Helpers de disco
// ---------------------------------------------------------------------------

function _unlink(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
    } catch (e) { /* ignore */ }
}

function _writeBytes(path, bytes) {
    // gjs: GLib.Bytes → Uint8Array (verificado en gjs 1.90)
    const data = typeof bytes.get_data === 'function' ? bytes.get_data() : bytes.toArray();
    GLib.file_set_contents(path, data);
}

function _fileFor(url) {
    return url.startsWith('file://') ? Gio.File.new_for_uri(url) : Gio.File.new_for_path(url);
}

function _fileCheck(url) {
    try {
        const f = _fileFor(url);
        if (!f.query_exists(null))
            return { exists: false, size: 0 };
        const info = f.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null);
        return { exists: true, size: info ? info.get_size() : 0 };
    } catch (e) {
        return { exists: false, size: 0 };
    }
}

function _isHttp(url) {
    return url.startsWith('http://') || url.startsWith('https://');
}

function _isFileUrl(url) {
    return url.startsWith('file://');
}

function _hasScheme(url) {
    return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

// ---------------------------------------------------------------------------
// Resolver: descarga http(s) → cache atómico + dedup
// ---------------------------------------------------------------------------

async function _downloadHttp(url) {
    const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
    const cachePath = GLib.build_filenamev([CACHE_DIR, hash + '.png']);
    const tmpPath = `${cachePath}.tmp`;
    const cached = Gio.File.new_for_path(cachePath);

    if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
        const info = cached.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null);
        if (info && info.get_size() > 0)
            return { status: 'ok', uri: cached.get_uri() };
        _unlink(cachePath);
    }

    let pending = _inflight.get(url);
    if (!pending) {
        pending = (async () => {
            try {
                const message = Soup.Message.new('GET', url);
                if (!message)
                    return { status: 'fail' };

                // Estilo callback (a prueba de versiones): funciona tanto si el
                // prototipo fue promisificado por mediaManager como si no.
                const bytes = await new Promise((resolve, reject) => {
                    _sessionOnce().send_and_read_async(
                        message, GLib.PRIORITY_DEFAULT, null, (src, res) => {
                            try {
                                resolve(src.send_and_read_finish(res));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
                if (message.get_status() !== Soup.Status.OK)
                    return { status: 'fail' };

                GLib.mkdir_with_parents(CACHE_DIR, 0o755);
                // Escritura atómica: tmp → rename. Un stream truncado jamás
                // llega al cache (el body viene completo o falla la lectura).
                _writeBytes(tmpPath, bytes);
                const info = Gio.File.new_for_path(tmpPath).query_info(
                    Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null
                );
                if (!info || info.get_size() === 0) {
                    _unlink(tmpPath);
                    return { status: 'fail' };
                }
                // rename atómico tmp → cache (GLib.rename es la syscall directa;
                // en gjs 1.90 no existe Gio.FileMoveFlags ni move de 3 args).
                if (GLib.rename(tmpPath, cachePath) !== 0) {
                    _unlink(tmpPath);
                    return { status: 'fail' };
                }
                _scheduleCleanup();
                return { status: 'ok', uri: cached.get_uri() };
            } catch (e) {
                _unlink(tmpPath);
                return { status: 'fail' };
            }
        })();
        _inflight.set(url, pending);
    }
    try {
        return await pending;
    } finally {
        _inflight.delete(url);
    }
}

// ---------------------------------------------------------------------------
// Resolver: copia file:// al cache, clave MD5(url|mtime) → detecta que el
// jugador reescriba el mismo archivo entre pistas.
// ---------------------------------------------------------------------------

async function _copyLocal(url) {
    try {
        GLib.mkdir_with_parents(CACHE_DIR, 0o755);
        const src = _fileFor(url);
        const info = src.query_info(
            `${Gio.FILE_ATTRIBUTE_TIME_MODIFIED},${Gio.FILE_ATTRIBUTE_STANDARD_SIZE}`,
            Gio.FileQueryInfoFlags.NONE, null
        );
        if (!info)
            return { status: 'fail' };
        const mtime = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_TIME_MODIFIED);
        const key = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, `${url}|${mtime}`, -1);
        const cachePath = GLib.build_filenamev([CACHE_DIR, key + '.png']);
        const cached = Gio.File.new_for_path(cachePath);

        if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
            const cinfo = cached.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null);
            if (cinfo && cinfo.get_size() > 0)
                return { status: 'ok', uri: cached.get_uri() };
            _unlink(cachePath);
        }

        await new Promise((resolve, reject) => {
            src.copy_async(cached, Gio.FileCopyFlags.OVERWRITE,
                GLib.PRIORITY_DEFAULT, null, null, (f, res) => {
                    try {
                        f.copy_finish(res);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
        });
        const cinfo2 = cached.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null);
        if (!cinfo2 || cinfo2.get_size() === 0) {
            _unlink(cachePath);
            return { status: 'fail' };
        }
        _scheduleCleanup();
        return { status: 'ok', uri: cached.get_uri() };
    } catch (e) {
        return { status: 'fail' };
    }
}

// ---------------------------------------------------------------------------
// Vigilancia de file:// perezosos / reescritos
// ---------------------------------------------------------------------------

function _watchSource(srcUri, widget) {
    let entry = _sources.get(srcUri);
    if (!entry) {
        entry = {
            watchers: new Set(),
            monitor: null,
            debounceId: 0,
            retryId: 0,
            retryCount: 0,
        };
        _sources.set(srcUri, entry);
    }
    entry.watchers.add(widget);
    _startRetry(srcUri, entry);
    _setupMonitor(srcUri, entry);
}

function _unwatchSource(srcUri, widget) {
    const entry = _sources.get(srcUri);
    if (!entry)
        return;
    entry.watchers.delete(widget);
    if (entry.watchers.size === 0)
        _cleanupEntry(srcUri, entry);
}

function _cleanupEntry(srcUri, entry) {
    if (entry.monitor) {
        try { entry.monitor.cancel(); } catch (e) { /* ignore */ }
        entry.monitor = null;
    }
    if (entry.debounceId) {
        GLib.source_remove(entry.debounceId);
        entry.debounceId = 0;
    }
    if (entry.retryId) {
        GLib.source_remove(entry.retryId);
        entry.retryId = 0;
    }
    _sources.delete(srcUri);
}

function _setupMonitor(srcUri, entry) {
    if (entry.monitor)
        return;
    try {
        const file = _fileFor(srcUri);
        entry.monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        entry.monitor.connect('changed', (mon, f, otherFile, eventType) => {
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED) {
                if (entry.debounceId)
                    GLib.source_remove(entry.debounceId);
                entry.debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MONITOR_DEBOUNCE_MS, () => {
                    entry.debounceId = 0;
                    _notifyWatchers(srcUri);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    } catch (e) {
        // El archivo aún no existe: el reintento establece el monitor al crearse.
    }
}

function _startRetry(srcUri, entry) {
    if (entry.retryId)
        return;
    entry.retryCount = 0;
    entry.retryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_INTERVAL_MS, () => {
        entry.retryId = 0;
        entry.retryCount++;
        if (entry.retryCount > RETRY_MAX) {
            // Se rinde: notifica a los widgets (definitivo → limpiar).
            _failWatchers(srcUri);
            _cleanupEntry(srcUri, entry);
            return GLib.SOURCE_REMOVE;
        }
        const check = _fileCheck(srcUri);
        if (check.exists && check.size > 0) {
            _setupMonitor(srcUri, entry);
            _notifyWatchers(srcUri);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
}

function _notifyWatchers(srcUri) {
    const entry = _sources.get(srcUri);
    if (!entry)
        return;
    for (const widget of [...entry.watchers])
        widget._refreshSource(srcUri);
}

function _failWatchers(srcUri) {
    const entry = _sources.get(srcUri);
    if (!entry)
        return;
    for (const widget of [...entry.watchers])
        widget._onSourceFailed(srcUri);
}

// ---------------------------------------------------------------------------
// LRU eviction del cache on disk
// ---------------------------------------------------------------------------

let _cleanupId = 0;

function _scheduleCleanup() {
    if (_cleanupId)
        return;
    _cleanupId = GLib.timeout_add(GLib.PRIORITY_LOW, CACHE_CLEANUP_DELAY_MS, () => {
        _cleanupId = 0;
        _cleanupDiskCache();
        return GLib.SOURCE_REMOVE;
    });
}

function _cleanupDiskCache() {
    try {
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (!dir.query_exists(null))
            return;
        const en = dir.enumerate_children(
            'standard::name,time::modified', Gio.FileQueryInfoFlags.NONE, null
        );
        const files = [];
        let fi;
        while ((fi = en.next_file(null)) !== null)
            files.push({ name: fi.get_name(), time: fi.get_attribute_uint64('time::modified') || 0 });
        en.close(null);
        if (files.length <= CACHE_MAX_FILES)
            return;
        files.sort((a, b) => b.time - a.time);
        for (let i = CACHE_MAX_FILES; i < files.length; i++) {
            const f = dir.get_child(files[i].name);
            try { f.delete(null); } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Widget: capas CSS con background-image (sin GdkPixbuf, sin canvas)
// ---------------------------------------------------------------------------

var AlbumArt = GObject.registerClass(
    class AlbumArt extends St.Widget {
        _init(radiusOrOptions = {}) {
            const options = typeof radiusOrOptions === 'number'
                ? { radius: radiusOrOptions }
                : radiusOrOptions;

            super._init({
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: false,
                x_expand: false,
                y_expand: false,
            });

            const radius = options.radius ?? 0;
            this._size = options.size ?? radius * 2;
            // null = "derivado" (size/2 en el getter). Se respeta un roundness
            // explícito pasado por el constructor (dashboard lo hace).
            this._roundness = options.roundness ?? null;

            // Estado de la resolución: _currentUrl es la fuente pedida;
            // _loadedSource la fuente cuyo art está en pantalla; _pendingUrl la
            // fuente en resolución (descarga http o file:// vigilado);
            // _watchedUrl la fuente file:// cuyo monitor/reintento compartido
            // mantiene esta instancia registrada.
            this._currentUrl = null;
            this._loadedSource = null;
            this._pendingUrl = null;
            this._watchedUrl = null;
            this._requestSeq = 0;
            this._failedAt = new Map(); // http url -> timestamp del último fallo
            this._currentLayerUri = null;

            this._updateRootStyle();
        }

        get size() {
            return this._size;
        }

        set size(v) {
            if (v !== this._size) {
                this._size = v;
                this.queue_relayout();
                this._updateRootStyle();
                this._updateLayersStyle();
            }
        }

        get roundness() {
            return this._roundness ?? this._size / 2;
        }

        set roundness(v) {
            if (v !== this._roundness) {
                this._roundness = v;
                // válido incluso como null: el getter vuelve a _size/2
                this._updateRootStyle();
                this._updateLayersStyle();
            }
        }

        get currentUrl() {
            return this._currentUrl;
        }

        // True cuando el caller debería volver a pedir esta URL (falló o nunca
        // se intentó y no hay resolución en vuelo). Permite que los
        // consumidores reintenten en su siguiente sync sin spammear.
        needsLoad(url) {
            if (!url)
                return false;
            if (this._loadedSource === url || this._pendingUrl === url)
                return false;
            return true;
        }

        setArt(url, force = false) {
            url = url || null;

            // Idempotencia: ya mostrada o en resolución. El caso null siempre
            // pasa (limpiar debe invalidar cualquier resolución en vuelo).
            if (!force && url && (this._loadedSource === url || this._pendingUrl === url))
                return;

            const oldWatch = this._watchedUrl;
            this._watchedUrl = null;
            this._pendingUrl = null;
            this._currentUrl = url;
            const seq = ++this._requestSeq;

            if (oldWatch && oldWatch !== url)
                _unwatchSource(oldWatch, this);

            if (!url) {
                this._loadedSource = null;
                this._resetLayers();
                return;
            }

            this._pendingUrl = url;
            this._resolveSource(url, seq, force);
        }

        async _resolveSource(url, seq, force = false) {
            let result = null;
            let attempted = false; // ¿se tocó la red? (para no re-armar el gate)

            if (_isHttp(url)) {
                const lastFail = this._failedAt.get(url) || 0;
                if (Date.now() - lastFail < HTTP_RETRY_DELAY_MS) {
                    result = null;
                } else {
                    attempted = true;
                    result = await _downloadHttp(url);
                }
            } else if (_isFileUrl(url) || !_hasScheme(url)) {
                const check = _fileCheck(url);
                if (!check.exists || check.size === 0) {
                    // file:// perezoso (aún no existe / vacío): conservamos la
                    // carátula anterior y el módulo reintenta + monitoriza.
                    this._pendingUrl = url;
                    this._watchedUrl = url;
                    _watchSource(url, this);
                    return;
                }
                attempted = true;
                result = await _copyLocal(url);
            } else {
                // data: u otro esquema → passthrough directo al CSS
                result = { status: 'ok', uri: url };
            }

            if (seq !== this._requestSeq)
                return; // superseded: una petición más nueva la descarta

            this._pendingUrl = null;
            if (result && result.status === 'ok') {
                this._loadedSource = url;
                this._failedAt.delete(url);
                if (_isFileUrl(url) || !_hasScheme(url)) {
                    // La fuente file:// puede reescribirse a mitad de pista:
                    // monitorizarla para re-copiar (clave mtime) al cambiar.
                    this._watchedUrl = url;
                    _registerMonitorSource(url, this);
                }
                this._showLayer(result.uri, force);
            } else {
                // Fallo definitivo: limpiar (nunca conservar el art de la
                // pista anterior). Solo se registra el timestamp si hubo un
                // intento real (no al estar dentro de la ventana de espera).
                if (attempted)
                    this._failedAt.set(url, Date.now());
                this._watchedUrl = null;
                this._loadedSource = null;
                this._resetLayers();
            }
        }

        // Re-resuelve la fuente actual (monitor/retry del módulo): mantiene la
        // carátula anterior mientras tanto y la sustituye al estar lista.
        _refreshSource(srcUri) {
            if (!this._currentUrl || this._currentUrl !== srcUri)
                return;
            if (this._pendingUrl && this._pendingUrl !== srcUri)
                return;
            const seq = ++this._requestSeq;
            this._pendingUrl = srcUri;
            this._resolveSource(srcUri, seq);
        }

        // El módulo se rinde tras los reintentos: fallo definitivo → limpiar.
        _onSourceFailed(srcUri) {
            if (this._pendingUrl !== srcUri)
                return;
            this._pendingUrl = null;
            this._watchedUrl = null;
            this._loadedSource = null;
            this._failedAt.set(srcUri, Date.now());
            this._resetLayers();
        }

        // --- renderizado CSS -------------------------------------------------

        _updateRootStyle() {
            const r = Math.min(this.roundness, Math.max(this._size / 2, 1));
            this.set_style(
                `border-radius: ${r}px; background-color: transparent;`
            );
        }

        _refreshLayer(layer) {
            const url = layer._bgUrl;
            const bg = url
                ? `background-image: url("${url}"); background-size: cover;`
                : '';
            const r = this.roundness;
            const css = `border-radius: ${r}px; ${bg}`;
            if (layer._lastCss === css)
                return;
            layer._lastCss = css;
            layer.set_style(css);
        }

        _updateLayersStyle() {
            this.get_children().forEach(layer => this._refreshLayer(layer));
        }

        _showLayer(uri, force = false) {
            if (!uri)
                return;
            // Sin force, re-resolver la misma fuente no genera una capa nueva
            // (ni el monitor ni el reintento pueden provocar parpadeo).
            //
            // Con force se crea una capa nueva aunque la URI sea idéntica: es
            // lo que necesita el desbloqueo de pantalla. St cachea la textura
            // del background-image dentro del StThemeNode y solo la invalida
            // por cambio de archivo o de allocation, nunca por un reset del
            // compositor: en el ciclo bloquear/desbloquear ese puntero queda
            // muerto y la capa se pinta negra. Una capa nueva tiene un theme
            // node nuevo (background_texture == NULL) → St vuelve a cargar la
            // textura del cache. Es el mismo camino que ya funciona en las
            // superficies cuyo actor sí se destruye al bloquear (dashboard,
            // dateMenuMedia); el at-a-glance vive en el panel y es el único que
            // lo sobrevive.
            if (!force && this._currentLayerUri === uri)
                return; // ya en pantalla (re-resolución no cambia nada)

            const layer = new St.Widget({
                x_expand: true,
                y_expand: true,
                opacity: 0,
            });
            layer._bgUrl = uri;
            layer._lastCss = null;
            this.add_child(layer);
            this._refreshLayer(layer);
            this._currentLayerUri = uri;

            // Fade de la nueva capa sobre la anterior; al terminar se
            // destruyen las capas viejas. El crossfade por capas queda listo
            // para afinarse (FADE_MS).
            layer.ease({
                opacity: 255,
                duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: (isFinished) => {
                    // Un fade interrumpido (bloqueo de pantalla, destrucción de
                    // la capa) nunca debe dejar la carátula a media opacidad:
                    // si la capa sigue viva, se restaura opaca.
                    const isCurrent = this.get_children().includes(layer);
                    if (isCurrent)
                        layer.opacity = 255;
                    if (!isFinished)
                        return;
                    // El fade de una capa solo limpia si sigue siendo la
                    // vigente (la última añadida). Si mientras tanto otra
                    // resolución creó una capa más nueva, su propio fade se
                    // encargará de eliminar a esta: si ambas limpiaran, se
                    // destruirían mutuamente y podría no quedar ninguna capa
                    // (carátula en negro tras un bloqueo de pantalla).
                    const children = this.get_children();
                    if (isCurrent && children[children.length - 1] === layer) {
                        for (const child of children) {
                            if (child !== layer)
                                child.destroy();
                        }
                    }
                },
            });
        }

        _resetLayers() {
            this._currentLayerUri = null;
            this.get_children().forEach(c => c.destroy());
        }

        // Re-aplica estilos tras cambios de size/roundness (sin re-descargar).
        refreshStyle() {
            this._updateRootStyle();
            this._updateLayersStyle();
        }

        destroy() {
            if (this._watchedUrl)
                _unwatchSource(this._watchedUrl, this);
            super.destroy();
        }

        vfunc_get_preferred_width(forHeight) {
            return [this._size, this._size];
        }

        vfunc_get_preferred_height(forWidth) {
            return [this._size, this._size];
        }
    }
);

export { AlbumArt };
