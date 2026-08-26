import Meta from "gi://Meta";
import St from "gi://St";
import Shell from "gi://Shell";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as DND from "resource:///org/gnome/shell/ui/dnd.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import GLib from "gi://GLib";

const ICON_TIMEOUT = 200;
const GAP_HALF_WIDTH = 15;

// Slow-motion multiplier for inspecting animations during development (1 = normal).
const ANIM_SLOWMO = 1;

const FOCUS_ANIM_DURATION_MS = 200;
const DIM_INACTIVE_OPACITY = 128;
const DESATURATE_EFFECT_NAME = 'wsb-desaturate';

const ARROW_STRIP_WIDTH = 14;
const OVERFLOW_TOLERANCE = 4;
const SYNC_DEBOUNCE_MS = 50;
const SYNC_RETRY_MS = 120;
const SCROLL_SCHEDULE_MS = 30;
const SCROLL_RETRY_MS = 80;
const VIEWPORT_INIT_DELAY_MS = 100;
const VIEWPORT_MAX_PANEL_FRACTION = 0.4;
const WHEEL_STEP_PX = 40;

export class WorkspaceBar {
    constructor(ext) {
        this._ext = ext;
        this._destroyed = false;
        // Gap-drop animation state — kept on the instance (NOT reset in _setup) so
        // it survives the deferred rebuild that runs between drop and animation.
        this._gapDropInProgress = false;
        this._pendingGapAnim = null;
        this._reorderFlip = null;
    }

    init() {
        this._setup();
    }

    _setup() {
        this._container = null;
        this._clip = null;
        this._viewport = null;
        this._arrowLeft = null;
        this._arrowRight = null;
        this._winIdsRepr = []; // [ws0[winId, winId], ws1[winId], ...]  — primary assignment only
        this._stickyListenerIds = new Map(); // winId -> { windowObj, signalId } for notify::on-all-workspaces
        this._stickyReconcileId = null;
        this._rebuildId = null;
        this._gnomeEventIds = { display: [], workspace_manager: [] };
        this._mainEventIds = { layoutManager: [], panel: [], overview: [] };
        this._glibTimeoutIds = new Set();
        this._gapDragMonitor = null;
        this._insertionIndicator = null;
        this._currentInsertIndex = -1;
        this._gapDropWindowObj = null;
        this._scrollOffset = 0;
        this._availableWidth = 0;
        this._syncPending = false;
        this._focusedWindowId = global.display.get_focus_window()?.get_id() ?? null;
        this._menuManager = null;
        this._contextMenu = null;

        this._createContainer();
        this._insertContainer();
        this._initialPopulation();
        this._connectSignals();

        this._scheduleTimeout(VIEWPORT_INIT_DELAY_MS, () => this._updateAvailableWidth());
    }

    destroy(full = true) {
        this._destroyed = true;
        this._unregisterGapDragMonitor();

        if (this._viewport) {
            this._removeContainer();
            this._viewport.destroy();
            this._viewport = null;
            this._clip = null;
            this._container = null;
            this._arrowLeft = null;
            this._arrowRight = null;
        }

        // Disconnect GNOME signals
        for (let component in this._gnomeEventIds) {
            let obj = component === 'display' || component === 'workspace_manager'
                ? global[component] : Main[component];
            for (let id of this._gnomeEventIds[component]) {
                obj.disconnect(id);
            }
        }
        this._gnomeEventIds = null;

        for (let component in this._mainEventIds) {
            for (let id of this._mainEventIds[component]) {
                Main[component].disconnect(id);
            }
        }
        this._mainEventIds = null;

        // Clear timeouts
        for (let timeoutId of this._glibTimeoutIds) {
            GLib.Source.remove(timeoutId);
        }
        this._glibTimeoutIds.clear();
        this._glibTimeoutIds = null;

        // Clean up window-added events on workspaces
        for (let i = 0; i < global.workspace_manager.get_n_workspaces(); i++) {
            let wsObj = global.workspace_manager.get_workspace_by_index(i);
            if (wsObj.hasOwnProperty("_wsbWindowAddedId")) {
                wsObj.disconnect(wsObj._wsbWindowAddedId);
                delete wsObj._wsbWindowAddedId;
            }
        }

        // Disconnect per-window sticky listeners
        if (this._stickyListenerIds) {
            for (let entry of this._stickyListenerIds.values()) {
                try { entry.windowObj.disconnect(entry.signalId); } catch (_e) {}
            }
            this._stickyListenerIds.clear();
            this._stickyListenerIds = null;
        }

        this._winIdsRepr = null;

        if (this._contextMenu) { this._contextMenu.destroy(); this._contextMenu = null; }
        this._menuManager = null;

        if (full) {
            this._ext = null;
        } else {
            this._destroyed = false;
        }
    }

    // ===================== CONTAINER =====================

