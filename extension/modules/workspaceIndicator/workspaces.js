import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WindowManager } from 'resource:///org/gnome/shell/ui/windowManager.js';
import { DebouncingNotifier } from './debouncingNotifier.js';
import { Subject } from './subject.js';
import { hook } from './hook.js';
import { Settings } from './settings.js';
import { WorkspaceNames } from './workspaceNames.js';

function getWindows(workspace) {
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
    return windows
        .map((w) => (w.is_attached_dialog() ? w.get_transient_for() : w))
        .filter((w, i, a) => !w.skipTaskbar && a.indexOf(w) === i);
}

function getNumberOfWindows(workspace) {
    const windows = workspace.list_windows();
    return windows.filter((window) => !window.is_on_all_workspaces()).length;
}

export class Workspaces {
    static _instance = null;

    static init() {
        Workspaces._instance = new Workspaces();
        Workspaces._instance._init();
    }

    static destroy() {
        Workspaces._instance?._destroy();
        Workspaces._instance = null;
    }

    static getInstance() {
        return Workspaces._instance;
    }

    _init() {
        this.numberOfEnabledWorkspaces = 0;
        this.lastVisibleWorkspace = 0;
        this.currentIndex = 0;
        this.workspaces = [];
        this._previousWorkspace = 0;
        this._metaWorkspaces = [];
        this._ws_changed = null;
        this._ws_reordered = null;
        this._ws_active_changed = null;
        this._windows_changed = null;
        this._settings = Settings.getInstance();
        this._wsNames = null;
        this._updateNotifier = new DebouncingNotifier(0);
        this._smartNamesNotifier = new DebouncingNotifier();
        this._windowChangedListeners = [];

        this._wsNames = WorkspaceNames.init(this);
        this._ws_reordered = global.workspace_manager.connect('workspaces-reordered', () => {
            this._update('workspaces-changed', 'workspace_manager workspaces-reordered');
        });
        this._ws_changed = global.workspace_manager.connect('notify::n-workspaces', () => {
            this._update('workspaces-changed', 'workspace_manager n-workspaces');
        });
        this._ws_active_changed = global.workspace_manager.connect('active-workspace-changed', () => {
            this._previousWorkspace = this.currentIndex;
            this._update('active-workspace-changed', 'workspace_manager active-workspace-changed');
            this._smartNamesNotifier.notify();
        });
        this._windows_changed = Shell.WindowTracker.get_default().connect('tracked-windows-changed', () => {
            this._update('windows-changed', 'WindowTracker tracked-windows-changed');
            this._smartNamesNotifier.notify();
        });

        this._settings.dynamicWorkspaces.subscribe(() =>
            this._update('workspaces-changed', 'settings dynamicWorkspaces'),
        );
        this._settings.workspaceNames.subscribe(() =>
            this._update('workspace-names-changed', 'settings workspaceNames'),
        );
        this._settings.showEmptyWorkspaces.subscribe(() =>
            this._update('workspaces-changed', 'settings showEmptyWorkspaces'),
        );

        hook(WindowManager, 'insertWorkspace', 'before', (_, pos) => {
            if (this._settings.dynamicWorkspaces.value)
                this._wsNames?.insert(pos);
        });

        this._update('init', 'init');

        this._settings.smartWorkspaceNames.subscribe((value) => {
            if (value) this._clearEmptyWorkspaceNames();
        }, { emitCurrentValue: true });
        this._settings.smartWorkspaceNames.subscribe(() => this._updateWindowAddedListeners());
        this._settings.reevaluateSmartWorkspaceNames.subscribe(() => this._updateWindowAddedListeners());
        this._smartNamesNotifier.subscribe(() => this._updateSmartWorkspaceNames());
    }

    _destroy() {
        this._wsNames = null;
        if (this._ws_changed)
            global.workspace_manager.disconnect(this._ws_changed);
        if (this._ws_reordered)
            global.workspace_manager.disconnect(this._ws_reordered);
        if (this._ws_active_changed)
            global.workspace_manager.disconnect(this._ws_active_changed);
        if (this._windows_changed)
            Shell.WindowTracker.get_default().disconnect(this._windows_changed);
        this._updateNotifier.destroy();
        this._smartNamesNotifier.destroy();
        this._windowChangedListeners.forEach((entry) => entry.workspace.disconnect(entry.listener));
    }

    onUpdate(callback, until) {
        this._updateNotifier.subscribe(callback, until);
    }

    switchTo(index, cause) {
        const isCurrent = global.workspace_manager.get_active_workspace_index() === index;
        if (isCurrent) {
            if (this._settings.backAndForth.value && (cause === 'keyboard-shortcut' || this._settings.toggleOverview.value === false)) {
                this.activatePrevious();
            } else if (cause === 'keyboard-shortcut' && this.workspaces[index].hasWindows && global.display.get_focus_window().is_on_all_workspaces()) {
                const workspace = global.workspace_manager.get_workspace_by_index(index);
                this.focusMostRecentWindowOnWorkspace(workspace);
            } else if (this._settings.toggleOverview.value) {
                Main.overview.toggle();
            }
        } else {
            this.activate(index);
        }
    }

