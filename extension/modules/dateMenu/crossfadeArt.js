'use strict';

import Clutter from 'gi://Clutter';
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
        }

        setArt(newUrl) {
            let children = this.get_children();

            if (children.length > 0 && children[children.length - 1]._bgUrl === newUrl)
                return;

            this._currentUrl = newUrl;
            this._updateContainerStyle();

            this.get_children().forEach(c => c.remove_all_transitions());

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

                    let currentChildren = this.get_children();
                    let myIndex = currentChildren.indexOf(newLayer);
                    if (myIndex > 0) {
                        for (let i = 0; i < myIndex; i++) {
                            let oldLayer = currentChildren[i];
                            oldLayer.ease({
                                opacity: 0,
                                duration: 300,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                                onStopped: () => oldLayer.destroy(),
                            });
                        }
                    }
                },
            });
        }

        _updateContainerStyle() {
            let hasArt = !!this._currentUrl;
            let bgColor = hasArt ? 'background-color: #000000;' : 'background-color: transparent;';
            this.set_style(`border-radius: ${this._radius}px; ${bgColor}`);
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
    });
