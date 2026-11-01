import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { PACKAGE_VERSION } from 'resource:///org/gnome/shell/misc/config.js';
import { BatteryCircleIcon } from './drawicon.js';

const [majorVer] = PACKAGE_VERSION.split('.').map(s => Number(s));

const _rgbaPat = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/;
const _hexPat = /#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/;

function parseRGBA(css) {
    if (!css) return null;
    const m = css.match(_rgbaPat);
    if (m) {
        return [
            parseInt(m[1]) / 255,
            parseInt(m[2]) / 255,
            parseInt(m[3]) / 255,
            m[4] !== undefined ? parseFloat(m[4]) : 1,
        ];
    }
    const h = css.match(_hexPat);
    if (h) {
        return [
            parseInt(h[1], 16) / 255,
            parseInt(h[2], 16) / 255,
            parseInt(h[3], 16) / 255,
            h[4] ? parseInt(h[4], 16) / 255 : 1,
        ];
    }
    return null;
}

function roundedRect(cr, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.moveTo(x + r, y);
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

const BatteryLevelBar = GObject.registerClass(
class BatteryLevelBar extends St.DrawingArea {
    _init(params = {}) {
        super._init({
            y_align: Clutter.ActorAlign.CENTER,
            ...params,
        });
        this._pct = 0;
        this._fillRGBA = [1, 1, 1, 0.8];
        this._bgRGBA = [1, 1, 1, 0.15];
        this._radius = 7;
    }

    set percentage(v) {
        this._pct = Math.max(0, Math.min(1, v));
        this.queue_repaint();
    }

    setBarSize(w, h, r) {
        this.width = w;
        this.height = h;
        this._radius = r;
        this.queue_repaint();
    }

    setFillColor(css) {
        const p = parseRGBA(css);
        if (p) this._fillRGBA = p;
    }

    setBgColor(css) {
        const p = parseRGBA(css);
        if (p) this._bgRGBA = p;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        if (w < 1 || h < 1) return;

        const r = Math.min(this._radius, w / 2, h / 2);
        const [r1, g1, b1, a1] = this._bgRGBA;
        const [r2, g2, b2, a2] = this._fillRGBA;

        roundedRect(cr, 0, 0, w, h, r);
        cr.setSourceRGBA(r1, g1, b1, a1);
        cr.fill();

        const fillW = Math.max(r * 2, w * this._pct);
        if (fillW > 0) {
            cr.save();
            roundedRect(cr, 0, 0, fillW, h, r);
            cr.clip();
            roundedRect(cr, 0, 0, w, h, 0);
            cr.setSourceRGBA(r2, g2, b2, a2);
            cr.fill();
            cr.restore();
        }

        if (majorVer >= 46)
            cr.$dispose();
    }
});

export const BatteryIndicatorWidget = GObject.registerClass(
class BatteryIndicatorWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'lidsol-battery-indicator',
        });
        this._settings = settings;

        this._circle = null;
        this._bar = null;
        this._label = null;

        this._build();

        this._settings.connectObject(
            'changed::bi-top-bar-style', () => this._rebuild(),
            'changed::bi-show-percentage', () => this._rebuild(),
            'changed::bi-bar-width', () => this._updateBarSettings(),
            'changed::bi-bar-height', () => this._updateBarSettings(),
            'changed::bi-bar-radius', () => this._updateBarSettings(),
            'changed::bi-bg-color', () => this._updateBarSettings(),
            this
        );
        this.connect('destroy', () => this._settings.disconnectObject(this));
    }

    _rebuild() {
        if (this._circle) { this._circle.destroy(); this._circle = null; }
        if (this._bar) { this._bar.destroy(); this._bar = null; }
        if (this._label) { this._label.destroy(); this._label = null; }
        this._build();
    }

    _build() {
        const style = this._settings.get_string('bi-top-bar-style');

        if (style === 'circle' || style === 'both') {
            this._circle = new BatteryCircleIcon({
                style_class: 'lidsol-bi-circle',
                width: 18, height: 18,
            });
        }

        if (style === 'bar' || style === 'both') {
            this._bar = new BatteryLevelBar({ style_class: 'lidsol-bi-bar' });
            this._updateBarSettings();
        }

        if (this._settings.get_boolean('bi-show-percentage'))
            this._label = new St.Label({
                style_class: 'lidsol-bi-label',
                y_align: Clutter.ActorAlign.CENTER,
            });

        if (this._circle) this.add_child(this._circle);
        if (this._bar) this.add_child(this._bar);
        if (this._label) this.add_child(this._label);
    }

    _updateBarSettings() {
        if (!this._bar) return;
        const w = this._settings.get_int('bi-bar-width');
        const h = this._settings.get_int('bi-bar-height');
        const r = this._settings.get_int('bi-bar-radius');
        const bg = this._settings.get_string('bi-bg-color');
        this._bar.setBarSize(w, h, r);
        this._bar.setBgColor(bg || 'rgba(255,255,255,0.15)');
    }

    sync(proxy) {
        if (!proxy || proxy.IsPresent === false) {
            this.hide();
            return;
        }
        this.show();

        const charging = proxy.State === 1 || proxy.State === 4 || proxy.State === 5;
        const pct = proxy.Percentage;

        if (this._circle) {
            this._circle.value = pct;
            this._circle.charging = charging;
        }

        if (this._bar) {
            this._bar.percentage = pct / 100;
            const isLow = pct <= this._settings.get_int('bi-low-threshold');
            const color = charging
                ? this._settings.get_string('bi-charging-color')
                : isLow ? this._settings.get_string('bi-low-color')
                : this._settings.get_string('bi-color');
            this._bar.setFillColor(color || (
                charging ? 'rgba(52,211,153,1)' : isLow ? 'rgba(239,68,68,1)' : 'rgba(255,255,255,0.8)'
            ));
        }

        if (this._label)
            this._label.text = `${Math.round(pct)}%`;
    }
});