    _createContainer() {
        this._container = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
        });

        this._clip = new St.Widget({
            reactive: true,
            clip_to_allocation: true,
            x_expand: false,
            y_expand: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._clip.add_child(this._container);

        this._viewport = new St.Widget({
            reactive: true,
            clip_to_allocation: true,
            x_expand: false,
            y_expand: true,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._viewport.add_child(this._clip);

        this._arrowLeft = new St.Label({
            text: '◂',
            style_class: "wsb-overflow-arrow",
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._arrowRight = new St.Label({
            text: '▸',
            style_class: "wsb-overflow-arrow",
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._viewport.add_child(this._arrowLeft);
        this._viewport.add_child(this._arrowRight);

        this._viewport.connect('notify::width', () => this._updateOverlays());
        this._viewport.connect('notify::height', () => this._updateOverlays());
        this._viewport.connect('scroll-event', (_actor, event) => this._onScrollEvent(event));
    }

    _onScrollEvent(event) {
        let dir = event.get_scroll_direction();
        let active = global.workspace_manager.get_active_workspace_index();
        let nWs = global.workspace_manager.get_n_workspaces();

        if (dir === Clutter.ScrollDirection.UP) {
            if (active > 0)
                global.workspace_manager.get_workspace_by_index(active - 1).activate(global.get_current_time());
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.DOWN) {
            if (active < nWs - 1)
                global.workspace_manager.get_workspace_by_index(active + 1).activate(global.get_current_time());
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

    _insertContainer() {
        let pos = this._ext.getPosition();
        let posIndex = this._ext.getPositionIndex();
        let box;
        if (pos === 'center') box = Main.panel._centerBox;
        else if (pos === 'right') box = Main.panel._rightBox;
        else box = Main.panel._leftBox;

        let maxIndex = box.get_n_children();
        box.insert_child_at_index(this._viewport, Math.min(posIndex, maxIndex));
    }

    _removeContainer() {
        let parent = this._viewport.get_parent();
        if (parent) parent.remove_child(this._viewport);
    }

    onPositionChanged() {
        if (!this._viewport) return;
        this._removeContainer();
        this._insertContainer();
        this._updateAvailableWidth();
    }

    onSizeModeChanged() {
        if (!this._container) return;
        this._regenerateIcons();
    }

    onLeftMarginChanged() {
        if (!this._viewport) return;
        this._applyViewportWidth();
    }

    // Single entry point for every setting that changes how icons are drawn
    // per focus state: scale, dim and desaturation all invalidate the same way.
    onIconEffectsChanged() {
        this._refreshAllIconEffects(true);
    }

    // ===================== FOCUS-DEPENDENT ICON EFFECTS =====================

    _onFocusWindowChanged() {
        if (!this._container) return;
        let focusedId = global.display.get_focus_window()?.get_id() ?? null;
        if (focusedId === this._focusedWindowId) return;
        this._focusedWindowId = focusedId;
        this._refreshAllIconEffects(true);
    }

    _refreshAllIconEffects(animate) {
        if (!this._container) return;
        for (let btn of this._container.get_children()) {
            let iconsWrapper = btn.get_children()[1];
            if (!iconsWrapper) continue;
            for (let iconWrapper of iconsWrapper.get_children()) {
                this._applyIconEffects(iconWrapper, animate);
            }
        }
    }

    _applyIconEffects(wrapper, animate) {
        let iconTex = wrapper._iconTex;
        if (!iconTex) return;

        let isFocused = wrapper.windowId === this._focusedWindowId;
        let animated = animate && this._ext.getEnableAnimations();

        let scaleEnabled = this._ext.getFocusScaleEffect();
        let reduction = Math.max(0, Math.min(95, this._ext.getFocusScaleReduction())) / 100;
        let scale = (!scaleEnabled || isFocused) ? 1.0 : (1 - reduction);

        // Dim rides on the icon texture, never on the wrapper: the wrapper's own
        // opacity is already spoken for by the pop-in/fade-out animations and by
        // the drag-begin feedback. Clutter composes the two, so both keep working.
        let dimmed = this._ext.getDimInactiveIcons() && !isFocused;
        let opacity = dimmed ? DIM_INACTIVE_OPACITY : 255;

        if (animated) {
            iconTex.ease({
                scale_x: scale,
                scale_y: scale,
                opacity,
                duration: FOCUS_ANIM_DURATION_MS * ANIM_SLOWMO,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            iconTex.scale_x = scale;
            iconTex.scale_y = scale;
            iconTex.opacity = opacity;
        }

        this._applyIconDesaturation(iconTex, isFocused, animated);
    }

    // Grayscale for every icon except the focused one. The shader is attached
    // only while the setting is on and removed as soon as it goes off, so in the
    // default configuration no icon carries an effect at all.
    _applyIconDesaturation(iconTex, isFocused, animated) {
        let effect = iconTex.get_effect(DESATURATE_EFFECT_NAME);

        if (!this._ext.getDesaturateInactiveIcons()) {
            if (effect) iconTex.remove_effect(effect);
            return;
        }

        if (!effect) {
            effect = new Clutter.DesaturateEffect({ factor: 0 });
            iconTex.add_effect_with_name(DESATURATE_EFFECT_NAME, effect);
        }

        let factor = isFocused ? 0 : 1;
        if (animated) {
            iconTex.ease_property(`@effects.${DESATURATE_EFFECT_NAME}.factor`, factor, {
                duration: FOCUS_ANIM_DURATION_MS * ANIM_SLOWMO,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            effect.factor = factor;
        }
    }

    // ===================== OVERFLOW HANDLING =====================

    _scheduleTimeout(ms, callback) {
        if (this._destroyed) return 0;
        let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._glibTimeoutIds?.delete(id);
            if (!this._destroyed) callback();
            return GLib.SOURCE_REMOVE;
        });
        this._glibTimeoutIds.add(id);
        return id;
    }

    _updateAvailableWidth() {
        if (!this._viewport || this._destroyed) return;
        let panel = Main.panel;
        if (!panel) return;

        let panelW = panel.get_width();
        if (panelW <= 0) return;

        // Sum the siblings in the SAME panel box the viewport lives in (left,
        // center or right per the position setting) — not always _leftBox — so the
        // width budget is right for center/right placements too.
        let pos = this._ext.getPosition();
        let box = pos === 'center' ? panel._centerBox
            : pos === 'right' ? panel._rightBox
            : panel._leftBox;
        let siblingsW = 0;
        for (let child of box.get_children()) {
            if (child === this._viewport) continue;
            let [, natW] = child.get_preferred_width(-1);
            siblingsW += natW;
        }

        this._availableWidth = Math.max(120, panelW * VIEWPORT_MAX_PANEL_FRACTION - siblingsW);
        this._applyViewportWidth();
    }

    _applyViewportWidth() {
        if (!this._viewport || !this._container || this._destroyed) return;

        let contentW = this._container.get_width();
        let leftMargin = this._ext.getLeftMargin();
        let avail = this._availableWidth || 600;

        // Without arrow strips reserved: natural content + left margin.
        // When that exceeds the budget, fall back to the budget and let
        // _updateOverlays reserve the strips and enable scrolling.
        let desired = contentW + leftMargin;
        let w = (contentW > 0 && desired <= avail) ? desired : avail;

        this._viewport.set_width(w);
        this._viewport.style = `width: ${w}px; min-width: ${w}px; max-width: ${w}px;`;
        this._updateOverlays();
    }

    _scheduleSync() {
        if (this._destroyed || this._syncPending) return;
        // Size the container to its content IMMEDIATELY so a just-added cell/icon
        // isn't crammed into the previous (now-too-small) fixed width — that brief
        // horizontal squeeze (numbers vanishing) flashed before every animation.
        // The debounced _syncContainerWidth below re-applies the proper width/overflow.
        if (this._container) this._container.set_width(-1);
        this._syncPending = true;
        this._scheduleTimeout(SYNC_DEBOUNCE_MS, () => {
            this._syncPending = false;
            this._syncContainerWidth();
        });
    }

    _syncContainerWidth() {
        if (!this._container || this._destroyed) return;

        let children = this._container.get_children();
        if (children.length === 0) {
            this._container.set_width(-1);
            this._applyViewportWidth();
            return;
        }

        let total = 0;
        let hasPending = false;
        for (let c of children) {
            let [, natW] = c.get_preferred_width(-1);
            if (natW <= 0) hasPending = true;
            total += natW;
        }

        let preset = this._ext.getPreset();
        let minExpected = children.length * (preset.iconSize + preset.numSpacing * 2 + 8);
        if (hasPending || total < minExpected) {
            this._scheduleTimeout(SYNC_RETRY_MS, () => this._syncContainerWidth());
            return;
        }

        total += (children.length - 1) * (preset.btnSpacing || 6);
        total += 8;

        this._container.set_width(total);
        this._applyViewportWidth();
    }

    _realContentWidth() {
        if (!this._container) return 0;
        let children = this._container.get_children();
        if (children.length === 0) return 0;
        let last = children[children.length - 1].get_allocation_box();
        return last.x2;
    }

    _setScrollOffset(offset) {
        if (!this._viewport || !this._container || !this._clip || this._destroyed) return;

        let innerW = this._clip.get_width();
        if (innerW <= 0) return;

        let contentW = this._realContentWidth();
        let maxOffset = Math.max(0, contentW - innerW);
        this._scrollOffset = Math.max(0, Math.min(maxOffset, offset));
        this._container.set_x(-this._scrollOffset);
        this._updateOverlays();
    }

    _scheduleScrollToActive() {
        if (this._destroyed || !this._viewport) return;
        this._scheduleTimeout(SCROLL_SCHEDULE_MS, () => this._scrollToActive());
    }

    _scrollToActive() {
        if (!this._viewport || !this._container || !this._clip || this._destroyed) return;

        let active = global.workspace_manager.get_active_workspace_index();
        let children = this._container.get_children();
        if (active < 0 || active >= children.length) return;

        let innerW = this._clip.get_width();
        if (innerW <= 0) return;

        let btn = children[active];
        let alloc = btn.get_allocation_box();
        let btnX = alloc.x1;
        let btnW = alloc.x2 - alloc.x1;

        if (btnW <= 0 || (btnX === 0 && active > 0)) {
            this._scheduleTimeout(SCROLL_RETRY_MS, () => this._scrollToActive());
            return;
        }

        let contentW = this._realContentWidth();
        if (contentW <= innerW) {
            this._setScrollOffset(0);
            return;
        }

        let peek = Math.min(30, Math.floor(innerW / 8));
        let viewStart = this._scrollOffset;
        let viewEnd = viewStart + innerW;
        let maxOffset = Math.max(0, contentW - innerW);

        let target = null;
        if (btnX < viewStart + peek) {
            target = Math.max(0, btnX - peek);
        } else if (btnX + btnW > viewEnd - peek) {
            target = btnX + btnW - innerW + peek;
        }

        if (target === null) return;

        target = Math.max(0, Math.min(maxOffset, target));
        this._scrollOffset = target;
        this._container.set_x(-this._scrollOffset);
        this._updateOverlays();
    }

    _updateOverlays() {
        if (!this._viewport || !this._container || !this._clip || this._destroyed) return;
        if (!this._arrowLeft || !this._arrowRight) return;

        let viewW = this._viewport.get_width();
        let viewH = this._viewport.get_height();
        if (viewW <= 0 || viewH <= 0) return;

        let leftMargin = this._ext.getLeftMargin();
        let contentW = this._realContentWidth();

        // Overflow when the content is wider than the viewport minus the left margin.
        // Only then do we reserve the arrow strips; otherwise layout mirrors v1.
        let availForContent = Math.max(0, viewW - leftMargin);
        let hasOverflow = contentW > availForContent + OVERFLOW_TOLERANCE;

        let clipX, clipW;
        if (hasOverflow) {
            clipX = leftMargin + ARROW_STRIP_WIDTH;
            clipW = Math.max(0, viewW - clipX - ARROW_STRIP_WIDTH);
        } else {
            clipX = leftMargin;
            clipW = Math.min(contentW > 0 ? contentW : availForContent, availForContent);
        }

        this._clip.set_position(clipX, 0);
        this._clip.set_width(clipW);
        this._clip.set_height(viewH);

        let [, containerH] = this._container.get_preferred_height(-1);
        let effectiveH = Math.max(viewH, containerH);
        this._container.set_height(effectiveH);
        this._container.set_y(Math.floor((viewH - effectiveH) / 2));

        let [, arrowH] = this._arrowLeft.get_preferred_height(-1);
        let yCenter = Math.max(0, Math.floor((viewH - arrowH) / 2));
        this._arrowLeft.set_position(leftMargin, yCenter);
        this._arrowRight.set_position(Math.max(0, viewW - ARROW_STRIP_WIDTH), yCenter);

        let maxOffset = Math.max(0, contentW - clipW);
        if (!hasOverflow) {
            this._scrollOffset = 0;
        } else if (this._scrollOffset > maxOffset) {
            this._scrollOffset = maxOffset;
        }
        this._container.set_x(-this._scrollOffset);

        this._arrowLeft.visible = hasOverflow && this._scrollOffset > OVERFLOW_TOLERANCE;
        this._arrowRight.visible = hasOverflow && (this._scrollOffset + clipW < contentW - OVERFLOW_TOLERANCE);
    }

    // ===================== INITIAL POPULATION =====================

    _initialPopulation() {
        let nWs = global.workspace_manager.get_n_workspaces();
        for (let wsIndex = 0; wsIndex < nWs; wsIndex++) {
            this._winIdsRepr.push([]);
            this._addWorkspaceButton(wsIndex);

            let windows = this._getWorkspaceWindows(wsIndex);
            for (let windowObj of windows) {
                let winId = windowObj.get_id();
                this._winIdsRepr[wsIndex].push(winId);
                this._addWindowIcon("r", windowObj, wsIndex);
                this._connectStickyListener(windowObj);
            }

            this._addWindowAddedEvent(wsIndex);
        }

        // Mirror genuinely-sticky windows. Deferred: is_on_all_workspaces()
        // reads true transiently while mutter reassigns a window's workspace
        // (overview drag, gap-drop rebuild). Reconciling on a later tick reads
        // the SETTLED state, so transient stickiness never leaves stuck mirrors.
        this._scheduleStickyReconcile();

        this._updateActiveWorkspace();
    }

    // ===================== WORKSPACE BUTTONS =====================

    _addWorkspaceButton(wsIndex) {
        let btnWrapper = new St.BoxLayout({ style_class: "wsb-ws-btn-wrapper", reactive: true });
        btnWrapper.wsIndex = wsIndex;

        let wsNumWrapper = new St.BoxLayout({ style_class: "wsb-ws-num-wrapper" });
        let wsNum = new St.Label({
            text: `${wsIndex + 1}`,
            style_class: "wsb-ws-num-label-elem",
            y_align: Clutter.ActorAlign.CENTER,
        });
        wsNumWrapper.add_child(wsNum);
        btnWrapper._wsbNumLabel = wsNum; // direct ref (avoids a deep get_children() chain)
        btnWrapper.add_child(wsNumWrapper);

        let iconsWrapper = new St.BoxLayout({ style_class: "wsb-icons-wrapper" });
        btnWrapper.add_child(iconsWrapper);

        // DnD: workspace button is both a drop target and a drag source
        let self = this;
        btnWrapper._delegate = {
            handleDragOver(source, actor, x, y) {
                if (!self._container) return DND.DragMotionResult.CONTINUE;
                // DnD only calls handleDragOver on the target UNDER the cursor — it
                // never signals the one you just left. So clear the highlight from
                // ALL cells first, then mark the current one; otherwise every cell
                // dragged across stays highlighted.
                if (source.windowObj) {
                    self._clearDragHover();
                    if (self._insertionIndicator) return DND.DragMotionResult.CONTINUE;
                    btnWrapper.add_style_class_name("wsb-ws-btn-drag-hover");
                    return DND.DragMotionResult.MOVE_DROP;
                }
                if (source.wsButton && source.actor !== btnWrapper) {
                    self._clearDragHover();
                    btnWrapper.add_style_class_name("wsb-ws-btn-drag-hover");
                    return DND.DragMotionResult.MOVE_DROP;
                }
                return DND.DragMotionResult.CONTINUE;
            },
            acceptDrop(source) {
                btnWrapper.remove_style_class_name("wsb-ws-btn-drag-hover");
                if (source.windowObj) {
                    source.windowObj.change_workspace_by_index(btnWrapper.wsIndex, false);
                    global.workspace_manager.get_workspace_by_index(btnWrapper.wsIndex).activate(global.get_current_time());
                    self._scheduleWorkspaceCleanup();
                    return true;
                }
                if (source.wsButton) {
                    let srcIdx = source.actor.wsIndex;
                    let tgtIdx = btnWrapper.wsIndex;
                    if (srcIdx === tgtIdx) return false;
                    // FLIP: capture each cell's current screen X so the deferred
                    // rebuild can slide the cells from old → new positions.
                    let oldXs = self._container.get_children().map(
                        c => c.get_transformed_position()[0]);
                    self._reorderFlip = { oldXs, src: srcIdx, tgt: tgtIdx };
                    let wsObj = global.workspace_manager.get_workspace_by_index(srcIdx);
                    global.workspace_manager.reorder_workspace(wsObj, tgtIdx);
                    global.workspace_manager.get_workspace_by_index(tgtIdx).activate(global.get_current_time());
                    self._scheduleWorkspaceCleanup();
                    // Schedule the rebuild ourselves (idempotent): if the reorder is a
                    // no-op it emits no 'workspaces-reordered', which would otherwise
                    // leave _reorderFlip stuck non-null and disable the ws add/remove
                    // handlers. Mirrors the gap-drop path.
                    self._scheduleRebuild();
                    return true;
                }
                return false;
            },
            actor: btnWrapper,
            wsButton: true,
            getDragActor() {
                return new St.Label({
                    text: `${btnWrapper.wsIndex + 1}`,
                    style_class: 'wsb-ws-num-label-elem',
                    style: 'background-color: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 6px;',
                });
            },
            getDragActorSource() {
                return btnWrapper;
            },
        };

        let draggable = DND.makeDraggable(btnWrapper);
        draggable.connect('drag-begin', () => {
            btnWrapper.opacity = 128;
            btnWrapper._isDragging = true;
        });
        let onDragReset = () => {
            if (!self._container) return;
            btnWrapper.opacity = 255;
            btnWrapper._isDragging = false;
            self._clearDragHover();
        };
        draggable.connect('drag-end', onDragReset);
        draggable.connect('drag-cancelled', onDragReset);

        this._container.insert_child_at_index(btnWrapper, wsIndex);
        this._updateWsNumbers();

        // Click handler
        btnWrapper.connect("button-release-event", (actor, event) => {
            if (actor._isDragging) return Clutter.EVENT_PROPAGATE;

            let button = event.get_button();

            // Right click → context menu with a "Settings" item
            if (button === Clutter.BUTTON_SECONDARY) {
                self._openContextMenu(btnWrapper);
                return Clutter.EVENT_STOP;
            }

            if (button !== Clutter.BUTTON_PRIMARY && button !== Clutter.BUTTON_MIDDLE)
                return Clutter.EVENT_PROPAGATE;

            // Detect if an icon was clicked (needed by both middle- and primary-click)
            let clickedWindowObj;
            let stage = actor.get_stage();
            let [x, y] = event.get_coords();
            let elemClicked = stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
            let curElem = elemClicked;
            while (curElem && curElem !== actor) {
                if (curElem.has_style_class_name && curElem.has_style_class_name('wsb-single-icon-wrapper')) {
                    clickedWindowObj = curElem.windowObj;
                    break;
                }
                curElem = curElem.get_parent();
            }

            // Middle click on an app icon → close that window, when enabled in
            // preferences. Middle click anywhere else on the workspace button
            // (number badge, empty space, the gap between icons) keeps toggling
            // the Overview, as it always did.
            if (button === Clutter.BUTTON_MIDDLE) {
                if (clickedWindowObj && self._ext.getMiddleClickClose())
                    clickedWindowObj.delete(global.get_current_time());
                else
                    Main.overview.toggle();
                return Clutter.EVENT_STOP;
            }

            // Icon click while in Overview
            if (clickedWindowObj && Main.overview.visible) {
                let focusedWindow = global.display.get_focus_window();
                if (focusedWindow && focusedWindow.get_id() === clickedWindowObj.get_id()) {
                    // Already focused → close overview
                    Main.overview.hide();
                } else {
                    // Not focused → activate window (closes overview naturally)
                    global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
                    clickedWindowObj.activate(global.get_current_time());
                }
                return Clutter.EVENT_STOP;
            }

            if (actor.wsIndex === global.workspace_manager.get_active_workspace_index() && !clickedWindowObj) {
                Main.overview.toggle();
            } else {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
            }

            if (clickedWindowObj) {
                clickedWindowObj.get_compositor_private()?.grab_key_focus();
                clickedWindowObj.activate(global.get_current_time());
            }
        });

        return btnWrapper;
    }

    _updateWsNumbers() {
        if (!this._container) return;
        let children = this._container.get_children();
        for (let i = 0; i < children.length; i++) {
            children[i].wsIndex = i;
            children[i]._wsbNumLabel.text = `${i + 1}`;
        }
    }

    _updateActiveWorkspace() {
        if (!this._container) return;
        let activeWs = global.workspace_manager.get_active_workspace_index();

        for (let btn of this._container.get_children()) {
            let [numWrapper, iconsWrapper] = btn.get_children();
            if (btn.wsIndex === activeWs) {
                numWrapper.add_style_class_name("wsb-ws-num-wrapper-active");
                iconsWrapper.add_style_class_name("wsb-icons-wrapper-active");
            } else {
                numWrapper.remove_style_class_name("wsb-ws-num-wrapper-active");
                iconsWrapper.remove_style_class_name("wsb-icons-wrapper-active");
            }
        }

        this._scheduleSync();
        this._scheduleScrollToActive();
    }

    // ===================== WINDOW ICONS =====================

    _addWindowIcon(loc, windowObj, wsIndex) {
        let iconElem = this._createWindowIcon(windowObj);
        let iconsWrapper = this._container.get_children()[wsIndex].get_children()[1];
        if (loc === "l") {
            iconsWrapper.insert_child_at_index(iconElem, 0);
        } else {
            // Append primary BEFORE any sticky mirrors so primary indices keep
            // matching _winIdsRepr[ws]
            let firstMirrorIdx = this._findFirstMirrorIndex(iconsWrapper);
            if (firstMirrorIdx < 0) iconsWrapper.add_child(iconElem);
            else iconsWrapper.insert_child_at_index(iconElem, firstMirrorIdx);
        }
        this._scheduleSync();
        return iconElem;
    }

    _moveWindowIcon(oldWsIndex, oldWinIndex, newWsIndex, newWinIndex) {
        let oldParent = this._container.get_children()[oldWsIndex].get_children()[1];
        let elem = oldParent.get_children()[oldWinIndex];
        oldParent.remove_child(elem);
        let newParent = this._container.get_children()[newWsIndex].get_children()[1];
        newParent.insert_child_at_index(elem, newWinIndex);
        // Smooth arrival: the icon pops in at its new workspace.
        this._animateIconIn(elem);
    }

    // ----- reusable transform-only icon/cell transitions -----

    // Fade + spring pop-in an actor from a starting scale to full size.
    _popIn(actor, startScale) {
        actor.set_pivot_point(0.5, 0.5);
        actor.opacity = 0;
        actor.set_scale(startScale, startScale);
        actor.ease({
            opacity: 255,
            duration: 300 * ANIM_SLOWMO,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 360 * ANIM_SLOWMO,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    _animateIconIn(icon) {
        if (!icon || !this._ext.getEnableAnimations()) return;
        icon.remove_all_transitions();
        this._popIn(icon, 0.5);
    }

    // Fade a closing window's icon out IN PLACE — no reparent, no scale — so it
    // keeps its exact size and position while disappearing, and the cell keeps its
    // height (the icon stays in the wrapper until the fade ends). The model entry
    // and the actor are removed only on completion (the winId is re-found in case
    // indices shifted), so _winIdsRepr stays aligned with the wrapper throughout.
    _animateIconOut(icon, winId) {
        if (!icon) return;
        if (!this._ext.getEnableAnimations()) { this._finalizeClosedIcon(icon, winId); return; }
        icon.ease({
            opacity: 0,
            duration: 260 * ANIM_SLOWMO,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._finalizeClosedIcon(icon, winId),
        });
    }

    _finalizeClosedIcon(icon, winId) {
        if (this._winIdsRepr) {
            for (let w = 0; w < this._winIdsRepr.length; w++) {
                let idx = this._winIdsRepr[w].indexOf(winId);
                if (idx >= 0) { this._winIdsRepr[w].splice(idx, 1); break; }
            }
        }
        // The icon may already be gone if a rebuild destroyed the bar mid-fade.
        try {
            let p = icon.get_parent();
            if (p) p.remove_child(icon);
            icon.destroy();
        } catch (_e) {}
        this._scheduleSync();
    }

    // A freshly-added (usually trailing) workspace cell fades + gently pops in.
    _animateWorkspaceIn(btn) {
        if (!btn || !this._ext.getEnableAnimations()) return;
        this._popIn(btn, 0.7);
    }

    // A removed workspace cell fades out IN PLACE (opacity only — no reparent, no
    // scale) so it keeps its exact size + position while disappearing. The button
    // stays in the container and its _winIdsRepr entry is kept until the fade ends,
    // so the model stays aligned. To avoid the old pile-up under rapid dynamic-
    // workspace churn, any still-fading cell is finalised before a new collapse
    // starts (at most one fades at a time).
    _animateWorkspaceCollapse(wsIndex) {
        if (!this._container) return;
        this._finalizeAllDyingCells();
        let button = this._container.get_children()[wsIndex];
        if (!button) return;
        button._wsbDying = true;
        if (!this._ext.getEnableAnimations()) { this._finalizeDyingCell(button); return; }
        button.ease({
            opacity: 0,
            duration: 280 * ANIM_SLOWMO,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._finalizeDyingCell(button),
        });
    }

    // Remove a finished/preempted dying cell: drop its actor + its _winIdsRepr entry
    // (at the button's real current index, in case ws were added/removed meanwhile),
    // then renumber + refresh the active highlight.
    _finalizeDyingCell(button) {
        if (!button || !button._wsbDying) return;
        button._wsbDying = false;
        // The button may already be gone if a rebuild destroyed the bar mid-fade.
        try {
            if (this._container) {
                let idx = this._container.get_children().indexOf(button);
                if (idx >= 0) {
                    this._container.remove_child(button);
                    if (this._winIdsRepr && idx < this._winIdsRepr.length)
                        this._winIdsRepr.splice(idx, 1);
                }
            }
            button.destroy();
        } catch (_e) {}
        if (this._container) {
            this._updateWsNumbers();
            this._updateActiveWorkspace();
            this._scheduleSync();
        }
    }

    _finalizeAllDyingCells() {
        if (!this._container) return;
        for (let c of this._container.get_children().slice()) {
            if (c._wsbDying) this._finalizeDyingCell(c);
        }
    }

    _createWindowIcon(windowObj) {
        let iconSize = this._ext.getPreset().iconSize;
        let wrapper = new St.BoxLayout({ style_class: "wsb-single-icon-wrapper", reactive: true });
        wrapper.windowId = windowObj.get_id();
        wrapper.windowObj = windowObj;

        let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
        let iconTex = appObj
            ? appObj.create_icon_texture(iconSize)
            : new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: iconSize });
        iconTex.set_pivot_point(0.5, 0.5);
        wrapper.add_child(iconTex);
        wrapper._iconTex = iconTex;
        this._applyIconEffects(wrapper, false);

        // DnD: make icon draggable
        let self = this;
        wrapper._delegate = {
            windowObj: windowObj,
            actor: wrapper,
            getDragActor() {
                let dragApp = Shell.WindowTracker.get_default().get_window_app(windowObj);
                if (dragApp) return dragApp.create_icon_texture(iconSize);
                return new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: iconSize });
            },
            getDragActorSource() {
                return wrapper;
            },
        };

        let draggable = DND.makeDraggable(wrapper);
        draggable.connect('drag-begin', () => {
            if (!self._container) return;
            wrapper.opacity = 128;
            self._registerGapDragMonitor(windowObj);
        });
        let onDragReset = () => {
            if (!self._container) return;
            wrapper.opacity = 255;
            self._unregisterGapDragMonitor();
            self._clearDragHover();
        };
        draggable.connect('drag-end', onDragReset);
        draggable.connect('drag-cancelled', onDragReset);

        return wrapper;
    }

    _regenerateIcons() {
        if (!this._container) return;
        let allWindows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        let windowsMap = {};
        for (let w of allWindows) windowsMap[w.get_id()] = w;

        for (let btn of this._container.get_children()) {
            let iconsWrapper = btn.get_children()[1];
            let icons = iconsWrapper.get_children();
            for (let i = 0; i < icons.length; i++) {
                let winId = icons[i].windowId;
                if (windowsMap[winId]) {
                    let wasMirror = icons[i]._isStickyMirror;
                    let newIcon = this._createWindowIcon(windowsMap[winId]);
                    if (wasMirror) newIcon._isStickyMirror = true;
                    iconsWrapper.replace_child(icons[i], newIcon);
                }
            }
        }
        this._scheduleSync();
    }

    // ===================== WINDOW TRACKING =====================

    _getWorkspaceWindows(wsIndex) {
        let wsObj = global.workspace_manager.get_workspace_by_index(wsIndex);
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL, wsObj);
        return windows.filter(w => {
            if (w.skip_taskbar) return false;
            // get_tab_list(NORMAL, wsObj) also returns on-all-workspaces windows
            // AND windows mid-reassignment (transient null workspace) for EVERY
            // workspace. Keep a window only on the workspace it actually lives on,
            // otherwise it gets a duplicate PRIMARY icon on every workspace button
            // (the real bug, triggered when another extension — e.g. Quake Terminal
            // — perturbs workspace-move timing). For a sticky window get_workspace()
            // resolves to the active workspace (its anchor); mirror icons for the
            // other workspaces are added separately via _addStickyMirrors.
            return w.get_workspace()?.index() === wsIndex;
        });
    }

    _getWinIdsMeta() {
        let meta = {};
        for (let wsIndex = 0; wsIndex < this._winIdsRepr.length; wsIndex++) {
            for (let winId of this._winIdsRepr[wsIndex]) {
                meta[winId] = { wsIndex };
            }
        }
        return meta;
    }

    // ===================== STICKY WINDOW MIRRORS =====================
    // A sticky ("Always on Visible Workspace") window appears once in _winIdsRepr
    // on its anchor workspace. To make its icon appear in every other workspace
    // button, we add tagged "mirror" icons (_isStickyMirror = true) at the end
    // of the other iconsWrappers. Primary icons keep [0, _winIdsRepr[ws].length)
    // child indices; mirrors always sit at the end so primary indexing stays valid.

    _findPrimaryWsForWindow(winId) {
        for (let i = 0; i < this._winIdsRepr.length; i++) {
            if (this._winIdsRepr[i].includes(winId)) return i;
        }
        return -1;
    }

    _findFirstMirrorIndex(iconsWrapper) {
        let children = iconsWrapper.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._isStickyMirror) return i;
        }
        return -1;
    }

    _findMirrorIcon(winId, wsIndex) {
        let btn = this._container.get_children()[wsIndex];
        if (!btn) return null;
        let iconsWrapper = btn.get_children()[1];
        if (!iconsWrapper) return null;
        for (let icon of iconsWrapper.get_children()) {
            if (icon.windowId === winId && icon._isStickyMirror) return icon;
        }
        return null;
    }

    _connectStickyListener(windowObj) {
        let winId = windowObj.get_id();
        if (this._stickyListenerIds.has(winId)) return;
        let signalId = windowObj.connect('notify::on-all-workspaces', () => {
            this._onWindowStickyChanged(windowObj);
        });
        this._stickyListenerIds.set(winId, { windowObj, signalId });
    }

    _disconnectStickyListener(winId) {
        let entry = this._stickyListenerIds.get(winId);
        if (!entry) return;
        try { entry.windowObj.disconnect(entry.signalId); } catch (_e) {}
        this._stickyListenerIds.delete(winId);
    }

    _onWindowStickyChanged(windowObj) {
        if (!this._container) return;
        let winId = windowObj.get_id();
        if (windowObj.is_on_all_workspaces()) {
            this._addStickyMirrors(windowObj);
        } else {
            this._removeStickyMirrors(winId);
        }
    }

    _addStickyMirrors(windowObj) {
        if (!this._container) return;
        let winId = windowObj.get_id();
        let primaryWs = this._findPrimaryWsForWindow(winId);
        if (primaryWs < 0) return;
        let nWs = this._container.get_children().length;
        for (let wsIndex = 0; wsIndex < nWs; wsIndex++) {
            if (wsIndex === primaryWs) continue;
            if (this._findMirrorIcon(winId, wsIndex)) continue;
            let iconElem = this._createWindowIcon(windowObj);
            iconElem._isStickyMirror = true;
            let iconsWrapper = this._container.get_children()[wsIndex].get_children()[1];
            iconsWrapper.add_child(iconElem); // append at end keeps primary indices valid
        }
        this._scheduleSync();
    }

    _removeStickyMirrors(winId) {
        if (!this._container) return;
        for (let btn of this._container.get_children()) {
            let iconsWrapper = btn.get_children()[1];
            if (!iconsWrapper) continue;
            for (let icon of iconsWrapper.get_children()) {
                if (icon.windowId === winId && icon._isStickyMirror) {
                    iconsWrapper.remove_child(icon);
                }
            }
        }
        this._scheduleSync();
    }

    _hasStickyMirror(winId) {
        if (!this._container) return false;
        for (let btn of this._container.get_children()) {
            let iconsWrapper = btn.get_children()[1];
            if (!iconsWrapper) continue;
            for (let icon of iconsWrapper.get_children()) {
                if (icon.windowId === winId && icon._isStickyMirror) return true;
            }
        }
        return false;
    }

    // Reconcile every tracked window's mirror icons against its REAL, settled
    // is_on_all_workspaces() state. is_on_all_workspaces() briefly returns true
    // while mutter moves a window between workspaces (overview window-drag,
    // gap-drop reorder rebuild, fresh-window placement) without ever emitting a
    // notify::on-all-workspaces to correct it — which used to leave a window's
    // icon mirrored across every workspace button forever. Running this on a
    // settled tick adds mirrors for genuinely-sticky windows and removes the
    // spurious ones from the transient reads.
    _scheduleStickyReconcile() {
        if (this._stickyReconcileId || !this._glibTimeoutIds) return;
        let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ICON_TIMEOUT, () => {
            this._glibTimeoutIds?.delete(id);
            this._stickyReconcileId = null;
            this._reconcileStickyMirrors();
            return GLib.SOURCE_REMOVE;
        });
        this._stickyReconcileId = id;
        this._glibTimeoutIds.add(id);
    }

    _scheduleRebuild() {
        if (this._rebuildId || !this._glibTimeoutIds) return;
        let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ICON_TIMEOUT, () => {
            this._glibTimeoutIds?.delete(id);
            this._rebuildId = null;
            // Always clear the gap/reorder flags so a failure can never leave them
            // stuck (which would hide every future workspace cell).
            let pendingGapAnim = this._pendingGapAnim;
            let reorderFlip = this._reorderFlip;
            this._pendingGapAnim = null;
            this._reorderFlip = null;
            this._gapDropInProgress = false;
            try {
                this.destroy(false);
                this._setup();
                if (pendingGapAnim != null) this._playGapDropAnimation(pendingGapAnim);
                else if (reorderFlip != null) this._playReorderFlip(reorderFlip);
            } catch (e) {
                console.error('[Workspace Bar] rebuild failed', e);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._rebuildId = id;
        this._glibTimeoutIds.add(id);
    }

    // FLIP slide for a workspace reorder: the rebuild already put every cell at its
    // new position; we translate each cell back to where it WAS (captured before the
    // reorder) and ease that offset to 0, so the cells visibly slide into the new
    // order instead of the bar blinking out and back. Transform-only (translation_x).
    _playReorderFlip(flip, attempt = 0) {
        if (!this._container || this._destroyed || !flip) return;
        if (!this._ext.getEnableAnimations()) return; // rebuild already placed cells
        let children = this._container.get_children();
        if (children.length === 0) return;

        // Wait for the rebuilt cells to be allocated so newX is real.
        let firstAlloc = children[0].get_allocation_box();
        if (firstAlloc.x2 - firstAlloc.x1 <= 0 && attempt < 8) {
            this._scheduleTimeout(40, () => this._playReorderFlip(flip, attempt + 1));
            return;
        }

        let { oldXs, src, tgt } = flip;
        // If workspace cleanup changed the cell count between capture and rebuild,
        // the old→new index remap would be off — fall back to the rebuild's already
        // correct instant placement instead of a wrong-direction slide.
        if (children.length !== oldXs.length) return;
        let dur = 360 * ANIM_SLOWMO;
        for (let j = 0; j < children.length; j++) {
            // Which old index holds the workspace now sitting at new index j?
            let oldIndex;
            if (j === tgt) oldIndex = src;
            else if (src < tgt && j >= src && j < tgt) oldIndex = j + 1;
            else if (src > tgt && j > tgt && j <= src) oldIndex = j - 1;
            else oldIndex = j;

            let oldX = oldXs[oldIndex];
            if (oldX == null) continue;
            let newX = children[j].get_transformed_position()[0];
            let delta = oldX - newX;
            if (Math.abs(delta) < 1) continue;

            children[j].translation_x = delta;
            children[j].ease({
                translation_x: 0,
                duration: dur,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    // Apple-style reveal of a gap-dropped app — transform-only so it NEVER fights
    // the layout/overflow machinery (no width pinning, no freezing → no squeeze,
    // clipping, flattening or leftover gaps). The deferred rebuild already placed
    // every cell at its final geometry. We just:
    //   • snap the right-neighbours back to their PRE-INSERT visual spot (translated
    //     left by the new cell's slot width) and glide them to 0 → they slide aside
    //     to "make room", with no initial jump;
    //   • fade the new cell in as it's revealed; spring-pop its icon for delight.
    // translation_x / scale / opacity are post-layout transforms, so allocations,
    // height, clip and sync stay exactly as the normal code computed them.
    _playGapDropAnimation(winId) {
        if (!this._container || this._destroyed) return;
        if (!this._ext.getEnableAnimations()) return; // rebuild already shows final state

        let children = this._container.get_children();
        let newIndex = -1, targetIcon = null;
        for (let i = 0; i < children.length; i++) {
            let iconsWrapper = children[i].get_children()[1];
            if (!iconsWrapper) continue;
            for (let icon of iconsWrapper.get_children()) {
                if (icon.windowId === winId && !icon._isStickyMirror) {
                    newIndex = i;
                    targetIcon = icon;
                    break;
                }
            }
            if (newIndex >= 0) break;
        }
        if (newIndex < 0) return;

        let newCell = children[newIndex];

        // Glide distance ≈ the new cell's slot (preferred width + button spacing).
        // Use PREFERRED width, not allocation, so this whole setup runs synchronously
        // in the rebuild tick — the initial state (cell hidden, neighbours shifted to
        // their pre-insert spot) is in place before the first paint, so there is no
        // flash of the finished layout.
        let preset = this._ext.getPreset();
        let [, cellW] = newCell.get_preferred_width(-1);
        if (cellW <= 0) cellW = preset.iconSize + preset.numSpacing * 2 + 20;
        let offset = cellW + (preset.btnSpacing || 6);

        let dur = 380 * ANIM_SLOWMO;

        // Right-neighbours: start at their old visual position, glide into place.
        for (let i = newIndex + 1; i < children.length; i++) {
            let sib = children[i];
            sib.translation_x = -offset;
            sib.ease({
                translation_x: 0,
                duration: dur,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        // New cell: fade in as it gets revealed.
        newCell.opacity = 0;
        newCell.ease({
            opacity: 255,
            duration: dur,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Icon: gentle spring-pop (uniform scale → no distortion).
        if (targetIcon) {
            targetIcon.set_pivot_point(0.5, 0.5);
            targetIcon.set_scale(0.55, 0.55);
            targetIcon.ease({
                scale_x: 1,
                scale_y: 1,
                delay: 80 * ANIM_SLOWMO,
                duration: dur,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        }

        // Clear stray transforms once done (the eases land on these values anyway;
        // this guards against an interrupting re-layout leaving an offset behind).
        let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, dur + 120 * ANIM_SLOWMO + 30, () => {
            this._glibTimeoutIds?.delete(id);
            if (this._destroyed || !this._container) return GLib.SOURCE_REMOVE;
            for (let c of this._container.get_children()) c.translation_x = 0;
            if (newCell.get_parent()) newCell.opacity = 255;
            if (targetIcon && targetIcon.get_parent()) targetIcon.set_scale(1, 1);
            return GLib.SOURCE_REMOVE;
        });
        this._glibTimeoutIds.add(id);
    }

    _reconcileStickyMirrors() {
        if (!this._container || !this._stickyListenerIds) return;
        for (let entry of this._stickyListenerIds.values()) {
            let windowObj = entry.windowObj;
            let winId, sticky;
            try {
                winId = windowObj.get_id();
                sticky = windowObj.is_on_all_workspaces();
            } catch (_e) {
                continue;
            }
            let hasMirror = this._hasStickyMirror(winId);
            if (sticky && !hasMirror) this._addStickyMirrors(windowObj);
            else if (!sticky && hasMirror) this._removeStickyMirrors(winId);
        }
    }

    // ===================== GNOME SIGNALS =====================

    _connectSignals() {
        // monitors-changed → full rebuild
        this._mainEventIds.layoutManager.push(
            Main.layoutManager.connect('monitors-changed', () => {
                this.destroy(false);
                this._setup();
            })
        );

        // panel width → recompute viewport budget
        this._mainEventIds.panel.push(
            Main.panel.connect('notify::width', () => this._updateAvailableWidth())
        );

        // Overview window-drag + leaving overview: reconcile sticky mirrors once
        // mutter has re-settled the dragged window onto a real workspace, so the
        // transient on-all-workspaces state during the drag can't leave its icon
        // stuck on every workspace button.
        this._mainEventIds.overview.push(
            Main.overview.connect('window-drag-end', () => this._scheduleStickyReconcile()),
            Main.overview.connect('window-drag-cancelled', () => this._scheduleStickyReconcile()),
            Main.overview.connect('hidden', () => this._scheduleStickyReconcile())
        );

        // active-workspace-changed
        this._gnomeEventIds.workspace_manager.push(
            global.workspace_manager.connect("active-workspace-changed", () => {
                this._updateActiveWorkspace();
            })
        );

        // workspace-added
        this._gnomeEventIds.workspace_manager.push(
            global.workspace_manager.connect("workspace-added", (wm, wsIndex) => {
                // During a reorder, dynamic-workspaces briefly spawns a transient
                // empty workspace then removes it. Ignore those churn events — the
                // deferred rebuild produces the correct final set, and reacting here
                // would flash an extra cell right before the FLIP slide.
                if (this._reorderFlip != null) return;
                this._winIdsRepr.splice(wsIndex, 0, []);
                this._addWorkspaceButton(wsIndex);
                // During a gap-drop this button is the transient append-at-end one
                // that the deferred rebuild will replace and animate into place.
                // Keep it invisible + zero-width so it doesn't pop in abruptly.
                if (this._gapDropInProgress) {
                    let btn = this._container.get_children()[wsIndex];
                    btn.opacity = 0;
                    btn.set_width(0);
                } else {
                    // New (usually trailing, dynamic) workspace — fade + pop it in.
                    // Safe now that removals are immediate (no churn pile-up).
                    this._animateWorkspaceIn(this._container.get_children()[wsIndex]);
                }
                this._addWindowAddedEvent(wsIndex);
                // Mirror genuinely-sticky windows into the new workspace.
                // Deferred so a window mid-reassignment (which is what often
                // triggers workspace-added via gap-drop) isn't misread as sticky.
                this._scheduleStickyReconcile();
                this._scheduleSync();
            })
        );

        // workspace-removed
        this._gnomeEventIds.workspace_manager.push(
            global.workspace_manager.connect("workspace-removed", (wm, wsIndex) => {
                if (!this._container) return;
                // See workspace-added: ignore the transient churn during a reorder;
                // the deferred rebuild rebuilds the final set.
                if (this._reorderFlip != null) return;
                // Fade the cell out in place; the repr entry + actor are dropped when
                // the fade finishes (see _finalizeDyingCell), keeping the model aligned.
                this._animateWorkspaceCollapse(wsIndex);
            })
        );

        // workspaces-reordered → full rebuild
        this._gnomeEventIds.workspace_manager.push(
            global.workspace_manager.connect("workspaces-reordered", () => {
                // Deferred: the reorder fires this signal mid-operation, while the
                // moved window's workspace pointer is briefly null — which makes
                // get_tab_list report it on EVERY workspace and used to give it a
                // duplicate primary icon everywhere. Rebuilding on a later tick lets
                // the window settle so each maps to its real workspace exactly once.
                this._scheduleRebuild();
            })
        );

        // notify::focus-window → animate icon scales
        this._gnomeEventIds.display.push(
            global.display.connect('notify::focus-window', () => {
                this._onFocusWindowChanged();
            })
        );

        // window-created
        this._gnomeEventIds.display.push(
            global.display.connect('window-created', (display, newWindowObj) => {
                let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ICON_TIMEOUT, () => {
                    if (!this._container) {
                        this._glibTimeoutIds?.delete(timeoutId);
                        return GLib.SOURCE_REMOVE;
                    }
                    // Commit any in-flight workspace collapse first so container +
                    // _winIdsRepr indices line up with the real workspace_manager
                    // before we place the new icon (matters only with animations on).
                    this._finalizeAllDyingCells();

                    let newWinId, newWsIndex;
                    try {
                        newWinId = newWindowObj.get_id();
                        newWsIndex = newWindowObj.get_workspace().index();
                    } catch (err) {
                        this._glibTimeoutIds?.delete(timeoutId);
                        return GLib.SOURCE_REMOVE;
                    }

                    let wsObj = global.workspace_manager.get_workspace_by_index(newWsIndex);
                    for (let windowObj of global.display.get_tab_list(Meta.TabList.NORMAL, wsObj)) {
                        if (windowObj.get_id() === newWinId) {
                            if (newWindowObj.skip_taskbar) break;
                            if (newWsIndex < this._winIdsRepr.length) {
                                this._winIdsRepr[newWsIndex].unshift(newWinId);
                                let ic = this._addWindowIcon("l", newWindowObj, newWsIndex);
                                this._animateIconIn(ic);
                                this._connectStickyListener(newWindowObj);
                                // Defer: a freshly-mapped window often reads
                                // on-all-workspaces before mutter places it.
                                this._scheduleStickyReconcile();
                            }
                            break;
                        }
                    }

                    this._glibTimeoutIds?.delete(timeoutId);
                    return GLib.SOURCE_REMOVE;
                });

                this._glibTimeoutIds.add(timeoutId);
            })
        );

        // window-left-monitor (window closed or moved to another monitor)
        this._gnomeEventIds.display.push(
            global.display.connect('window-left-monitor', (display, oldMonitorIndex, windowObj) => {
                if (!this._container) return;
                this._finalizeAllDyingCells();

                let winIdsMeta = this._getWinIdsMeta();
                let windowId = windowObj.get_id();

                if (winIdsMeta[windowId] === undefined) return;

                let oldWsIndex = winIdsMeta[windowId].wsIndex;
                let oldWinIndex = this._winIdsRepr[oldWsIndex].indexOf(windowId);
                if (oldWinIndex < 0) return;

                let newMonitor = windowObj.get_monitor();

                if (newMonitor < 0) {
                    // Window was closed — fade its icon out in place. The repr entry
                    // and actor are removed when the fade finishes (see _animateIconOut),
                    // so the model stays aligned and the cell keeps its size meanwhile.
                    let iconsWrapper = this._container.get_children()[oldWsIndex]?.get_children()[1];
                    let icon = iconsWrapper?.get_children()[oldWinIndex];
                    // If the window was sticky, also clean up its mirror icons
                    this._removeStickyMirrors(windowId);
                    this._disconnectStickyListener(windowId);
                    if (icon) this._animateIconOut(icon, windowId);
                    else this._winIdsRepr[oldWsIndex].splice(oldWinIndex, 1);
                }
                // If window just moved to another monitor (same workspace), icon stays — nothing to do
            })
        );
    }

    _addWindowAddedEvent(wsIndex) {
        let wsObj = global.workspace_manager.get_workspace_by_index(wsIndex);

        wsObj._wsbWindowAddedId = wsObj.connect('window-added', (workspace, windowObj) => {
            if (!this._container) return;
            this._finalizeAllDyingCells();

            let windowId = windowObj.get_id();
            let winIdsMeta = this._getWinIdsMeta();

            if (winIdsMeta[windowId] === undefined) return; // New window — handled by window-created

            let oldWsIndex = winIdsMeta[windowId].wsIndex;
            let newWsIndex = workspace.index();

            if (oldWsIndex === newWsIndex) return;

            let oldWinIndex = this._winIdsRepr[oldWsIndex].indexOf(windowId);
            if (oldWinIndex < 0) return;

            this._moveWindowIcon(oldWsIndex, oldWinIndex, newWsIndex, 0);
            this._winIdsRepr[oldWsIndex].splice(oldWinIndex, 1);
            this._winIdsRepr[newWsIndex].unshift(windowId);
        });
    }

    // ===================== DND HELPERS =====================

    _clearDragHover() {
        if (!this._container) return;
        for (let btn of this._container.get_children()) {
            btn.remove_style_class_name("wsb-ws-btn-drag-hover");
        }
    }

    // Right-click context menu on a workspace cell: a single "Settings" item that
    // opens the extension preferences (the GNOME-recommended way to expose prefs).
    _openContextMenu(btnWrapper) {
        if (!Main.sessionMode.allowSettings) return; // not on the lock screen
        if (!this._menuManager)
            this._menuManager = new PopupMenu.PopupMenuManager(this._container);
        if (this._contextMenu) {
            this._contextMenu.destroy();
            this._contextMenu = null;
        }

        let menu = new PopupMenu.PopupMenu(btnWrapper, 0.5, St.Side.TOP);
        // Name the extension explicitly + gear icon so it's clearly THIS extension's
        // settings, not GNOME's general Settings.
        let label = `Workspace Bar Preferences`;
        let item = new PopupMenu.PopupImageMenuItem(label, "preferences-system-symbolic");
        item.connect("activate", () => this._ext.openPreferences());
        menu.addMenuItem(item);

        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();
        this._menuManager.addMenu(menu);
        menu.connect("open-state-changed", (m, isOpen) => {
            if (isOpen) return;
            this._menuManager?.removeMenu(menu);
            if (this._contextMenu === menu) this._contextMenu = null;
            menu.destroy();
        });

        this._contextMenu = menu;
        menu.open();
    }

    _scheduleWorkspaceCleanup() {
        let timeoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try {
                Main.wm._workspaceTracker?._checkWorkspaces();
            } catch (e) {
                console.debug(`[Workspace Bar] workspace cleanup: ${e.message}`);
            }
            this._glibTimeoutIds?.delete(timeoutId);
            return GLib.SOURCE_REMOVE;
        });
        this._glibTimeoutIds.add(timeoutId);
    }

    // ===================== GAP-DROP (create new workspace between buttons) =====================

    _registerGapDragMonitor(windowObj) {
        if (this._gapDragMonitor) return;
        this._gapDropWindowObj = windowObj;
        this._gapDragMonitor = {
            dragMotion: (dragEvent) => this._windowIconDragMotion(dragEvent),
        };
        DND.addDragMonitor(this._gapDragMonitor);
    }

    _unregisterGapDragMonitor() {
        if (this._gapDragMonitor) {
            DND.removeDragMonitor(this._gapDragMonitor);
            this._gapDragMonitor = null;
        }
        this._removeInsertionIndicator();
        this._gapDropWindowObj = null;
    }

    _windowIconDragMotion(dragEvent) {
        if (!this._container) return DND.DragMotionResult.CONTINUE;
        if (!dragEvent.source?.windowObj) return DND.DragMotionResult.CONTINUE;

        let gap = this._detectGapAtPosition(dragEvent.x, dragEvent.y);

        if (gap) {
            if (this._currentInsertIndex !== gap.insertIndex) {
                this._removeInsertionIndicator();
                this._showInsertionIndicator(gap.insertIndex);
            }
            this._clearDragHover();
        } else {
            this._removeInsertionIndicator();
        }

        return DND.DragMotionResult.CONTINUE;
    }

    _detectGapAtPosition(stageX, stageY) {
        if (!this._container) return null;

        let [, containerY] = this._container.get_transformed_position();
        let containerHeight = this._container.get_height();

        if (stageY < containerY || stageY > containerY + containerHeight) return null;

        let children = this._container.get_children();
        if (children.length === 0) return null;

        for (let i = 0; i <= children.length; i++) {
            let gapCenterX;

            if (i === 0) {
                let [btnX] = children[0].get_transformed_position();
                gapCenterX = btnX;
            } else if (i === children.length) {
                let [btnX] = children[i - 1].get_transformed_position();
                gapCenterX = btnX + children[i - 1].get_width();
            } else {
                let [prevX] = children[i - 1].get_transformed_position();
                let prevW = children[i - 1].get_width();
                let [nextX] = children[i].get_transformed_position();
                gapCenterX = (prevX + prevW + nextX) / 2;
            }

            if (Math.abs(stageX - gapCenterX) <= GAP_HALF_WIDTH) {
                return { insertIndex: i };
            }
        }

        return null;
    }

    _showInsertionIndicator(insertIndex) {
        this._removeInsertionIndicator();

        let [containerX, containerY] = this._container.get_transformed_position();
        let containerHeight = this._container.get_height();
        let children = this._container.get_children();

        let indicatorX;
        if (children.length === 0) {
            indicatorX = containerX;
        } else if (insertIndex === 0) {
            let [btnX] = children[0].get_transformed_position();
            indicatorX = btnX - 2;
        } else if (insertIndex >= children.length) {
            let [btnX] = children[children.length - 1].get_transformed_position();
            indicatorX = btnX + children[children.length - 1].get_width() + 2;
        } else {
            let [prevX] = children[insertIndex - 1].get_transformed_position();
            let prevW = children[insertIndex - 1].get_width();
            let [nextX] = children[insertIndex].get_transformed_position();
            indicatorX = (prevX + prevW + nextX) / 2 - 1;
        }

        let inset = 4;
        let hitAreaWidth = GAP_HALF_WIDTH * 2;

        this._insertionIndicator = new St.Widget({
            width: hitAreaWidth,
            height: containerHeight - inset * 2,
            reactive: true,
            layout_manager: new Clutter.BinLayout(),
            // Near-invisible background so Clutter picks this actor for DnD targeting
            style: 'background-color: rgba(0, 0, 0, 0.01);',
        });

        let visualBar = new St.Widget({
            style_class: 'wsb-insertion-indicator',
            width: 5,
            style: 'background-color: white;',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this._insertionIndicator.add_child(visualBar);

        let self = this;
        this._insertionIndicator._delegate = {
            acceptDrop(source) {
                if (!source.windowObj || !self._gapDropWindowObj) return false;

                let windowObj = self._gapDropWindowObj;
                let idx = self._currentInsertIndex;

                self._removeInsertionIndicator();

                // Mark the gap-drop so the intermediate append-at-end button stays
                // hidden and the deferred rebuild animates the new cell into place.
                self._gapDropInProgress = true;
                self._pendingGapAnim = windowObj.get_id();

                let numWs = global.workspace_manager.get_n_workspaces();
                global.workspace_manager.append_new_workspace(false, global.get_current_time());
                let newWsObj = global.workspace_manager.get_workspace_by_index(numWs);
                windowObj.change_workspace_by_index(numWs, false);
                global.workspace_manager.reorder_workspace(newWsObj, idx);
                global.workspace_manager.get_workspace_by_index(idx).activate(global.get_current_time());
                self._scheduleWorkspaceCleanup();
                self._scheduleStickyReconcile();
                // Always schedule the rebuild ourselves: a far-right drop reorders
                // the new ws to the index it's ALREADY at (no-op), so
                // 'workspaces-reordered' never fires — without this the rebuild that
                // reveals the hidden cell + resets _gapDropInProgress would never run,
                // leaving the app icon hidden and every later workspace hidden too.
                // (_scheduleRebuild guards against running twice.)
                self._scheduleRebuild();

                return true;
            },
            handleDragOver(source) {
                if (source.windowObj) return DND.DragMotionResult.MOVE_DROP;
                return DND.DragMotionResult.CONTINUE;
            },
        };

        Main.uiGroup.add_child(this._insertionIndicator);
        this._insertionIndicator.set_position(
            indicatorX - Math.floor(hitAreaWidth / 2),
            containerY + inset
        );

        this._currentInsertIndex = insertIndex;
    }

    _removeInsertionIndicator() {
        if (this._insertionIndicator) {
            let parent = this._insertionIndicator.get_parent();
            if (parent) parent.remove_child(this._insertionIndicator);
            this._insertionIndicator.destroy();
            this._insertionIndicator = null;
            this._currentInsertIndex = -1;
        }
    }
}
