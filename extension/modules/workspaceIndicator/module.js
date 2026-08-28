'use strict';

import { Settings } from './settings.js';
import { Workspaces } from './workspaces.js';
import { KeyBindings } from './keyBindings.js';
import { Styles } from './styles.js';
import { WorkspacesBar } from './workspacesBar.js';
import { ScrollHandler } from './scrollHandler.js';
import { destroyAllHooks } from './hook.js';

export class WorkspaceIndicatorModule {
    constructor() {
        this._workspacesBar = null;
        this._scrollHandler = null;
        this._gsettings = null;
        this._extension = null;
    }

    enable(gsettings, extension) {
        this._gsettings = gsettings;
        this._extension = extension;
        Settings.init(gsettings);
        Workspaces.init();
        KeyBindings.init();
        Styles.init();
        this._workspacesBar = new WorkspacesBar(this._extension);
        this._workspacesBar.init();
        this._scrollHandler = new ScrollHandler();
        this._scrollHandler.init(this._workspacesBar.observeWidget());
    }

    disable() {
        destroyAllHooks();
        Settings.destroy();
        Workspaces.destroy();
        KeyBindings.destroy();
        Styles.destroy();
        this._scrollHandler?.destroy();
        this._scrollHandler = null;
        this._workspacesBar?.destroy();
        this._workspacesBar = null;
    }
}

export default WorkspaceIndicatorModule;
