import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js';
import { Settings } from './settings.js';
import { Styles } from './styles.js';
import { Workspaces } from './workspaces.js';
import { Subject } from './subject.js';
import { Timeout } from './timeout.js';
import { WorkspacesBarMenu } from './workspacesBarMenu.js';

const MAX_CLICK_TIME_DELTA = 300;
const LONG_PRESS_DURATION = 500;

const WorkspacesButton = GObject.registerClass(
    class WorkspacesButton extends PanelMenu.Button {
        vfunc_event() {
            return Clutter.EVENT_PROPAGATE;
        }
    },
);

function getDropIndex(draggedWs, workspace) {
    return draggedWs.index < workspace.index ? workspace.index - 1 : workspace.index;
}

function getHorizontalCenter(widget) {
    return widget.get_x() + widget.get_width() / 2;
}

class WorkspaceBoxDragHandler {
    constructor(workspace) {
        this._workspace = workspace;
    }

    acceptDrop(source) {
        if (source instanceof WindowPreview)
            source.metaWindow.change_workspace_by_index(this._workspace.index, false);
    }

    handleDragOver(source) {
        return source instanceof WindowPreview ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE;
    }
}

class WorkspacesBarDragHandler {
    constructor(updateWorkspaces) {
        this.wsBoxes = [];
        this._updateWorkspacesCb = updateWorkspaces;
        this._ws = Workspaces.getInstance();
        this._dragMonitor = null;
        this._draggedWorkspace = null;
        this._wsBoxPositions = null;
        this._initialDropPosition = null;
        this._barWidthAtDragStart = null;
        this._hasLeftInitialPosition = false;
        this._workspacesBarOffset = null;
    }

    destroy() {
        this._setDragMonitor(false);
    }

    setupDnd(wsBox, workspace, hooks) {
        const draggable = DND.makeDraggable(wsBox, {});
        draggable.connect('drag-begin', () => {
            this._onDragStart(wsBox, workspace);
            hooks.onDragStart();
            return undefined;
        });
        draggable.connect('drag-cancelled', () => {
            this._updateDragPlaceholder(this._initialDropPosition);
            this._onDragFinished(wsBox);
            return undefined;
        });
        draggable.connect('drag-end', () => {
            this._updateWorkspacesCb();
            return undefined;
        });
    }

    acceptDrop(source, actor, x, y) {
        if (source instanceof WorkspaceBoxDragHandler) {
            const dropPosition = this._getDropPosition();
            if (dropPosition && this._draggedWorkspace.index !== dropPosition.index)
                this._ws.reorderWorkspace(this._draggedWorkspace.index, dropPosition.index);
            this._updateWorkspacesCb();
            this._onDragFinished(actor);
            return true;
        }
        return false;
    }

    handleDragOver(source) {
        if (source instanceof WorkspaceBoxDragHandler) {
            const dropPosition = this._getDropPosition();
            this._updateDragPlaceholder(dropPosition);
        }
        return DND.DragMotionResult.CONTINUE;
    }

    _onDragStart(wsBox, workspace) {
        wsBox.add_style_class_name('dragging');
        this._draggedWorkspace = workspace;
        this._setDragMonitor(true);
        this._barWidthAtDragStart = this._getBarWidth();
        this._setUpBoxPositions(wsBox, workspace);
    }

    _onDragFinished(wsBox) {
        wsBox.remove_style_class_name('dragging');
        this._draggedWorkspace = null;
        this._wsBoxPositions = null;
        this._initialDropPosition = null;
        this._hasLeftInitialPosition = false;
        this._barWidthAtDragStart = null;
        this._setDragMonitor(false);
    }

