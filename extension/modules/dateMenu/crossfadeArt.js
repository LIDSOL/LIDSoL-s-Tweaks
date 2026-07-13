'use strict';

import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

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

        _onRepaint() {
            let cr = this._canvasArea.get_context();
            let w = this._canvasArea.get_width();
            let h = this._canvasArea.get_height();

            if (!this._pixbuf || w < 1 || h < 1) {
                cr.$dispose();
                return;
            }

            try {
                let r = Math.min(w, h) / 2;
                let cx = w / 2;
                let cy = h / 2;
                cr.arc(cx, cy, r, 0, 2 * Math.PI);
                cr.clip();

                let scaleX = w / this._pixbuf.get_width();
                let scaleY = h / this._pixbuf.get_height();
                let s = Math.max(scaleX, scaleY);
                let offsetX = (w - this._pixbuf.get_width() * s) / 2;
                let offsetY = (h - this._pixbuf.get_height() * s) / 2;

                cr.save();
                cr.translate(offsetX, offsetY);
                cr.scale(s, s);
                Gdk.cairo_set_source_pixbuf(cr, this._pixbuf, 0, 0);
                cr.paint();
                cr.restore();
            } catch (e) {
                logError(e, '[CrossfadeArt] repaint error');
            }

            cr.$dispose();
        }

        _loadPixbufForCanvas() {
            this._pixbuf = null;

            let url = this._currentUrl;
            if (!url) {
                this._canvasArea.queue_repaint();
                return;
            }

            try {
                let file = Gio.File.new_for_uri(url);
                let path = file.get_path();
                if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS)) {
                    this._canvasArea.queue_repaint();
                    return;
                }

                let size = Math.max(this.get_width(), this.get_height(), 24);
                this._pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, size, size);
            } catch (e) {
                this._pixbuf = null;
            }

            this._canvasArea.queue_repaint();
        }

        setArt(newUrl, force = false) {
            let children = this.get_children();
            let cssChildren = children.slice(1);

            if (!force && cssChildren.length > 0 && cssChildren[cssChildren.length - 1]._bgUrl === newUrl)
                return;

            this._currentUrl = newUrl;
            this._updateContainerStyle();
            this._loadPixbufForCanvas();

            cssChildren.forEach(c => { c.remove_all_transitions(); c.destroy(); });

            let newLayer = new St.Widget({
                x_expand: true,
                y_expand: true,
                opacity: 0,
            });
            newLayer._bgUrl = newUrl;

            this.add_child(newLayer);
            this._refreshLayerStyle(newLayer);

            newLayer.ease({
                opacity: 255,
                duration: 1800,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: (isFinished) => {
                    if (!isFinished) return;

                    newLayer.opacity = 255;

                    let curChildren = this.get_children();
                    let myIndex = curChildren.indexOf(newLayer);
                    for (let i = 1; i < myIndex; i++) {
                        let oldLayer = curChildren[i];
                        oldLayer.ease({
                            opacity: 0,
                            duration: 300,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            onStopped: () => oldLayer.destroy(),
                        });
                    }
                },
            });
        }

        _updateContainerStyle() {
            this.set_style(`border-radius: ${this._radius}px; background-color: transparent;`);
        }

        _refreshLayerStyle(layer) {
            if (!layer || !layer.get_parent()) return;
            let url = layer._bgUrl;
            let bgPart = url ? `background-image: url("${url}");` : '';
            let css = `border-radius: ${this._radius}px; background-size: cover; background-position: center; ${bgPart}`;
            if (layer._lastCss === css) return;
            layer._lastCss = css;

            if (layer.get_parent())
                layer.set_style(css);
        }

        refreshStyle() {
            let children = this.get_children();
            for (let i = children.length - 1; i >= 1; i--)
                children[i].destroy();
            this.set_style(`border-radius: ${this._radius}px; background-color: transparent;`);
            this._loadPixbufForCanvas();
        }

        vfunc_get_preferred_width(forHeight) {
            let w = this.get_width();
            if (w > 0) return [w, w];
            return [24, 24];
        }

        vfunc_get_preferred_height(forWidth) {
            let h = this.get_height();
            if (h > 0) return [h, h];
            return [24, 24];
        }
    });
