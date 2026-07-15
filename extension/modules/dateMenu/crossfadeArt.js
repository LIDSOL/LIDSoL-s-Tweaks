'use strict';

import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

const LOAD_SIZE = 128;

export const CrossfadeArt = GObject.registerClass(
    class CrossfadeArt extends St.Widget {
        _init(radius = 12) {
            super._init({
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: false,
                x_expand: false,
                y_expand: false,
            });
            this._radius = radius;
            this._size = radius * 2;
            this._currentUrl = null;
            this._pixbuf = null;

            this._canvasArea = new St.DrawingArea({
                x_expand: true,
                y_expand: true,
            });
            this._canvasArea.connect('repaint', () => {
                this._onRepaint();
            });
            this.add_child(this._canvasArea);
        }

        _pixbufFromUrl(url) {
            if (!url) return null;
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
                logError(e, '[CrossfadeArt] _pixbufFromUrl');
                return null;
            }
        }

        _onRepaint() {
            let cr = this._canvasArea.get_context();
            let w = this._canvasArea.get_width();
            let h = this._canvasArea.get_height();

            if (w < 1 || h < 1 || !this._pixbuf) {
                cr.$dispose();
                return;
            }

            let r = Math.min(w, h) / 2;
            cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
            cr.clip();

            let scaleX = w / this._pixbuf.get_width();
            let scaleY = h / this._pixbuf.get_height();
            let s = Math.max(scaleX, scaleY);
            let ox = (w - this._pixbuf.get_width() * s) / 2;
            let oy = (h - this._pixbuf.get_height() * s) / 2;

            cr.save();
            cr.translate(ox, oy);
            cr.scale(s, s);
            Gdk.cairo_set_source_pixbuf(cr, this._pixbuf, 0, 0);
            cr.paint();
            cr.restore();
            cr.$dispose();
        }

        setArt(newUrl, force = false) {
            if (!force && this._currentUrl === newUrl)
                return;

            this._currentUrl = newUrl;
            this._updateContainerStyle();

            if (!newUrl) {
                this._pixbuf = null;
                this._canvasArea.queue_repaint();
                return;
            }

            let newPixbuf = this._pixbufFromUrl(newUrl);
            if (newPixbuf) {
                this._pixbuf = newPixbuf;
            }
            this._canvasArea.queue_repaint();
        }

        _updateContainerStyle() {
            this.set_style(`border-radius: ${this._radius}px; width: ${this._size}px; height: ${this._size}px; background-color: transparent;`);
        }

        refreshStyle() {
            this.set_style(`border-radius: ${this._radius}px; width: ${this._size}px; height: ${this._size}px; background-color: transparent;`);
            this._pixbuf = this._pixbufFromUrl(this._currentUrl);
            this._canvasArea.queue_repaint();
        }

        queuePaint() {
            this._canvasArea.queue_repaint();
        }

        vfunc_get_preferred_width(forHeight) {
            let w = this.get_width();
            if (w > 0) return [w, w];
            return [this._size, this._size];
        }

        vfunc_get_preferred_height(forWidth) {
            let h = this.get_height();
            if (h > 0) return [h, h];
            return [this._size, this._size];
        }
    });