    _setDragMonitor(add) {
        if (add) {
            this._dragMonitor = { dragMotion: this._onDragMotion.bind(this) };
            DND.addDragMonitor(this._dragMonitor);
        } else if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
        }
    }

    _onDragMotion(dragEvent) {
        this._updateDragPlaceholder(this._initialDropPosition);
        return DND.DragMotionResult.CONTINUE;
    }

    _setUpBoxPositions(wsBox, workspace) {
        const boxIndex = this.wsBoxes.findIndex((box) => box.workspace === workspace);
        this._wsBoxPositions = this._getWsBoxPositions(boxIndex, wsBox.get_width());
        this._initialDropPosition = this._getDropPosition();
        this._updateDragPlaceholder(this._initialDropPosition);
    }

    _getDropPosition() {
        const draggedWsBox = this.wsBoxes.find(({ workspace }) => workspace === this._draggedWorkspace)?.wsBox;
        for (const { index, center, wsBox } of this._wsBoxPositions) {
            if (draggedWsBox.get_x() < center + this._getWorkspacesBarOffset())
                return { index, wsBox, position: 'before', width: draggedWsBox.get_width() };
        }
        if (this._wsBoxPositions.length > 0) {
            const lastWsBox = this._wsBoxPositions[this._wsBoxPositions.length - 1].wsBox;
            return { index: this._ws.lastVisibleWorkspace, wsBox: lastWsBox, position: 'after', width: draggedWsBox.get_width() };
        }
    }

    _getWsBoxPositions(draggedBoxIndex, draggedBoxWidth) {
        const positions = this.wsBoxes
            .filter(({ workspace }) => workspace !== this._draggedWorkspace)
            .map(({ workspace, wsBox }) => ({
                index: getDropIndex(this._draggedWorkspace, workspace),
                center: getHorizontalCenter(wsBox),
                wsBox,
            }));
        positions.forEach((position, index) => {
            if (index >= draggedBoxIndex)
                position.center -= draggedBoxWidth;
        });
        return positions;
    }

    _updateDragPlaceholder(dropPosition) {
        if (dropPosition?.index === this._initialDropPosition?.index && dropPosition?.position === this._initialDropPosition?.position) {
            if (!this._getHasLeftInitialPosition())
                return;
        } else {
            this._hasLeftInitialPosition = true;
        }
        for (const { wsBox } of this.wsBoxes) {
            if (wsBox === dropPosition?.wsBox) {
                if (dropPosition.position === 'before')
                    wsBox.set_style('margin-left: ' + dropPosition.width + 'px');
                else
                    wsBox.set_style('margin-right: ' + dropPosition.width + 'px');
            } else {
                wsBox.set_style(null);
            }
        }
    }

    _getBarWidth() { return this.wsBoxes[0]?.wsBox.get_parent()?.get_width() ?? 0; }

    _getHasLeftInitialPosition() {
        if (this._hasLeftInitialPosition) return true;
        if (this._barWidthAtDragStart !== this._getBarWidth())
            this._hasLeftInitialPosition = true;
        return this._hasLeftInitialPosition;
    }

    _getWorkspacesBarOffset() {
        if (this._workspacesBarOffset === null) {
            this._workspacesBarOffset = 0;
            let widget = this.wsBoxes[0]?.wsBox.get_parent();
            while (widget) {
                this._workspacesBarOffset += widget.get_x();
                widget = widget.get_parent();
            }
        }
        return this._workspacesBarOffset;
    }
}

export class WorkspacesBar {
    constructor(extension) {
        this._extension = extension;
        this._name = `${extension.metadata.name}`;
        this._settings = Settings.getInstance();
        this._styles = Styles.getInstance();
        this._ws = Workspaces.getInstance();
        this._button = null;
        this._buttonSubject = new Subject(null);
        this._menu = null;
        this._wsLabel = null;
        this._wsBar = null;
        this._dragHandler = new WorkspacesBarDragHandler(() => this._updateWorkspaces());
        this._touchTimeout = new Timeout();
        this._prevActiveIndex = -1;
    }

    init() {
        this._initButton();
        this._menu = new WorkspacesBarMenu(this._extension, this._button.menu);
        this._menu.init();
        this._ws.onUpdate(() => this._updateWorkspaces());
        this._styles.onWorkspacesBarChanged(() => this._refreshTopBarConfiguration());
        this._styles.onWorkspaceLabelsChanged(() => this._updateWorkspaces());
        this._settings.alwaysShowNumbers.subscribe(() => this._updateWorkspaces());
        this._settings.enableCustomLabel.subscribe(() => this._updateWorkspaces());
        this._settings.customLabelNamed.subscribe(() => this._updateWorkspaces());
        this._settings.customLabelUnnamed.subscribe(() => this._updateWorkspaces());
        this._settings.indicatorStyle.subscribe(() => this._refreshTopBarConfiguration());
        this._settings.position.subscribe(() => this._refreshTopBarConfiguration());
        this._settings.positionIndex.subscribe(() => this._refreshTopBarConfiguration());
    }

