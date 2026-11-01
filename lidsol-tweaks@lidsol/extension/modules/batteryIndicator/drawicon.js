import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { PACKAGE_VERSION } from 'resource:///org/gnome/shell/misc/config.js';

const [majorShellVersion] = PACKAGE_VERSION.split('.').map(s => Number(s));

function setContextColor(cr, color) {
    if (majorShellVersion >= 46)
        cr.setSourceColor(color);
    else
        Clutter.cairo_set_source_color(cr, color);
}

export const BatteryCircleIcon = GObject.registerClass(
class BatteryCircleIcon extends St.DrawingArea {
    _init(params = {}) {
        super._init({
            y_align: Clutter.ActorAlign.CENTER,
            ...params
        });
        this._percentage = 0;
        this._charging = false;
        this.connect('style-changed', () => this.queue_repaint());
    }

    set value(v) {
        this._percentage = Math.max(0, Math.min(100, v));
        this.queue_repaint();
    }

    get value() {
        return this._percentage;
    }

    set charging(v) {
        this._charging = !!v;
        this.queue_repaint();
    }

    get charging() {
        return this._charging;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        const themeNode = this.get_theme_node();
        const colors = themeNode.get_icon_colors();
        const strokeW = 2.5;
        const radius = Math.min(w, h) / 2 - strokeW / 2;
        const cx = w / 2;
        const cy = h / 2;
        const p = this._percentage / 100;
        const angleOffset = -Math.PI / 2;

        const isLow = this._percentage <= 5 && !this._charging;

        setContextColor(cr, colors.warning);
        cr.setLineWidth(strokeW);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI);
        cr.stroke();

        const fillColor = this._charging
            ? colors.success
            : isLow ? colors.error : colors.foreground;
        setContextColor(cr, fillColor);

        cr.setLineWidth(strokeW);
        cr.arc(cx, cy, radius, angleOffset, angleOffset + p * 2 * Math.PI);
        cr.stroke();

        if (this._charging) {
            setContextColor(cr, colors.success);
            this._drawBolt(cr, cx, cy, radius);
        } else if (isLow) {
            setContextColor(cr, colors.error);
            this._drawExclamation(cr, cx, cy, radius);
        }

        cr.$dispose();
    }

    _drawBolt(cr, cx, cy, radius) {
        const s = radius * 0.5;
        cr.moveTo(cx + s * 0.2, cy - s);
        cr.lineTo(cx - s * 0.3, cy + s * 0.1);
        cr.lineTo(cx + s * 0.1, cy + s * 0.1);
        cr.lineTo(cx - s * 0.2, cy + s);
        cr.lineTo(cx + s * 0.3, cy - s * 0.1);
        cr.lineTo(cx - s * 0.1, cy - s * 0.1);
        cr.closePath();
        cr.fill();
    }

    _drawExclamation(cr, cx, cy, radius) {
        cr.setLineWidth(2);
        const s = radius * 0.5;
        cr.moveTo(cx, cy - s);
        cr.lineTo(cx, cy + s * 0.3);
        cr.stroke();
        cr.arc(cx, cy + s * 0.7, 1.5, 0, 2 * Math.PI);
        cr.fill();
    }
});
