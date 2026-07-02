'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DesktopWidget = GObject.registerClass(
class DesktopWidget extends St.Widget {
    _init(settings) {
        super._init({ reactive: false });

        this._settings = settings;

        this._addToBackgroundGroup();
        this._setupOverviewFade();

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _addToBackgroundGroup() {
        const bgGroup = Main.layoutManager._backgroundGroup;
        const container = bgGroup || Main.layoutManager.uiGroup;
        container.add_child(this);
    }

    _setupOverviewFade() {
        const controls = Main.overview?._overview?._controls;
        if (!controls)
            return;

        this._stateAdjustment = controls._stateAdjustment;
        if (!this._stateAdjustment)
            return;

        this._stateSignalId = this._stateAdjustment.connect('notify::value', () => {
            this.opacity = 255 * (1 - this._stateAdjustment.value);
        });
    }

    _removeOverviewFade() {
        if (this._stateSignalId && this._stateAdjustment) {
            this._stateAdjustment.disconnect(this._stateSignalId);
            this._stateSignalId = 0;
            this._stateAdjustment = null;
        }
    }

    _onDestroy() {
        this._removeOverviewFade();
    }
});

export { DesktopWidget };
