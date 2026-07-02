'use strict';

import { ClockWidget } from './clockWidget.js';

export class BackgroundWidgetsModule {
    constructor() {
        this._widget = null;
    }

    enable(gsettings, extension) {
        this._widget = new ClockWidget(gsettings);
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
    }
}
