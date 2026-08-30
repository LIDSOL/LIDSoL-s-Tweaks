import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
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
const DESATURATE_EFFECT_NAME = 'wsb-desaturate';
const FOCUS_SCALE_DURATION = 200;
const DIM_INACTIVE_OPACITY = 128;

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
        this._name = 'lidsol-workspace-indicator';
        this._label = 'Workspace Indicator';
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
        this._suppressAnimations = false;
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
        this._settings.showAppIcons.subscribe(() => this._updateWorkspaces());
        this._settings.dimInactiveIcons.subscribe(() => this._applyFocusScale(true));
        this._settings.desaturateInactiveIcons.subscribe(() => this._applyFocusScale(true));
        this._settings.focusScaleEffect.subscribe(() => this._applyFocusScale(true));
        this._settings.focusScaleReduction.subscribe(() => this._applyFocusScale(true));
        this._settings.indicatorStyle.subscribe(() => this._refreshTopBarConfiguration());
        this._focusedWindowId = null;
        this._focusSignalId = global.display.connect('notify::focus-window', () => this._onFocusWindowChanged());
        this._prevWindowIds = '';
    }

    destroy() {
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
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
        this._suppressAnimations = true;
        this._prevActiveIndex = this._ws.currentIndex;
        this._initButton();
        this._menu = new WorkspacesBarMenu(this._extension, this._button.menu);
        this._menu.init();
        this._suppressAnimations = false;
    }

    _initButton() {
        this._button = new WorkspacesButton(0.5, this._label);
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
        Main.panel.addToStatusArea(this._name, this._button);
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
        if (!this._wsBar)
            return icons;
        for (const wsBox of this._wsBar.get_children()) {
            const iconsBox = this._findIconsBox(wsBox);
            if (!iconsBox)
                continue;
            for (const iconWrapper of iconsBox.get_children())
                icons.push(iconWrapper);
        }
        return icons;
    }

    _findIconsBox(wsBox) {
        const content = wsBox.get_child();
        if (!content)
            return null;
        if (content.styleClass?.includes?.('space-bar-ws-icons'))
            return content;
        if (content.get_children) {
            for (const child of content.get_children()) {
                if (child.styleClass?.includes?.('space-bar-ws-icons'))
                    return child;
            }
        }
        return null;
    }

    // Detach every displayed icon wrapper (keyed by windowId) from the bar so the
    // coming full rebuild doesn't destroy them. Old x position is kept so the
    // closing window's neighbours can slide into the freed slot.
    _captureIcons() {
        const map = new Map();
        if (!this._wsBar)
            return map;
        for (const wsBox of this._wsBar.get_children()) {
            const iconsBox = this._findIconsBox(wsBox);
            if (!iconsBox)
                continue;
            const wsIndex = wsBox._delegate?._workspace?.index ?? -1;
            for (const wrapper of iconsBox.get_children().slice()) {
                const winId = wrapper._delegate?.windowObj?.get_id();
                if (winId == null)
                    continue;
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
        if (!icon)
            return;
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
        if (!entries.length)
            return;
        const tryOnce = (attempt) => {
            const first = this._wsBar?.get_children()[0];
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
                if (!e.wrapper.get_parent())
                    continue;
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
        const animsOn = this._settings.enableAnimations.value;
        const oldCount = this._wsBar ? this._wsBar.get_children().length : 0;

        // Detach current icon wrappers (preserving their actors + old x positions)
        // so closed windows can fade out and survivors can slide into place.
        const captured = this._captureIcons();
        const reused = new Set();
        const slideEntries = [];

        this._wsBar?.destroy_all_children();
        this._dragHandler.wsBoxes = [];
        let newCount = 0;
        for (let ws_index = 0; ws_index < this._ws.numberOfEnabledWorkspaces; ++ws_index) {
            const workspace = this._ws.workspaces[ws_index];
            if (workspace.isVisible) {
                let wsBox;
                try {
                    wsBox = this._createWsBox(workspace, animateIcons, captured, reused, slideEntries);
                } catch (e) {
                    console.error(`[WI] failed to build workspace box #${ws_index + 1}:`, e);
                    continue;
                }
                this._wsBar?.add_child(wsBox);
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

    _onFocusWindowChanged() {
        const focusedWin = global.display.get_focus_window();
        const focusedId = focusedWin?.get_id() ?? null;
        if (focusedId === this._focusedWindowId)
            return;
        this._focusedWindowId = focusedId;
        this._applyFocusScale(true);
    }

    _applyFocusScale(animate) {
        if (!this._wsBar)
            return;
        for (const wsBox of this._wsBar.get_children()) {
            const content = wsBox.get_child();
            if (!content)
                continue;
            let iconsBox = null;
            if (content.styleClass?.includes?.('space-bar-ws-icons')) {
                iconsBox = content;
            } else if (content.get_children) {
                for (const child of content.get_children()) {
                    if (child.styleClass?.includes?.('space-bar-ws-icons')) {
                        iconsBox = child;
                        break;
                    }
                }
            }
            if (!iconsBox)
                continue;
            for (const iconWrapper of iconsBox.get_children()) {
                const delegate = iconWrapper._delegate;
                if (!delegate?.windowObj)
                    continue;
                const isFocused = delegate.windowObj.get_id() === this._focusedWindowId;
                const scale = (!this._settings.focusScaleEffect.value || isFocused)
                    ? 1.0 : (1.0 - (this._settings.focusScaleReduction.value / 100));
                iconWrapper.set_pivot_point(0.5, 0.5);

                // Dim: apply opacity on the icon texture, not the wrapper
                const iconTex = iconWrapper.get_first_child();
                if (iconTex) {
                    const dimmed = this._settings.dimInactiveIcons.value && !isFocused;
                    const opacity = dimmed ? DIM_INACTIVE_OPACITY : 255;
                    if (animate) {
                        iconTex.ease({
                            opacity,
                            duration: FOCUS_SCALE_DURATION,
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
                                duration: FOCUS_SCALE_DURATION,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            });
                        } else {
                            desatEffect.factor = factor;
                        }
                    }
                }

                if (animate) {
                    iconWrapper.ease({
                        scale_x: scale,
                        scale_y: scale,
                        duration: FOCUS_SCALE_DURATION,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                } else {
                    iconWrapper.scale_x = scale;
                    iconWrapper.scale_y = scale;
                }
            }
        }
    }

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

        if (workspace.index === this._ws.currentIndex)
            wsBox.styleClass += ' active';
        else if (workspace.windows.length === 0)
            wsBox.styleClass += ' empty';
        else
            wsBox.styleClass += ' inactive';

        if (useIconsSection) {
            wsBox.styleClass += ' space-bar-ws-box-icons';
            let contentState = ' inactive';
            if (workspace.index === this._ws.currentIndex)
                contentState = ' active';
            else if (workspace.windows.length === 0)
                contentState = ' inactive empty';
            const contentBox = new St.BoxLayout({
                xAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'space-bar-ws-content' + contentState,
            });
            label.set_y_expand(true);
            contentBox.add_child(label);
            const iconsBox = this._createAppIcons(workspace, animateIcons, captured, reused, slideEntries);
            iconsBox.set_y_expand(true);
            contentBox.add_child(iconsBox);
            wsBox.set_child(contentBox);
        } else {
            wsBox.set_child(label);
        }

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

    _createLabel(workspace, useIconsSection = false) {
        const label = new St.Label({
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: useIconsSection ? 'space-bar-ws-label' : 'space-bar-workspace-label',
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

    _createAppIcons(workspace, animate = false, captured = null, reused = null, slideEntries = null) {
        const animateOn = animate && this._settings.enableAnimations.value && !this._suppressAnimations;
        const isActive = workspace.index === this._ws.currentIndex;
        const isEmpty = !workspace.hasWindows;
        const preset = ICON_PRESETS[this._settings.iconSizeMode.value] || ICON_PRESETS.medium;
        const iconSize = preset.iconSize;
        let iconClass = 'space-bar-ws-icons';
        iconClass += isActive ? ' active' : ' inactive';
        if (!isActive && isEmpty)
            iconClass += ' empty';
        const iconsBox = new St.BoxLayout({
            styleClass: iconClass,
            xAlign: Clutter.ActorAlign.CENTER,
        });
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
            const iconWrapper = new St.BoxLayout({
                reactive: true,
                track_hover: true,
                styleClass: 'space-bar-app-icon-wrapper',
            });
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
                getDragActorSource() {
                    return iconWrapper;
                },
            };
            DND.makeDraggable(iconWrapper, { restoreOnSuccess: true, manualMode: false });
            if (animateOn) {
                iconWrapper.set_pivot_point(0.5, 0.5);
                iconWrapper.opacity = 0;
                iconWrapper.set_scale(0.5, 0.5);
                iconWrapper.ease({
                    opacity: 255,
                    duration: 300,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                iconWrapper.ease({
                    scale_x: 1,
                    scale_y: 1,
                    duration: 360,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                });
            }
            iconsBox.add_child(iconWrapper);
        }
        return iconsBox;
    }
}
