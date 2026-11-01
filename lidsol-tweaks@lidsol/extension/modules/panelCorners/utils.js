'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Cogl from 'gi://Cogl';

export function lookupForLength(node, prop, settings) {
    const useExtensionValues = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (useExtensionValues)
        lookup = node.lookup_length(prop, false);

    if (useExtensionValues || !lookup[0]) {
        const scaleFactor =
            St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const length = settings.getProperty(prop.slice(1)).get();

        return length * scaleFactor;
    } else {
        return lookup[1];
    }
}

export function lookupForDouble(node, prop, settings) {
    const useExtensionValues = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (useExtensionValues)
        lookup = node.lookup_double(prop, false);

    if (useExtensionValues || !lookup[0]) {
        return settings.getProperty(prop.slice(1)).get();
    } else {
        return lookup[1];
    }
}

export function lookupForColor(node, prop, settings) {
    const useExtensionValues = node && settings.FORCE_EXTENSION_VALUES.get();

    let lookup = [];
    if (useExtensionValues)
        lookup = node.lookup_color(prop, false);

    if (useExtensionValues || !lookup[0]) {
        const colorStr = settings.getProperty(prop.slice(1)).get();
        let colorParsed = Clutter.Color ?
            Clutter.color_from_string(colorStr) :
            Cogl.color_from_string(colorStr);

        if (colorParsed[0]) {
            return colorParsed[1];
        } else {
            settings.getProperty(prop.slice(1)).set('#000000ff');

            return Clutter.Color ?
                Clutter.color_from_string('#000000ff')[1] :
                Cogl.color_from_string('#000000ff')[1];
        }
    } else {
        return lookup[1];
    }
}
