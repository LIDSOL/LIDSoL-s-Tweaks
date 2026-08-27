import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Meta from 'gi://Meta';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js';
import { Settings, ICON_PRESETS } from './settings.js';
import { Styles } from './styles.js';
import { Workspaces } from './workspaces.js';
import { Subject } from './subject.js';
import { Timeout } from './timeout.js';
import { WorkspacesBarMenu } from './workspacesBarMenu.js';

const MAX_CLICK_TIME_DELTA = 300;
const LONG_PRESS_DURATION = 500;
const ICON_TIMEOUT = 200;
const GAP_HALF_WIDTH = 15;
const ARROW_STRIP_WIDTH = 14;
const OVERFLOW_TOLERANCE = 4;
const WHEEL_STEP_PX = 40;
const FOCUS_ANIM_DURATION = 200;
const DIM_INACTIVE_OPACITY = 128;
const DESATURATE_EFFECT_NAME = 'wsb-desaturate';
const VIEWPORT_INIT_DELAY = 100;
const SYNC_DEBOUNCE = 50;

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

// ── WorkspaceBoxDragHandler: drop target for a single workspace ──────

class WorkspaceBoxDragHandler {
    constructor(workspace) {
        this._workspace = workspace;
    }

    acceptDrop(source) {
        if (source instanceof WindowPreview) {
            source.metaWindow.change_workspace_by_index(this._workspace.index, false);
            return true;
        }
        if (source.windowObj) {
            source.windowObj.change_workspace_by_index(this._workspace.index, false);
            return true;
        }
        return false;
    }

    handleDragOver(source) {
        if (source instanceof WindowPreview || source.windowObj)
            return DND.DragMotionResult.MOVE_DROP;
        return DND.DragMotionResult.CONTINUE;
    }
}

// ── WorkspacesBarDragHandler: workspace reorder via drag ──────────────

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

    _onDragMotion() {
        this._updateDragPlaceholder(this._initialDropPosition);
        return DND.DragMotionResult.CONTINUE;
    }

    _setUpBoxPositions(wsBox, workspace) {
        const boxIndex = this.wsBoxes.findIndex(b => b.workspace === workspace);
        this._wsBoxPositions = this._getWsBoxPositions(boxIndex, wsBox.get_width());
        this._initialDropPosition = this._getDropPosition();
        this._updateDragPlaceholder(this._initialDropPosition);
    }

    _getDropPosition() {
        const draggedWsBox = this.wsBoxes.find(b => b.workspace === this._draggedWorkspace)?.wsBox;
        for (const { index, center, wsBox } of this._wsBoxPositions) {
            if (draggedWsBox.get_x() < center + this._getWorkspacesBarOffset())
                return { index, wsBox, position: 'before', width: draggedWsBox.get_width() };
        }
        if (this._wsBoxPositions.length > 0) {
            const last = this._wsBoxPositions[this._wsBoxPositions.length - 1].wsBox;
            return { index: this._ws.lastVisibleWorkspace, wsBox: last, position: 'after', width: draggedWsBox.get_width() };
        }
    }

    _getWsBoxPositions(draggedBoxIndex, draggedBoxWidth) {
        const positions = this.wsBoxes
            .filter(b => b.workspace !== this._draggedWorkspace)
            .map(({ workspace, wsBox }) => ({
                index: getDropIndex(this._draggedWorkspace, workspace),
                center: getHorizontalCenter(wsBox),
                wsBox,
            }));
        positions.forEach((pos, i) => {
            if (i >= draggedBoxIndex) pos.center -= draggedBoxWidth;
        });
        return positions;
    }

    _updateDragPlaceholder(dropPosition) {
        if (dropPosition?.index === this._initialDropPosition?.index && dropPosition?.position === this._initialDropPosition?.position) {
            if (!this._getHasLeftInitialPosition()) return;
        } else {
            this._hasLeftInitialPosition = true;
        }
        for (const { wsBox } of this.wsBoxes) {
            if (wsBox === dropPosition?.wsBox) {
                if (dropPosition.position === 'before')
                    wsBox.set_style(`margin-left: ${dropPosition.width}px`);
                else
                    wsBox.set_style(`margin-right: ${dropPosition.width}px`);
            } else {
                wsBox.set_style(null);
            }
        }
    }

    _getBarWidth() { return this.wsBoxes[0]?.wsBox.get_parent()?.get_width() ?? 0; }

    _getHasLeftInitialPosition() {
        if (this._hasLeftInitialPosition) return true;
        if (this._barWidthAtDragStart !== this._getBarWidth()) this._hasLeftInitialPosition = true;
        return this._hasLeftInitialPosition;
    }

    _getWorkspacesBarOffset() {
        if (this._workspacesBarOffset === null) {
            this._workspacesBarOffset = 0;
            let widget = this.wsBoxes[0]?.wsBox.get_parent();
            while (widget) { this._workspacesBarOffset += widget.get_x(); widget = widget.get_parent(); }
        }
        return this._workspacesBarOffset;
    }
}

