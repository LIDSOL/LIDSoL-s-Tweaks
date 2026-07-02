'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ClockWidget } from './clockWidget.js';

export class BackgroundWidgetsModule {
    constructor() {
        this._widget = null;
    }

    enable(gsettings, extension) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            console.warn('[BackgroundWidgets] No primary monitor available');
            return;
        }

        this._widget = new ClockWidget(gsettings);

        const bgGroup = Main.layoutManager._backgroundGroup;
        const container = bgGroup || Main.layoutManager.uiGroup;
        container.add_child(this._widget);
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
    }
}
