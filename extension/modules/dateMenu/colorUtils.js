'use strict';

import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

export function getAverageColor(pixbuf) {
    let w = pixbuf.get_width();
    let h = pixbuf.get_height();
    let pixels = pixbuf.get_pixels();
    let rowstride = pixbuf.get_rowstride();
    let n_channels = pixbuf.get_n_channels();
    let r = 0, g = 0, b = 0, count = 0;

    for (let y = 0; y < h; y += 20) {
        for (let x = 0; x < w; x += 20) {
            let idx = y * rowstride + x * n_channels;
            r += pixels[idx];
            g += pixels[idx + 1];
            b += pixels[idx + 2];
            count++;
        }
    }

    return {
        r: Math.floor(r / count),
        g: Math.floor(g / count),
        b: Math.floor(b / count),
    };
}

export function getClosestGnomeAccent(r, g, b) {
    let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
    let max = Math.max(rNorm, gNorm, bNorm);
    let min = Math.min(rNorm, gNorm, bNorm);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
            case gNorm: h = (bNorm - rNorm) / d + 2; break;
            case bNorm: h = (rNorm - gNorm) / d + 4; break;
        }
        h *= 60;
    }

    s *= 100;
    l *= 100;

    if (s < 15 || l < 15 || l > 90) return 'slate';

    const presets = {
        'red': 0,
        'orange': 30,
        'yellow': 50,
        'green': 120,
        'teal': 170,
        'blue': 210,
        'purple': 280,
        'pink': 330,
    };

    let closest = 'blue';
    let minDistance = Infinity;

    for (const [name, targetHue] of Object.entries(presets)) {
        let diff = Math.abs(h - targetHue);
        let distance = Math.min(diff, 360 - diff);
        if (distance < minDistance) {
            minDistance = distance;
            closest = name;
        }
    }

    let redDiff = Math.abs(h - 360);
    if (redDiff < minDistance)
        closest = 'red';

    return closest;
}

export function loadColorFromArt(artUrl, callback) {
    if (!artUrl) return;

    let file = Gio.File.new_for_uri(artUrl);

    file.load_contents_async(null, (f, res) => {
        try {
            let [ok, bytes] = f.load_contents_finish(res);
            if (!ok) return;

            let stream = Gio.MemoryInputStream.new_from_bytes(bytes);

            GdkPixbuf.Pixbuf.new_from_stream_async(stream, null, (source, pixRes) => {
                try {
                    let pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(pixRes);
                    if (!pixbuf) return;

                    let color = getAverageColor(pixbuf);
                    pixbuf = null;
                    if (callback) callback(color);
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.debug('[DateMenu] Failed to decode art pixbuf:', e.message);
                }
            });
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.debug('[DateMenu] Failed to load art file:', e.message);
        }
    });
}