// ═════════════════════════════════════════════════════════════════════
// WorkspaceBar — main class
// ═════════════════════════════════════════════════════════════════════

export class WorkspaceBar {
    constructor(extension) {
        this._extension = extension;
        this._name = `${extension.metadata.name}`;
        this._settings = Settings.getInstance();
        this._styles = Styles.getInstance();
        this._ws = Workspaces.getInstance();

        // Panel button (wraps viewport for menu support)
        this._button = null;
        this._buttonSubject = new Subject(null);
        this._menu = null;

        // Viewport hierarchy: viewport > clip > container
        this._viewport = null;
        this._clip = null;
        this._container = null;
        this._wsBar = null; // alias for _container used by compat code

        // Overflow arrows
        this._arrowLeft = null;
        this._arrowRight = null;
        this._scrollOffset = 0;

        // Insertion indicator (gap-drop)
        this._insertionIndicator = null;
        this._currentInsertIndex = -1;
        this._gapDropMonitor = null;
        this._gapDropWindowObj = null;

        // DnD
        this._dragHandler = new WorkspacesBarDragHandler(() => this._updateWorkspaces());

        // Timeouts
        this._touchTimeout = new Timeout();
        this._scrollTimeout = null;
        this._syncTimeout = null;

        // Focus tracking
        this._focusedWindowId = null;
        this._focusSignalId = null;

        // State
        this._prevActiveIndex = -1;
        this._prevWindowIds = '';
        this._destroyed = false;
        this._suppressAnimations = false;

        // Signal IDs
        this._gnomeEventIds = [];
        this._mainEventIds = [];
    }

    init() {
        this._createContainer();
        this._insertContainer();
        this._initButton();
        this._menu = new WorkspacesBarMenu(this._extension, this._button.menu);
        this._menu.init();

        // Workspace state updates
        this._ws.onUpdate(() => this._updateWorkspaces());
        this._styles.onWorkspacesBarChanged(() => this._refreshTopBarConfiguration());
        this._styles.onWorkspaceLabelsChanged(() => this._updateWorkspaces());

        // Setting subscriptions
        this._settings.alwaysShowNumbers.subscribe(() => this._updateWorkspaces());
        this._settings.enableCustomLabel.subscribe(() => this._updateWorkspaces());
        this._settings.customLabelNamed.subscribe(() => this._updateWorkspaces());
        this._settings.customLabelUnnamed.subscribe(() => this._updateWorkspaces());
        this._settings.showAppIcons.subscribe(() => this._updateWorkspaces());
        this._settings.dimInactiveIcons.subscribe(() => this._applyFocusScale(true));
        this._settings.desaturateInactiveIcons.subscribe(() => this._applyFocusScale(true));
        this._settings.focusScaleEffect.subscribe(() => this._applyFocusScale(true));
        this._settings.focusScaleReduction.subscribe(() => this._applyFocusScale(true));
        this._settings.indicatorStyle.subscribe(() => this._refreshTopBarConfiguration());
        this._settings.position.subscribe(() => this._refreshTopBarConfiguration());
        this._settings.positionIndex.subscribe(() => this._refreshTopBarConfiguration());

        // Focus tracking
        this._focusSignalId = global.display.connect('notify::focus-window', () => this._onFocusWindowChanged());

        // GNOME signals
        this._gnomeEventIds.push(
            Main.layoutManager.connect('monitors-changed', () => this._refreshTopBarConfiguration()),
        );

        // Initial state
        this._prevWindowIds = this._computeWindowIds();
        this._updateWorkspaces();

        // Deferred viewport width
        this._scheduleTimeout(VIEWPORT_INIT_DELAY, () => this._updateOverlays());
    }

    destroy() {
        this._destroyed = true;
        for (const [obj, id] of this._gnomeEventIds) {
            try { obj.disconnect(id); } catch (_e) { /* already gone */ }
        }
        this._gnomeEventIds = [];
        for (const [obj, id] of this._mainEventIds) {
            try { obj.disconnect(id); } catch (_e) { /* already gone */ }
        }
        this._mainEventIds = [];
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
        this._removeInsertionIndicator();
        this._unregisterGapDragMonitor();
        this._button?.destroy();
        this._menu?.destroy();
        this._dragHandler.destroy();
        this._buttonSubject.complete();
        this._touchTimeout.destroy();
        if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
    }

    observeWidget() {
        return this._buttonSubject;
    }

    // ── Panel button & container creation ─────────────────────────────

