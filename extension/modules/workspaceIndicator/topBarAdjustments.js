import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Settings } from './settings.js';

export class TopBarAdjustments {
    static _instance = null;

    static init() {
        TopBarAdjustments._instance = new TopBarAdjustments();
        TopBarAdjustments._instance._init();
    }

    static destroy() {
        TopBarAdjustments._instance?._destroy();
        TopBarAdjustments._instance = null;
    }

    _init() {
        this._settings = Settings.getInstance();
        this._didHideActivitiesButton = false;

        this._settings.systemWorkspaceIndicator.subscribe((value) => {
            if (value)
                this._restoreSystemWorkspaceIndicator();
            else
                this._hideSystemWorkspaceIndicator();
        }, { emitCurrentValue: true });
    }

    _destroy() {
        this._restoreSystemWorkspaceIndicator();
    }

    _hideSystemWorkspaceIndicator() {
        const activitiesButton = Main.panel.statusArea.activities;
        if (activitiesButton && !Main.sessionMode.isLocked && activitiesButton.is_visible()) {
            activitiesButton.hide();
            this._didHideActivitiesButton = true;
        }
    }

    _restoreSystemWorkspaceIndicator() {
        const activitiesButton = Main.panel.statusArea.activities;
        if (activitiesButton && this._didHideActivitiesButton) {
            activitiesButton.show();
            this._didHideActivitiesButton = false;
        }
    }
}