    destroy() {
        this._button?.destroy();
        this._menu?.destroy();
        this._dragHandler.destroy();
        this._buttonSubject.complete();
        this._touchTimeout.destroy();
    }

    observeWidget() {
        return this._buttonSubject;
    }

    _refreshTopBarConfiguration() {
        this._button?.destroy();
        this._menu?.destroy();
        this._initButton();
        this._menu = new WorkspacesBarMenu(this._extension, this._button.menu);
        this._menu.init();
    }

    _initButton() {
        this._button = new WorkspacesButton(0.5, this._name);
        this._buttonSubject.next(this._button);
        this._button.styleClass = 'panel-button space-bar';
        switch (this._settings.indicatorStyle.value) {
            case 'current-workspace':
                this._initWorkspaceLabel();
                break;
            case 'workspaces-bar':
                this._initWorkspacesBar();
                break;
        }
        Main.panel.addToStatusArea(
            this._name,
            this._button,
            this._settings.positionIndex.value,
            this._settings.position.value,
        );
        this._updateWorkspaces();
    }

    _initWorkspaceLabel() {
        this._button.styleClass += ' workspace-label';
        this._wsLabel = new St.Label({ yAlign: Clutter.ActorAlign.CENTER });
        this._button.add_child(this._wsLabel);
        this._button._clickGesture.set_enabled(false);
        this._button.connect('button-press-event', (actor, event) => {
            switch (event.get_button()) {
                case 1:
                    if (this._settings.toggleOverview.value)
                        Main.overview.toggle();
                    else
                        this._button.menu.toggle();
                    return Clutter.EVENT_STOP;
                case 3:
                    this._button.menu.toggle();
                    return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _initWorkspacesBar() {
        this._button._clickGesture.set_enabled(false);
        this._button._delegate = this._dragHandler;
        this._button.trackHover = false;
        this._wsBar = new St.BoxLayout({});
        this._button.add_child(this._wsBar);
    }

    _updateWorkspaces() {
        switch (this._settings.indicatorStyle.value) {
            case 'current-workspace':
                this._updateWorkspaceLabel();
                break;
            case 'workspaces-bar':
                this._updateWorkspacesBar();
                break;
        }
    }

    _updateWorkspaceLabel() {
        const workspace = this._ws.workspaces[this._ws.currentIndex];
        this._wsLabel?.set_text(this._ws.getDisplayName(workspace));
    }

    _updateWorkspacesBar() {
        const newActiveIndex = this._ws.currentIndex;
        const children = this._wsBar?.get_children() ?? [];
        const existingCount = children.length;
        const expectedCount = this._ws.workspaces.filter(w => w.isVisible).length;

        if (existingCount === expectedCount && existingCount > 0)
            this._updateInPlace(newActiveIndex);
        else
            this._fullRefresh();

        this._prevActiveIndex = newActiveIndex;
    }

    _fullRefresh() {
        this._wsBar?.destroy_all_children();
        this._dragHandler.wsBoxes = [];
        for (let ws_index = 0; ws_index < this._ws.numberOfEnabledWorkspaces; ++ws_index) {
            const workspace = this._ws.workspaces[ws_index];
            if (workspace.isVisible) {
                const wsBox = this._createWsBox(workspace);
                this._wsBar?.add_child(wsBox);
                this._dragHandler.wsBoxes.push({ workspace, wsBox });
            }
        }
    }

    _updateInPlace(newActiveIndex) {
        const animation = this._settings.transitionAnimation.value;
        const shouldAnimate = animation !== 'none'
            && this._prevActiveIndex >= 0
            && this._prevActiveIndex !== newActiveIndex;

        for (const { workspace, wsBox } of this._dragHandler.wsBoxes) {
            const state = this._ws.workspaces[workspace.index];
            if (!state) continue;
            const label = wsBox.get_child();
            const isActive = state.index === newActiveIndex;

            let styleClass = 'space-bar-workspace-label';
            styleClass += isActive ? ' active' : ' inactive';
            styleClass += state.hasWindows ? ' nonempty' : ' empty';
            label.styleClass = styleClass;
            const text = this._ws.getDisplayName(state);
            label.set_text(text);
            if (text.trim() === '')
                label.styleClass += ' no-text';

            if (shouldAnimate && isActive)
                this._animateEnter(wsBox, animation);
        }
    }

    _animateEnter(wsBox, style) {
        wsBox.remove_all_transitions();
        if (style === 'fade') {
            const label = wsBox.get_child();
            label.remove_all_transitions();
            label.set_opacity(0);
            label.ease({
                opacity: 255,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else if (style === 'soft-pulse') {
            wsBox.ease({
                scale_x: 1.04,
                scale_y: 1.04,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    wsBox.ease({
                        scale_x: 1.0,
                        scale_y: 1.0,
                        duration: 160,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                },
            });
        } else if (style === 'soft-slide') {
            wsBox.translation_y = 6;
            wsBox.opacity = 0;
            wsBox.ease({
                translation_y: 0,
                opacity: 255,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    _createWsBox(workspace) {
        const wsBox = new St.Bin({
            visible: true,
            reactive: true,
            canFocus: true,
            trackHover: true,
            styleClass: `workspace-box workspace-box-${workspace.index + 1}`,
        });
        wsBox._delegate = new WorkspaceBoxDragHandler(workspace);
        const label = this._createLabel(workspace);
        wsBox.set_child(label);
        let lastButton1PressEvent = null;
        wsBox.connect('button-press-event', (actor, event) => {
            switch (event.get_button()) {
                case 1:
                    lastButton1PressEvent = event;
                    break;
                case 3:
                    this._button.menu.toggle();
                    return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        wsBox.connect('button-release-event', (actor, event) => {
            switch (event.get_button()) {
                case 1:
                    if (lastButton1PressEvent) {
                        const delta = event.get_time() - lastButton1PressEvent.get_time();
                        lastButton1PressEvent = null;
                        if (delta <= MAX_CLICK_TIME_DELTA) {
                            this._ws.switchTo(workspace.index, 'click-on-label');
                            return Clutter.EVENT_STOP;
                        }
                    }
            }
            return Clutter.EVENT_PROPAGATE;
        });
        let lastTouchBeginEvent = null;
        wsBox.connect('touch-event', (actor, event) => {
            switch (event.type()) {
                case Clutter.EventType.TOUCH_BEGIN:
                    lastTouchBeginEvent = event;
                    this._touchTimeout.once(LONG_PRESS_DURATION).then(() => this._button.menu.toggle());
                    break;
                case Clutter.EventType.TOUCH_END:
                    if (lastTouchBeginEvent) {
                        const delta = event.get_time() - lastTouchBeginEvent.get_time();
                        if (delta <= MAX_CLICK_TIME_DELTA)
                            this._ws.switchTo(workspace.index, 'click-on-label');
                        lastTouchBeginEvent = null;
                    }
                    this._touchTimeout.clearTimeout();
                    break;
                case Clutter.EventType.TOUCH_CANCEL:
                    this._touchTimeout.clearTimeout();
                    break;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._dragHandler.setupDnd(wsBox, workspace, {
            onDragStart: () => this._touchTimeout.clearTimeout(),
        });
        return wsBox;
    }

    _createLabel(workspace) {
        const label = new St.Label({
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'space-bar-workspace-label',
        });
        if (workspace.index === this._ws.currentIndex)
            label.styleClass += ' active';
        else
            label.styleClass += ' inactive';
        if (workspace.hasWindows)
            label.styleClass += ' nonempty';
        else
            label.styleClass += ' empty';
        const text = this._ws.getDisplayName(workspace);
        label.set_text(text);
        if (text.trim() === '')
            label.styleClass += ' no-text';
        return label;
    }
}
