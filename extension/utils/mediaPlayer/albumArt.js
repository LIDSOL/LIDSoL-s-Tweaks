'use strict';

import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

const LOAD_SIZE = 256;

const CACHE_DIR = GLib.build_filenamev([
    GLib.get_user_cache_dir(),
    'lidsol-widgets',
    'album-art',
]);

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
            this._roundness = null;
            this._currentUrl = null;
            this._pixbuf = null;

            this._canvasArea = new St.DrawingArea({
                x_expand: true,
                y_expand: true,
            });
            this._canvasArea.connect('repaint', () => this._onRepaint());
            this.add_child(this._canvasArea);
        }

        get size() {
            return this._size;
        }

        set size(v) {
            if (v !== this._size) {
                this._size = v;
                this.queue_relayout();
            }
        }

        get roundness() {
            return this._roundness ?? this._size / 2;
        }

        set roundness(v) {
            if (v !== this._roundness) {
                this._roundness = v;
                this._canvasArea.queue_repaint();
            }
        }

        get currentUrl() {
            return this._currentUrl;
        }

        set currentUrl(v) {
            this._currentUrl = v;
        }

        _pixbufFromUrl(url) {
            if (!url)
                return null;
            try {
                let path;
                if (url.startsWith('file://'))
                    path = Gio.File.new_for_uri(url).get_path();
                else
                    path = url;

                if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS))
                    return null;
                return GdkPixbuf.Pixbuf.new_from_file_at_size(path, LOAD_SIZE, LOAD_SIZE);
            } catch (e) {
                return null;
            }
        }

        _downloadToCache(url) {
            if (!url.startsWith('http://') && !url.startsWith('https://'))
                return url;

            GLib.mkdir_with_parents(CACHE_DIR, 0o755);
            const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
            const cachePath = GLib.build_filenamev([CACHE_DIR, hash]);

            if (GLib.file_test(cachePath, GLib.FileTest.EXISTS))
                return `file://${cachePath}`;

            try {
                const request = Gio.HttpRequest.new(url);
                const session = new Gio.HttpSession({ timeout: 10 });
                const response = session.send(request);
                const bytes = response.read_bytes();
                GLib.file_set_contents(cachePath, bytes.toArray());
                return `file://${cachePath}`;
            } catch (e) {
                return url;
            }
        }

        setArt(url, force = false) {
            if (!force && url === this._currentUrl)
                return;
            this._currentUrl = url;

            if (!url) {
                this._pixbuf = null;
                this._canvasArea.queue_repaint();
                return;
            }

            let effectiveUrl = url;
            if (url.startsWith('http://') || url.startsWith('https://'))
                effectiveUrl = this._downloadToCache(url);

            const newPixbuf = this._pixbufFromUrl(effectiveUrl);
            if (newPixbuf)
                this._pixbuf = newPixbuf;

            this._canvasArea.queue_repaint();
        }

        refreshStyle() {
            if (this._currentUrl) {
                const url = this._currentUrl;
                let effectiveUrl = url;
                if (url.startsWith('http://') || url.startsWith('https://'))
                    effectiveUrl = this._downloadToCache(url);
                const newPixbuf = this._pixbufFromUrl(effectiveUrl);
                if (newPixbuf)
                    this._pixbuf = newPixbuf;
                this._canvasArea.queue_repaint();
            } else {
                this._canvasArea.queue_repaint();
            }
        }

        clearArt() {
            this.setArt(null);
        }

        _onRepaint() {
            const cr = this._canvasArea.get_context();
            const w = this._canvasArea.get_width();
            const h = this._canvasArea.get_height();

            if (w < 1 || h < 1 || !this._pixbuf) {
                cr.$dispose();
                return;
            }

            const maxR = Math.min(w, h) / 2;
            const r = Math.min(this.roundness, maxR);

            if (r >= maxR) {
                cr.arc(w / 2, h / 2, maxR, 0, 2 * Math.PI);
            } else {
                const d = Math.PI / 180;
                cr.moveTo(r, 0);
                cr.lineTo(w - r, 0);
                cr.arc(w - r, r, r, -90 * d, 0);
                cr.lineTo(w, h - r);
                cr.arc(w - r, h - r, r, 0, 90 * d);
                cr.lineTo(r, h);
                cr.arc(r, h - r, r, 90 * d, 180 * d);
                cr.lineTo(0, r);
                cr.arc(r, r, r, 180 * d, 270 * d);
            }
            cr.closePath();
            cr.clip();

            const sx = w / this._pixbuf.get_width();
            const sy = h / this._pixbuf.get_height();
            const s = Math.max(sx, sy);
            const ox = (w - this._pixbuf.get_width() * s) / 2;
            const oy = (h - this._pixbuf.get_height() * s) / 2;

            cr.save();
            cr.translate(ox, oy);
            cr.scale(s, s);
            Gdk.cairo_set_source_pixbuf(cr, this._pixbuf, 0, 0);
            cr.paint();
            cr.restore();
            cr.$dispose();
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
