import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Settings } from './settings.js';
import { Workspaces } from './workspaces.js';

const scrollWheelDirectionOptions = {
    normal: 'Normal',
    inverted: 'Inverted',
    disabled: 'Disabled',
};

export class ScrollHandler {
    constructor() {
        this._ws = Workspaces.getInstance();
        this._settings = Settings.getInstance();
        this._disconnectBinding = null;
        this._lastScrollTime = 0;
        this._panelButton = null;
    }

    init(panelButtonSubject) {
        panelButtonSubject.subscribe((panelButton) => (this._panelButton = panelButton));
        const panelButtonCallback = (panelButton) => this._registerScroll(panelButton);
        this._settings.scrollWheel.subscribe((value) => {
            panelButtonSubject.unsubscribe(panelButtonCallback);
            this._disconnectBinding?.();
            switch (value) {
                case 'panel':
                    this._registerScroll(Main.panel);
                    break;
                case 'workspaces-bar':
                    panelButtonSubject.subscribe(panelButtonCallback);
                    break;
                case 'disabled':
                    this._disconnectBinding = null;
                    break;
            }
        }, { emitCurrentValue: true });
    }

    destroy() {
        this._disconnectBinding?.();
        this._disconnectBinding = null;
    }

    _registerScroll(widget) {
        const scrollBinding = widget.connect('scroll-event', (actor, event) => this._handle_scroll(actor, event));
        this._disconnectBinding = () => widget.disconnect(scrollBinding);
    }

    _debounceTimeExceeded() {
        if (!this._settings.scrollWheelDebounce.value)
            return true;
        const debounceTime = this._settings.scrollWheelDebounceTime.value;
        const now = Date.now();
        if (now >= this._lastScrollTime + debounceTime) {
            this._lastScrollTime = now;
            return true;
        }
        return false;
    }

    _handle_scroll(actor, event) {
        let direction;
        let directionSetting = null;
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                direction = -1;
                directionSetting = this._settings.scrollWheelVertical.value;
                break;
            case Clutter.ScrollDirection.DOWN:
                direction = 1;
                directionSetting = this._settings.scrollWheelVertical.value;
                break;
            case Clutter.ScrollDirection.LEFT:
                direction = -1;
                directionSetting = this._settings.scrollWheelHorizontal.value;
                break;
            case Clutter.ScrollDirection.RIGHT:
                direction = 1;
                directionSetting = this._settings.scrollWheelHorizontal.value;
                break;
        }
        let newIndex;
        if (directionSetting && directionSetting !== 'disabled') {
            const invertFactor = directionSetting === 'inverted' ? -1 : 1;
            newIndex = this._ws.findVisibleWorkspace((direction * invertFactor), {
                wraparound: this._settings.scrollWheelWrapAround.value,
            });
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        if (newIndex !== null && this._debounceTimeExceeded()) {
            const workspace = global.workspace_manager.get_workspace_by_index(newIndex);
            if (workspace) {
                workspace.activate(global.get_current_time());
                this._ws.focusMostRecentWindowOnWorkspace(workspace);
            }
        }
        return Clutter.EVENT_STOP;
    }
}
