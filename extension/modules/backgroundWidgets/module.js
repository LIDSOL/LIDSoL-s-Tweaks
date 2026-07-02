'use strict';

import { ClockWidget } from './clockWidget.js';
import { PictureWidget } from './pictureWidget.js';

export class BackgroundWidgetsModule {
    constructor() {
        this._clockWidget = null;
        this._pictureWidget = null;
        this._watchers = [];
    }

    enable(gsettings, extension) {
        this._gsettings = gsettings;

        if (gsettings.get_boolean('background-clock-enabled'))
            this._clockWidget = new ClockWidget(gsettings);

        if (gsettings.get_boolean('pw-enabled'))
            this._pictureWidget = new PictureWidget(gsettings);

        this._watchers.push(
            gsettings.connect('changed::background-clock-enabled', () => {
                if (gsettings.get_boolean('background-clock-enabled') && !this._clockWidget) {
                    this._clockWidget = new ClockWidget(gsettings);
                } else if (!gsettings.get_boolean('background-clock-enabled') && this._clockWidget) {
                    this._clockWidget.destroy();
                    this._clockWidget = null;
                }
            }),
            gsettings.connect('changed::pw-enabled', () => {
                if (gsettings.get_boolean('pw-enabled') && !this._pictureWidget) {
                    this._pictureWidget = new PictureWidget(gsettings);
                } else if (!gsettings.get_boolean('pw-enabled') && this._pictureWidget) {
                    this._pictureWidget.destroy();
                    this._pictureWidget = null;
                }
            }),
        );
    }

    disable() {
        if (this._clockWidget) {
            this._clockWidget.destroy();
            this._clockWidget = null;
        }
        if (this._pictureWidget) {
            this._pictureWidget.destroy();
            this._pictureWidget = null;
        }
        for (const id of this._watchers)
            this._gsettings.disconnect(id);
        this._watchers = [];
        this._gsettings = null;
    }
}