    _initButton() {
        this._button = new WorkspacesButton(0.5, this._name);
        this._buttonSubject.next(this._button);
        this._button.styleClass = 'panel-button space-bar';
        this._button._clickGesture.set_enabled(false);
        this._button._delegate = this._dragHandler;
        this._button.trackHover = false;
        this._button.add_child(this._viewport);
        Main.panel.addToStatusArea(
            this._name,
            this._button,
            this._settings.positionIndex.value,
            this._settings.position.value,
        );
    }

    _createContainer() {
        this._container = new St.BoxLayout({ reactive: true, track_hover: true, styleClass: 'wsb-container-wrapper' });
        this._clip = new St.Widget({ clip_to_allocation: true, layout_manager: new Clutter.FixedLayout() });
        this._clip.add_child(this._container);
        this._viewport = new St.Widget({ clip_to_allocation: true, y_expand: true, layout_manager: new Clutter.FixedLayout() });
        this._viewport.add_child(this._clip);

        // Overflow arrows
        this._arrowLeft = new St.Label({ text: '\u25C2', styleClass: 'wsb-overflow-arrow', reactive: false, visible: false });
        this._arrowRight = new St.Label({ text: '\u25B8', styleClass: 'wsb-overflow-arrow', reactive: false, visible: false });
        this._viewport.add_child(this._arrowLeft);
        this._viewport.add_child(this._arrowRight);

        this._viewport.connect('notify::width', () => this._updateOverlays());
        this._viewport.connect('notify::height', () => this._updateOverlays());
        this._viewport.connect('scroll-event', (_v, event) => this._onScrollEvent(event));
    }

    _insertContainer() {
        const pos = this._settings.position.value;
        const posIndex = this._settings.positionIndex.value;
        const box = pos === 'center' ? Main.panel._centerBox
            : pos === 'right' ? Main.panel._rightBox
            : Main.panel._leftBox;
        box.insert_child_at_index(this._viewport, Math.min(posIndex, box.get_n_children()));
    }

    _refreshTopBarConfiguration() {
        this._removeInsertionIndicator();
        this._unregisterGapDragMonitor();
        this._viewport?.get_parent()?.remove_child(this._viewport);
        this._button?.destroy();
        this._menu?.destroy();
        this._suppressAnimations = true;
        this._prevActiveIndex = this._ws.currentIndex;
        this._createContainer();
        this._insertContainer();
        this._initButton();
        this._menu = new WorkspacesBarMenu(this._extension, this._button.menu);
        this._menu.init();
        this._prevWindowIds = this._computeWindowIds();
        this._updateWorkspaces();
        this._suppressAnimations = false;
    }

    // ── Workspace updates ─────────────────────────────────────────────

    _updateWorkspaces() {
        if (this._destroyed) return;
        switch (this._settings.indicatorStyle.value) {
            case 'current-workspace':
                this._updateWorkspacesBar();
                break;
            case 'workspaces-bar':
                this._updateWorkspacesBar();
                break;
        }
    }

    _updateWorkspacesBar() {
        if (this._destroyed || !this._container) return;

        const animsOn = this._settings.enableAnimations.value;
        const shouldAnimate = animsOn
            && !this._suppressAnimations
            && this._settings.transitionAnimation.value !== 'none'
            && this._prevActiveIndex >= 0
            && this._prevActiveIndex !== this._ws.currentIndex;

        const currentWindowIds = this._computeWindowIds();
        const windowsChanged = currentWindowIds !== this._prevWindowIds;
        this._prevWindowIds = currentWindowIds;

        // Rebuild immediately (no artificial wait/flash): fresh icons are
        // spring-popped in and new workspace cells fade+pop in by _rebuild,
        // while an off "enable animations" keeps everything instant.
        this._rebuildWorkspacesBar(shouldAnimate, windowsChanged);
    }

    _computeWindowIds() {
        const ids = [];
        for (let i = 0; i < this._ws.numberOfEnabledWorkspaces; i++) {
            const workspace = this._ws.workspaces[i];
            const windowIds = workspace.windows
                .map(w => w.get_id())
                .sort();
            ids.push(windowIds);
        }
        return JSON.stringify(ids);
    }

    _collectExistingIcons() {
        const icons = [];
        if (!this._container) return icons;
        for (const wsBox of this._container.get_children()) {
            const iconsBox = wsBox._iconsWrapper;
            if (!iconsBox) continue;
            for (const child of iconsBox.get_children())
                icons.push(child);
        }
        return icons;
    }

    // Detach every displayed icon wrapper (keyed by windowId) from the bar so the
    // coming full rebuild doesn't destroy them. Old x position is kept so the
    // closing window's neighbours can slide into the freed slot.
    _captureIcons() {
        const map = new Map();
        if (!this._container) return map;
        for (const wsBox of this._container.get_children()) {
            const iconsBox = wsBox._iconsWrapper;
            if (!iconsBox) continue;
            const wsIndex = wsBox._delegate?._workspace?.index ?? -1;
            for (const wrapper of iconsBox.get_children().slice()) {
                const winId = wrapper._delegate?.windowObj?.get_id();
                if (winId == null) continue;
                // Local position within the icons row (immune to whole-bar
                // re-centering), so only the affected row slides.
                let oldX = 0;
                try {
                    oldX = wrapper.get_x();
                } catch (_e) {}
                wrapper.set_pivot_point(0.5, 0.5);
                iconsBox.remove_child(wrapper);
                map.set(winId, { wrapper, oldX, wsIndex });
            }
        }
        return map;
    }