    activate(index) {
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (workspace) {
            if (!Main.overview.visible && !this.workspaces[index].hasWindows && this._settings.toggleOverview.value)
                Main.overview.show();
            workspace.activate(global.get_current_time());
            this.focusMostRecentWindowOnWorkspace(workspace);
        }
    }

    activatePrevious() {
        this.activate(this._previousWorkspace);
    }

    addWorkspace() {
        if (this._settings.dynamicWorkspaces.value)
            this.activate(this.numberOfEnabledWorkspaces - 1);
        else
            this._addStaticWorkspace();
    }

    activateEmptyOrAdd() {
        const index = this.workspaces.findIndex((ws) => ws.isEnabled && !ws.hasWindows);
        if (index >= 0)
            this.activate(index);
        else
            this._addStaticWorkspace();
    }

    _addStaticWorkspace() {
        global.workspace_manager.append_new_workspace(true, global.get_current_time());
    }

    removeWorkspace(index) {
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (workspace)
            global.workspace_manager.remove_workspace(workspace, global.get_current_time());
    }

    reorderWorkspace(oldIndex, newIndex) {
        const workspace = global.workspace_manager.get_workspace_by_index(oldIndex);
        if (workspace)
            global.workspace_manager.reorder_workspace(workspace, newIndex);
    }

    moveCurrentWorkspace(direction) {
        const newIndex = this.currentIndex + direction;
        if (newIndex >= 0 && newIndex < this.numberOfEnabledWorkspaces)
            this.reorderWorkspace(this.currentIndex, newIndex);
    }

    getDisplayName(workspace) {
        if (this.isExtraDynamicWorkspace(workspace))
            return '+';
        if (this._settings.enableCustomLabel.value)
            return this.getCustomDisplayName(workspace);
        return this.getDefaultDisplayName(workspace);
    }

    getDefaultDisplayName(workspace) {
        if (workspace.name && !this._settings.alwaysShowNumbers.value)
            return workspace.name;
        const num = `${workspace.index + 1}`;
        return workspace.name ? `${num}: ${workspace.name}` : num;
    }

    getCustomDisplayName(workspace) {
        const template = workspace.name ? this._settings.customLabelNamed.value : this._settings.customLabelUnnamed.value;
        let total = this.numberOfEnabledWorkspaces;
        if (this._settings.dynamicWorkspaces.value && this.currentIndex !== this.numberOfEnabledWorkspaces - 1)
            total = this.numberOfEnabledWorkspaces - 1;
        let displayName = template
            .replaceAll('{{name}}', workspace.name ?? '')
            .replaceAll('{{number}}', `${workspace.index + 1}`)
            .replaceAll('{{total}}', `${total}`)
            .replaceAll('{{Total}}', `${this.numberOfEnabledWorkspaces}`);
        if (this._settings.alwaysShowNumbers.value && !template.includes('{{number}}'))
            return `${workspace.index + 1}: ${displayName}`;
        return displayName;
    }

    focusMostRecentWindowOnWorkspace(workspace) {
        const mostRecent = getWindows(workspace).find((w) => !w.is_on_all_workspaces());
        if (mostRecent)
            workspace.activate_with_focus(mostRecent, global.get_current_time());
    }

    findVisibleWorkspace(step, { wraparound = false } = {}) {
        let index = this.currentIndex;
        const startingIndex = index;
        while (true) {
            index += step;
            if (index < 0 || index >= this.numberOfEnabledWorkspaces) {
                if (wraparound) {
                    if (index === startingIndex)
                        return null;
                    index = (index + this.numberOfEnabledWorkspaces) % this.numberOfEnabledWorkspaces;
                } else {
                    break;
                }
            }
            if (this.workspaces[index].isVisible)
                return index;
        }
        return null;
    }

    isExtraDynamicWorkspace(workspace) {
        return (
            this._settings.dynamicWorkspaces.value &&
            workspace.index > 0 &&
            workspace.index === this.numberOfEnabledWorkspaces - 1 &&
            !workspace.hasWindows &&
            this.currentIndex !== workspace.index
        );
    }