    // Fade + scale a closing window's icon out, then destroy it.
    _animateIconOut(icon) {
        if (!icon) return;
        if (!this._settings.enableAnimations.value || this._suppressAnimations) {
            try { icon.destroy(); } catch (_e) {}
            return;
        }
        icon.remove_all_transitions();
        icon.set_pivot_point(0.5, 0.5);
        icon.ease({
            opacity: 0,
            scale_x: 0.6,
            scale_y: 0.6,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                try { icon.destroy(); } catch (_e) {}
            },
        });
    }

    // Glide surviving icons from their previous x to the new layout x (which is
    // only known once the rebuilt bar is allocated), so the rest "slide" to fill
    // the gap left by a closed window.
    _slideIconsIn(entries) {
        if (!entries.length) return;
        const tryOnce = (attempt) => {
            const first = this._container?.get_children()[0];
            if (!first) {
                entries.forEach((e) => { try { e.wrapper.translation_x = 0; } catch (_e) {} });
                return;
            }
            const alloc = first.get_allocation_box();
            if ((alloc.x2 - alloc.x1) <= 0 && attempt < 10) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                    tryOnce(attempt + 1);
                    return GLib.SOURCE_REMOVE;
                });
                return;
            }
            for (const e of entries) {
                if (!e.wrapper.get_parent()) continue;
                let newX = 0;
                try {
                    newX = e.wrapper.get_x();
                } catch (_e) {}
                const delta = e.oldX - newX;
                if (Math.abs(delta) < 1) {
                    e.wrapper.translation_x = 0;
                    continue;
                }
                e.wrapper.translation_x = delta;
                e.wrapper.ease({
                    translation_x: 0,
                    duration: 360,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        };
        tryOnce(0);
    }

    _rebuildWorkspacesBar(shouldAnimate, animateIcons = false) {
        if (this._destroyed || !this._container) return;
        const animsOn = this._settings.enableAnimations.value;
        const oldCount = this._container.get_children().length;

        // Detach current icon wrappers (preserving their actors + old x positions).
        const captured = this._captureIcons();
        const reused = new Set();
        const slideEntries = [];

        this._container.destroy_all_children();
        this._dragHandler.wsBoxes = [];

        let newCount = 0;
        for (let wsIndex = 0; wsIndex < this._ws.numberOfEnabledWorkspaces; ++wsIndex) {
            const workspace = this._ws.workspaces[wsIndex];
            if (workspace.isVisible) {
                const wsBox = this._createWsBox(workspace, animateIcons, captured, reused, slideEntries);
                this._container.add_child(wsBox);
                this._dragHandler.wsBoxes.push({ workspace, wsBox });
                newCount++;
                if (shouldAnimate && workspace.index === this._ws.currentIndex)
                    this._animateEnter(wsBox, this._settings.transitionAnimation.value);
                else if (animsOn && !this._suppressAnimations && newCount > oldCount)
                    this._animateWorkspaceIn(wsBox);
            }
        }

        // Icons captured but never reused belong to windows that closed → fade them out
        // (or destroy immediately when animations are suppressed).
        for (const [winId, entry] of captured) {
            if (!reused.has(winId))
                this._animateIconOut(entry.wrapper);
        }

        // Survivors glide from their old x to their new one.
        if (animsOn && !this._suppressAnimations && slideEntries.length)
            this._slideIconsIn(slideEntries);

        this._prevActiveIndex = this._ws.currentIndex;
        this._applyFocusScale(false);
        this._scheduleSync();
        this._scheduleScrollToActive();
    }

    // ── Workspace box creation ────────────────────────────────────────

    _createWsBox(workspace, animateIcons = false, captured = null, reused = null, slideEntries = null) {
        const wsBox = new St.Bin({
            visible: true,
            reactive: true,
            canFocus: true,
            trackHover: true,
            styleClass: `workspace-box workspace-box-${workspace.index + 1}`,
        });
        wsBox._delegate = new WorkspaceBoxDragHandler(workspace);

        const showIcons = this._settings.showAppIcons.value;
        const useIconsSection = showIcons && workspace.windows.length > 0;
        const label = this._createLabel(workspace, useIconsSection);

        if (useIconsSection) {
            wsBox.styleClass += ' space-bar-ws-box-icons';
            const contentBox = new St.BoxLayout({ xAlign: Clutter.ActorAlign.CENTER });
            label.set_y_expand(true);
            contentBox.add_child(label);
            const iconsBox = this._createAppIcons(workspace, animateIcons, captured, reused, slideEntries);
            iconsBox.set_y_expand(true);
            contentBox.add_child(iconsBox);
            wsBox.set_child(contentBox);
            wsBox._iconsWrapper = iconsBox;
        } else {
            wsBox.set_child(label);
        }

        // Click handling
        let lastButton1PressEvent = null;
        wsBox.connect('button-press-event', (_actor, event) => {
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
            const button = event.get_button();

            // Only handle |a click on an app icon| for primary/middle buttons.
            if (button === 1 || button === 2) {
                const [x, y] = event.get_coords();
                const stage = actor.get_stage();
                let elem = stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
                let clickedWindowObj = null;
                while (elem && elem !== actor) {
                    if (elem._delegate?.windowObj) {
                        clickedWindowObj = elem._delegate.windowObj;
                        break;
                    }
                    elem = elem.get_parent();
                }

                if (button === 2) {
                    // Middle click on an app icon (when enabled) closes that window.
                    if (clickedWindowObj && this._settings.middleClickClose.value) {
                        clickedWindowObj.delete(global.get_current_time());
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                }

                if (button === 1 && lastButton1PressEvent) {
                    const delta = event.get_time() - lastButton1PressEvent.get_time();
                    lastButton1PressEvent = null;
                    if (delta > MAX_CLICK_TIME_DELTA)
                        return Clutter.EVENT_PROPAGATE;
                    if (clickedWindowObj) {
                        const focusedWindow = global.display.get_focus_window();
                        if (focusedWindow && focusedWindow.get_id() === clickedWindowObj.get_id()) {
                            Main.overview.hide();
                        } else {
                            if (workspace.index !== this._ws.currentIndex)
                                this._ws.activate(workspace.index);
                            clickedWindowObj.get_compositor_private()?.grab_key_focus();
                            clickedWindowObj.activate(global.get_current_time());
                        }
                        return Clutter.EVENT_STOP;
                    }
                    this._ws.switchTo(workspace.index, 'click-on-label');
                    return Clutter.EVENT_STOP;
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });

        // Touch handling
        let lastTouchBeginEvent = null;
        wsBox.connect('touch-event', (_actor, event) => {
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

        // DnD
        this._dragHandler.setupDnd(wsBox, workspace, {
            onDragStart: () => this._touchTimeout.clearTimeout(),
        });

        return wsBox;
    }

    _createLabel(workspace, useIconsSection = false) {
        const label = new St.Label({
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: useIconsSection ? 'space-bar-ws-label' : 'space-bar-workspace-label',
        });
        label.styleClass += workspace.index === this._ws.currentIndex ? ' active' : ' inactive';
        label.styleClass += workspace.hasWindows ? ' nonempty' : ' empty';

        const text = this._ws.getDisplayName(workspace);
        label.set_text(text);
        if (text.trim() === '') label.styleClass += ' no-text';
        return label;
    }

    _createAppIcons(workspace, animate = false, captured = null, reused = null, slideEntries = null) {
        const animateOn = animate && this._settings.enableAnimations.value && !this._suppressAnimations;
        const isActive = workspace.index === this._ws.currentIndex;
        const isEmpty = !workspace.hasWindows;
        const preset = ICON_PRESETS[this._settings.iconSizeMode.value] || ICON_PRESETS.medium;
        const iconSize = preset.iconSize;

        let iconClass = 'space-bar-ws-icons';
        iconClass += isActive ? ' active' : ' inactive';
        if (!isActive && isEmpty) iconClass += ' empty';

        const iconsBox = new St.BoxLayout({ styleClass: iconClass, xAlign: Clutter.ActorAlign.CENTER });
        const windowTracker = Shell.WindowTracker.get_default();

        for (const win of workspace.windows) {
            const winId = win.get_id();
            const entry = captured?.get(winId);
            if (entry) {
                if (reused) reused.add(winId);
                const iconWrapper = entry.wrapper;
                iconWrapper.remove_all_transitions();
                iconWrapper.opacity = 255;
                iconWrapper.set_scale(1, 1);
                iconWrapper.translation_x = 0;
                iconsBox.add_child(iconWrapper);
                // Only slide icons that stayed in the same workspace row; a
                // window moved to another workspace keeps its spot without sliding.
                if (animateOn && entry.wsIndex === workspace.index)
                    slideEntries?.push({ wrapper: iconWrapper, oldX: entry.oldX });
                continue;
            }
            const app = windowTracker.get_window_app(win);
            const iconWrapper = new St.BoxLayout({ reactive: true, track_hover: true, styleClass: 'space-bar-app-icon-wrapper' });
            const icon = app
                ? app.create_icon_texture(iconSize)
                : new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: iconSize });
            iconWrapper.add_child(icon);
            iconWrapper._delegate = {
                windowObj: win,
                getDragActor() {
                    const a = Shell.WindowTracker.get_default().get_window_app(win);
                    return a ? a.create_icon_texture(iconSize) : new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: iconSize });
                },
                getDragActorSource() { return iconWrapper; },
            };
            DND.makeDraggable(iconWrapper, { restoreOnSuccess: true, manualMode: false });

            if (animateOn) {
                iconWrapper.set_pivot_point(0.5, 0.5);
                iconWrapper.opacity = 0;
                iconWrapper.set_scale(0.5, 0.5);
                iconWrapper.ease({ opacity: 255, duration: 300, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                iconWrapper.ease({ scale_x: 1, scale_y: 1, duration: 360, mode: Clutter.AnimationMode.EASE_OUT_BACK });
            }
            iconsBox.add_child(iconWrapper);
        }
        return iconsBox;
    }

    // ── Transitions ───────────────────────────────────────────────────

    _animateEnter(wsBox, style) {
        wsBox.remove_all_transitions();
        if (style === 'fade') {
            const child = wsBox.get_child();
            child?.remove_all_transitions();
            child?.set_opacity(0);
            child?.ease({ opacity: 255, duration: 250, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        } else if (style === 'soft-pulse') {
            wsBox.ease({
                scale_x: 1.04, scale_y: 1.04, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => wsBox.ease({ scale_x: 1.0, scale_y: 1.0, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_CUBIC }),
            });
        } else if (style === 'soft-slide') {
            wsBox.translation_y = 6;
            wsBox.opacity = 0;
            wsBox.ease({ translation_y: 0, opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        }
    }

    // Fade + spring pop-in an actor from a starting scale to full size.
    _popIn(actor, startScale) {
        actor.set_pivot_point(0.5, 0.5);
        actor.opacity = 0;
        actor.set_scale(startScale, startScale);
        actor.ease({
            opacity: 255,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 360,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    // A freshly-added (usually trailing, dynamic) workspace cell fades + pops in.
    _animateWorkspaceIn(wsBox) {
        if (!wsBox || !this._settings.enableAnimations.value) return;
        wsBox.remove_all_transitions();
        this._popIn(wsBox, 0.7);
    }

    // ── Focus scale ───────────────────────────────────────────────────

    _onFocusWindowChanged() {
        const focusedWin = global.display.get_focus_window();
        const focusedId = focusedWin?.get_id() ?? null;
        if (focusedId === this._focusedWindowId) return;
        this._focusedWindowId = focusedId;
        this._applyFocusScale(true);
    }

    _applyFocusScale(animate) {
        if (!this._container) return;
        const reduction = this._settings.focusScaleReduction.value;
        const scaleEnabled = this._settings.focusScaleEffect.value;
        for (const wsBox of this._container.get_children()) {
            const iconsBox = wsBox._iconsWrapper;
            if (!iconsBox) continue;
            for (const iconWrapper of iconsBox.get_children()) {
                const delegate = iconWrapper._delegate;
                if (!delegate?.windowObj) continue;
                const isFocused = delegate.windowObj.get_id() === this._focusedWindowId;
                const scale = (!scaleEnabled || isFocused) ? 1.0 : (1.0 - (reduction / 100));
                iconWrapper.set_pivot_point(0.5, 0.5);

                // Dim: apply opacity on the icon texture, not the wrapper
                const iconTex = iconWrapper.get_first_child();
                if (iconTex) {
                    const dimmed = this._settings.dimInactiveIcons.value && !isFocused;
                    const opacity = dimmed ? DIM_INACTIVE_OPACITY : 255;
                    if (animate) {
                        iconTex.ease({
                            opacity,
                            duration: FOCUS_ANIM_DURATION,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    } else {
                        iconTex.opacity = opacity;
                    }

                    // Desaturate: Clutter.DesaturateEffect on icon texture
                    const effect = iconTex.get_effect(DESATURATE_EFFECT_NAME);
                    if (!this._settings.desaturateInactiveIcons.value) {
                        if (effect) iconTex.remove_effect(effect);
                    } else {
                        let desatEffect = effect;
                        if (!desatEffect) {
                            desatEffect = new Clutter.DesaturateEffect({ factor: 0 });
                            iconTex.add_effect_with_name(DESATURATE_EFFECT_NAME, desatEffect);
                        }
                        const factor = isFocused ? 0 : 1;
                        if (animate) {
                            iconTex.ease_property(`@effects.${DESATURATE_EFFECT_NAME}.factor`, factor, {
                                duration: FOCUS_ANIM_DURATION,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            });
                        } else {
                            desatEffect.factor = factor;
                        }
                    }
                }

                if (animate) {
                    iconWrapper.ease({ scale_x: scale, scale_y: scale, duration: FOCUS_ANIM_DURATION, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                } else {
                    iconWrapper.scale_x = scale;
                    iconWrapper.scale_y = scale;
                }
            }
        }
    }

    // ── Viewport / overflow ───────────────────────────────────────────

    _onScrollEvent(event) {
        const dir = event.get_scroll_direction();
        const active = global.workspace_manager.get_active_workspace_index();
        const nWs = global.workspace_manager.get_n_workspaces();

        if (dir === Clutter.ScrollDirection.UP) {
            if (active > 0) global.workspace_manager.get_workspace_by_index(active - 1).activate(global.get_current_time());
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.DOWN) {
            if (active < nWs - 1) global.workspace_manager.get_workspace_by_index(active + 1).activate(global.get_current_time());
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.LEFT) {
            this._setScrollOffset(this._scrollOffset - WHEEL_STEP_PX);
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.RIGHT) {
            this._setScrollOffset(this._scrollOffset + WHEEL_STEP_PX);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _setScrollOffset(offset) {
        if (!this._container || !this._clip) return;
        const contentW = this._realContentWidth();
        const clipW = this._clip.get_width();
        const maxOffset = Math.max(0, contentW - clipW);
        this._scrollOffset = Math.max(0, Math.min(offset, maxOffset));
        this._container.set_x(-this._scrollOffset);
        this._updateOverlays();
    }

    _realContentWidth() {
        if (!this._container || this._container.get_n_children() === 0) return 0;
        const last = this._container.get_child_at_index(this._container.get_n_children() - 1);
        return last.get_allocation_box().x2;
    }

    _updateOverlays() {
        if (this._destroyed || !this._viewport || !this._container || !this._clip) return;
        if (!this._arrowLeft || !this._arrowRight) return;

        const viewW = this._viewport.get_width();
        const viewH = this._viewport.get_height();
        if (viewW <= 0 || viewH <= 0) return;

        const contentW = this._realContentWidth();
        const hasOverflow = contentW > viewW + OVERFLOW_TOLERANCE;

        let clipX, clipW;
        if (hasOverflow) {
            clipX = ARROW_STRIP_WIDTH;
            clipW = Math.max(0, viewW - ARROW_STRIP_WIDTH * 2);
        } else {
            clipX = 0;
            clipW = Math.min(contentW > 0 ? contentW : viewW, viewW);
        }

        this._clip.set_position(clipX, 0);
        this._clip.set_width(clipW);
        this._clip.set_height(viewH);

        // Vertical centering
        const [, containerH] = this._container.get_preferred_height(-1);
        const effectiveH = Math.max(viewH, containerH);
        this._container.set_height(effectiveH);
        this._container.set_y(Math.floor((viewH - effectiveH) / 2));

        // Arrow positions
        const [, arrowH] = this._arrowLeft.get_preferred_height(-1);
        const yCenter = Math.max(0, Math.floor((viewH - arrowH) / 2));
        this._arrowLeft.set_position(0, yCenter);
        this._arrowRight.set_position(Math.max(0, viewW - ARROW_STRIP_WIDTH), yCenter);

        // Clamp scroll
        const maxOffset = Math.max(0, contentW - clipW);
        if (!hasOverflow) this._scrollOffset = 0;
        else if (this._scrollOffset > maxOffset) this._scrollOffset = maxOffset;
        this._container.set_x(-this._scrollOffset);

        // Arrow visibility
        this._arrowLeft.visible = hasOverflow && this._scrollOffset > OVERFLOW_TOLERANCE;
        this._arrowRight.visible = hasOverflow && (this._scrollOffset + clipW < contentW - OVERFLOW_TOLERANCE);
    }

    _scheduleSync() {
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            this._syncTimeout = null;
            if (!this._destroyed) this._updateOverlays();
        }, SYNC_DEBOUNCE);
    }

    _scheduleScrollToActive() {
        if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
        this._scrollTimeout = setTimeout(() => {
            this._scrollTimeout = null;
            if (this._destroyed || !this._container || !this._clip) return;
            const activeChild = this._container.get_child_at_index(this._ws.currentIndex);
            if (!activeChild) return;
            const childX = activeChild.get_allocation_box().x1;
            const childW = activeChild.get_width();
            const clipW = this._clip.get_width();
            if (childX < this._scrollOffset)
                this._setScrollOffset(childX - 10);
            else if (childX + childW > this._scrollOffset + clipW)
                this._setScrollOffset(childX + childW - clipW + 10);
        }, 100);
    }

    // ── Insertion indicator (gap-drop) ────────────────────────────────

    _detectGapAtPosition(stageX, stageY) {
        if (!this._container) return null;
        const [, containerY] = this._container.get_transformed_position();
        const containerHeight = this._container.get_height();
        if (stageY < containerY || stageY > containerY + containerHeight) return null;

        const children = this._container.get_children();
        if (children.length === 0) return null;

        for (let i = 0; i <= children.length; i++) {
            let gapCenterX;
            if (i === 0) {
                const [btnX] = children[0].get_transformed_position();
                gapCenterX = btnX;
            } else if (i === children.length) {
                const [btnX] = children[i - 1].get_transformed_position();
                gapCenterX = btnX + children[i - 1].get_width();
            } else {
                const [prevX] = children[i - 1].get_transformed_position();
                const prevW = children[i - 1].get_width();
                const [nextX] = children[i].get_transformed_position();
                gapCenterX = (prevX + prevW + nextX) / 2;
            }
            if (Math.abs(stageX - gapCenterX) <= GAP_HALF_WIDTH)
                return { insertIndex: i };
        }
        return null;
    }

    _showInsertionIndicator(insertIndex) {
        this._removeInsertionIndicator();
        if (!this._container) return;

        const children = this._container.get_children();
        const [, containerY] = this._container.get_transformed_position();
        const containerHeight = this._container.get_height();
        const inset = 4;
        const hitAreaWidth = GAP_HALF_WIDTH * 2;

        let indicatorX;
        if (insertIndex === 0 && children.length > 0) {
            const [btnX] = children[0].get_transformed_position();
            indicatorX = btnX;
        } else if (insertIndex >= children.length && children.length > 0) {
            const last = children[children.length - 1];
            const [btnX] = last.get_transformed_position();
            indicatorX = btnX + last.get_width();
        } else if (insertIndex > 0 && insertIndex < children.length) {
            const [prevX] = children[insertIndex - 1].get_transformed_position();
            const prevW = children[insertIndex - 1].get_width();
            const [nextX] = children[insertIndex].get_transformed_position();
            indicatorX = (prevX + prevW + nextX) / 2;
        } else {
            return;
        }

        const self = this;
        this._insertionIndicator = new St.Widget({
            width: hitAreaWidth,
            height: containerHeight - inset * 2,
            reactive: true,
            layout_manager: new Clutter.BinLayout(),
            style: 'background-color: rgba(0, 0, 0, 0.01);',
        });

        const visualBar = new St.Widget({
            styleClass: 'wsb-insertion-indicator',
            width: 5,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this._insertionIndicator.add_child(visualBar);

        this._insertionIndicator._delegate = {
            acceptDrop(source) {
                if (!source.windowObj || !self._gapDropWindowObj) return false;
                const windowObj = self._gapDropWindowObj;
                const idx = self._currentInsertIndex;
                self._removeInsertionIndicator();
                self._unregisterGapDragMonitor();

                const numWs = global.workspace_manager.get_n_workspaces();
                global.workspace_manager.append_new_workspace(false, global.get_current_time());
                const newWs = global.workspace_manager.get_workspace_by_index(numWs);
                windowObj.change_workspace_by_index(numWs, false);
                global.workspace_manager.reorder_workspace(newWs, idx);
                global.workspace_manager.get_workspace_by_index(idx).activate(global.get_current_time());
                self._updateWorkspaces();
                return true;
            },
            handleDragOver(source) {
                if (source.windowObj) return DND.DragMotionResult.MOVE_DROP;
                return DND.DragMotionResult.CONTINUE;
            },
        };

        Main.uiGroup.add_child(this._insertionIndicator);
        this._insertionIndicator.set_position(indicatorX - hitAreaWidth / 2, containerY + inset);
        this._currentInsertIndex = insertIndex;
    }

    _removeInsertionIndicator() {
        if (this._insertionIndicator) {
            this._insertionIndicator.destroy();
            this._insertionIndicator = null;
        }
        this._currentInsertIndex = -1;
    }

    _registerGapDragMonitor(windowObj) {
        this._unregisterGapDragMonitor();
        this._gapDropWindowObj = windowObj;
        const self = this;
        this._gapDropMonitor = {
            dragMotion(dragEvent) {
                if (!dragEvent.targetActor?.get_parent()) return DND.DragMotionResult.CONTINUE;
                const gap = self._detectGapAtPosition(dragEvent.x, dragEvent.y);
                if (gap && gap.insertIndex !== self._currentInsertIndex)
                    self._showInsertionIndicator(gap.insertIndex);
                else if (!gap && self._currentInsertIndex !== -1)
                    self._removeInsertionIndicator();
                return DND.DragMotionResult.CONTINUE;
            },
        };
        DND.addDragMonitor(this._gapDropMonitor);
    }

    _unregisterGapDragMonitor() {
        if (this._gapDropMonitor) {
            DND.removeDragMonitor(this._gapDropMonitor);
            this._gapDropMonitor = null;
        }
        this._gapDropWindowObj = null;
        this._removeInsertionIndicator();
    }

    // ── Helpers ───────────────────────────────────────────────────────

    _scheduleTimeout(ms, callback) {
        const id = setTimeout(() => {
            if (this._destroyed) return;
            callback();
        }, ms);
        return id;
    }
}