    _update(reason, source) {
        this.numberOfEnabledWorkspaces = global.workspace_manager.get_n_workspaces();
        this.currentIndex = global.workspace_manager.get_active_workspace_index();
        if (this._settings.dynamicWorkspaces.value && !this._settings.showEmptyWorkspaces.value && this.currentIndex !== this.numberOfEnabledWorkspaces - 1)
            this.lastVisibleWorkspace = this.numberOfEnabledWorkspaces - 2;
        else
            this.lastVisibleWorkspace = this.numberOfEnabledWorkspaces - 1;
        const numTracked = Math.max(this.numberOfEnabledWorkspaces, this._settings.workspaceNames.value.length);
        this.workspaces = [...Array(numTracked)].map((_, index) => this._getWorkspaceState(index));
        this._updateNotifier.notify();
        if (reason === 'workspaces-changed' || reason === 'init')
            this._handleWorkspacesReordered();
        if (reason === 'workspaces-changed' || reason === 'workspace-names-changed' || reason === 'init')
            this._updateWindowAddedListeners();
    }

    _handleWorkspacesReordered() {
        const newMeta = this._getMetaWorkspaces();
        const reorderMap = [];
        let hasReordered = false;
        for (const [index, metaWs] of newMeta.entries()) {
            const oldIndex = this._metaWorkspaces.indexOf(metaWs);
            reorderMap[index] = oldIndex;
            if (oldIndex !== -1 && oldIndex !== index)
                hasReordered = true;
        }
        if (hasReordered)
            this._wsNames?.reorder(reorderMap);
        this._metaWorkspaces = newMeta;
    }

    _getMetaWorkspaces() {
        return Array.from({ length: this.numberOfEnabledWorkspaces }, (_, i) =>
            global.workspace_manager.get_workspace_by_index(i),
        );
    }

    _updateWindowAddedListeners() {
        const needsListeners = this._settings.smartWorkspaceNames.value;
        for (const workspace of this.workspaces) {
            const hasListener = this._windowChangedListeners.some((e) => e.workspace.index() === workspace.index);
            if (needsListeners && !hasListener) {
                const metaWs = global.workspace_manager.get_workspace_by_index(workspace.index);
                if (metaWs) {
                    const lAdded = metaWs.connect('window-added', () => {
                        this._update('windows-changed', 'Workspace window-added');
                        this._updateSmartWorkspaceNames();
                    });
                    this._windowChangedListeners.push({ workspace: metaWs, listener: lAdded });
                    if (this._settings.reevaluateSmartWorkspaceNames.value) {
                        const lRemoved = metaWs.connect('window-removed', () => {
                            this._update('windows-changed', 'Workspace window-removed');
                            this._updateSmartWorkspaceNames();
                        });
                        this._windowChangedListeners.push({ workspace: metaWs, listener: lRemoved });
                    }
                }
            }
        }
        let removed = false;
        this._windowChangedListeners.forEach((entry, arrayIndex) => {
            const ws = this.workspaces[entry.workspace.index()];
            if (!needsListeners || !ws || (ws.name && !this._settings.reevaluateSmartWorkspaceNames.value) || !ws.isEnabled) {
                entry.workspace.disconnect(entry.listener);
                delete this._windowChangedListeners[arrayIndex];
                removed = true;
            }
        });
        if (removed)
            this._windowChangedListeners = this._windowChangedListeners.filter((e) => e != null);
    }

    _updateSmartWorkspaceNames() {
        if (!this._settings.smartWorkspaceNames.value)
            return;
        for (const workspace of this.workspaces) {
            if (this._settings.reevaluateSmartWorkspaceNames.value && workspace.name && !this._wsNames.workspaceNameIsSupportedByWindows(workspace)) {
                this._wsNames.rename(workspace.index, '');
                workspace.name = '';
            }
            if (workspace.hasWindows && !workspace.name)
                this._wsNames.restoreSmartWorkspaceName(workspace.index);
            if (this.isExtraDynamicWorkspace(workspace))
                this._wsNames.remove(workspace.index);
        }
    }

    _clearEmptyWorkspaceNames() {
        for (const workspace of this.workspaces) {
            if ((!workspace.isEnabled || this.isExtraDynamicWorkspace(workspace)) && typeof workspace.name === 'string')
                this._wsNames.remove(workspace.index);
            else if (!workspace.hasWindows && workspace.name)
                this._wsNames.rename(workspace.index, '');
        }
    }

    _getWorkspaceState(index) {
        if (index < this.numberOfEnabledWorkspaces) {
            const workspace = global.workspace_manager.get_workspace_by_index(index);
            const hasWindows = getNumberOfWindows(workspace) > 0;
            return {
                isEnabled: true,
                isVisible: hasWindows || this._getIsEmptyButVisible(index),
                hasWindows,
                index,
                name: this._settings.workspaceNames.value[index],
            };
        }
        return {
            isEnabled: false,
            isVisible: false,
            hasWindows: false,
            index,
            name: this._settings.workspaceNames.value[index],
        };
    }

    _getIsEmptyButVisible(index) {
        if (index === this.currentIndex)
            return true;
        if (this._settings.dynamicWorkspaces.value && !this._settings.showEmptyWorkspaces.value)
            return false;
        return this._settings.showEmptyWorkspaces.value;
    }
}
