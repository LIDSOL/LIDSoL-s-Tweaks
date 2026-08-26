'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {
    AppsWidget,
    ClockWidget,
    LevelsWidget,
    MediaWidget,
    SettingsWidget,
    SystemWidget,
    UserWidget,
} from './widgets.js';

export const DashBoardModal = GObject.registerClass(
class DashBoardModal extends ModalDialog.ModalDialog {
    _init(settings) {
        super._init({
            destroyOnClose: false,
            shellReactive: true,
        });
        this._settings = settings;

        const closeBtn = this.addButton({
            action: () => this.close(),
            label: '×',
            key: Clutter.KEY_Escape,
        });
        closeBtn.hide();

        this.contentLayout.reactive = true;
        this.contentLayout.connect('button-press-event', (self, event) => {
            if (this._isOnMediaWidget(event))
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });
        this.connect('button-press-event', () => this.close());

        this.dialogLayout._dialog.add_style_class_name('dashboard');

        this._settings.connectObject(
            'changed::dashboard-x-align', () => this._syncStyle(),
            'changed::dashboard-y-align', () => this._syncStyle(),
            'changed::dashboard-x-offset', () => this._syncStyle(),
            'changed::dashboard-y-offset', () => this._syncStyle(),
            'changed::dashboard-darken', () => this._syncStyle(),
            'changed::dashboard-container-transparent', () => this._syncStyle(),
            'changed::dashboard-dialog-scale', () => this._syncStyle(),
            'changed::dashboard-layout-json', () => this._buildUI(),
            this
        );
        this.connectObject(
            'opened', () => {
                if (this._levelsWidget)
                    this._levelsWidget.startTimeout();
            },
            'closed', () => {
                if (this._levelsWidget)
                    this._levelsWidget.stopTimeout();
            },
            'destroy', () => {
                this._settings.disconnectObject(this);
            },
            this
        );

        this._buildUI();
    }

    _syncStyle() {
        this.dialogLayout._dialog.x_align = this._parseAlign(this._settings.get_int('dashboard-x-align'));
        this.dialogLayout._dialog.y_align = this._parseAlign(this._settings.get_int('dashboard-y-align'));
        this.dialogLayout._dialog.x_expand = true;
        this.dialogLayout._dialog.y_expand = true;
        const xOffset = this._settings.get_int('dashboard-x-offset');
        const yOffset = this._settings.get_int('dashboard-y-offset');

        this.dialogLayout.set_style(`
            padding-top: ${yOffset < 0 ? yOffset * -1 : 0}px;
            padding-bottom: ${yOffset > 0 ? yOffset : 0}px;
            padding-right: ${xOffset < 0 ? xOffset * -1 : 0}px;
            padding-left: ${xOffset > 0 ? xOffset : 0}px;
        `);

        if (this._settings.get_boolean('dashboard-darken'))
            this.set_style('background-color: rgba(0,0,0,0.6);');
        else
            this.set_style('background-color: transparent');

        const scale = this._settings.get_int('dashboard-dialog-scale') / 100;
        const basePadding = 24;
        const padding = Math.max(0, Math.round(basePadding * scale));
        const transparent = this._settings.get_boolean('dashboard-container-transparent');
        const dialogStyle = `padding: ${padding}px;` +
            (transparent ? 'background-color: transparent;' : '');
        this.dialogLayout._dialog.set_style(dialogStyle);
        if (transparent)
            this.dialogLayout._dialog.add_style_class_name('container-transparent');
        else
            this.dialogLayout._dialog.remove_style_class_name('container-transparent');
    }

    _isOnMediaWidget(event) {
        if (!this._mediaWidget)
            return false;
        const source = event.get_source();
        return source ? this._mediaWidget.contains(source) : false;
    }

    _buildUI() {
        if (this._mainBox) {
            this._mainBox.destroy();
            this._mainBox = null;
            this._mediaWidget = null;
            this._levelsWidget = null;
        }

        this._widgetList = {
            apps: () => new AppsWidget(this._settings, this),
            clock: () => new ClockWidget(this._settings, this),
            levels: () => {
                this._levelsWidget = new LevelsWidget(this._settings, this);
                return this._levelsWidget;
            },
            media: () => {
                this._mediaWidget = new MediaWidget(this._settings, this);
                return this._mediaWidget;
            },
            settings: () => new SettingsWidget(this._settings, this),
            system: () => new SystemWidget(this._settings, this),
            user: () => new UserWidget(this._settings, this),
        };

        this._mainBox = new St.BoxLayout({ vertical: true });
        try {
            const layout = JSON.parse(this._settings.get_string('dashboard-layout-json'));
            this._mainBox = this._parseJson(layout);
        } catch (e) {
            console.error('[LIDSoL Dashboard] Error building layout:', e);
        }
        this.contentLayout.add_child(this._mainBox);
        this._syncStyle();
    }

    _parseJson(obj) {
        if (typeof obj === 'string' && this._widgetList[obj]) {
            try {
                return this._widgetList[obj]();
            } catch (e) {
                console.error(`[LIDSoL Dashboard] Error creating widget '${obj}':`, e);
                return new St.BoxLayout({ style_class: 'container' });
            }
        }
        if (obj.type === 'grid')
            return this._parseGrid(obj);
        const box = new St.BoxLayout({
            style_class: 'container',
            vertical: obj.vertical || false,
            y_expand: obj.y_expand || false,
            x_expand: obj.x_expand || false,
            y_align: this._parseAlign(obj.y_align),
            x_align: this._parseAlign(obj.x_align),
        });
        if (obj.width)
            box.set_style(`width: ${obj.width}px;`);
        if (obj.height)
            box.set_style(`${box.get_style() || ''} height: ${obj.height}px;`);
        if (obj.children) {
            for (const ch of obj.children) {
                try {
                    box.add_child(this._parseJson(ch));
                } catch (e) {
                    console.error('[LIDSoL Dashboard] Error parsing child:', e);
                }
            }
        }
        return box;
    }

    _parseGrid(obj) {
        const spacing = this._settings.get_int('dashboard-grid-spacing');
        const columns = obj.columns || this._settings.get_int('dashboard-grid-columns');

        const layout = new Clutter.GridLayout({
            row_spacing: spacing,
            column_spacing: spacing,
            row_homogeneous: false,
            column_homogeneous: false,
        });
        const grid = new St.Widget({
            style_class: 'container grid-container',
            layout_manager: layout,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        layout.hookup_style(grid);

        let nextRow = 0;
        let nextCol = 0;
        const children = obj.children || [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            try {
                const widget = this._parseGridChild(child);
                if (!widget)
                    continue;

                const col = child.col ?? nextCol;
                const row = child.row ?? nextRow;
                const colSpan = child.col_span ?? 1;
                const rowSpan = child.row_span ?? 1;

                widget.x_expand = true;
                widget.y_expand = true;
                widget.x_align = Clutter.ActorAlign.FILL;
                widget.y_align = Clutter.ActorAlign.FILL;

                layout.attach(widget, col, row, colSpan, rowSpan);

                if (child.col === undefined && child.row === undefined) {
                    nextCol += colSpan;
                    if (nextCol >= columns) {
                        nextCol = 0;
                        nextRow++;
                    }
                }
            } catch (e) {
                console.error('[LIDSoL Dashboard] Error parsing grid child:', e);
            }
        }
        return grid;
    }

    _parseGridChild(child) {
        if (typeof child === 'string')
            return this._widgetList[child]();
        if (child.widget && this._widgetList[child.widget])
            return this._widgetList[child.widget]();
        if (child.type === 'grid' || child.vertical !== undefined || child.children)
            return this._parseJson(child);
        return null;
    }

    _parseAlign(align) {
        switch (align) {
        case 'START': return Clutter.ActorAlign.START;
        case 'CENTER': return Clutter.ActorAlign.CENTER;
        case 'END': return Clutter.ActorAlign.END;
        case 1: return Clutter.ActorAlign.START;
        case 2: return Clutter.ActorAlign.CENTER;
        case 3: return Clutter.ActorAlign.END;
        default: return Clutter.ActorAlign.FILL;
        }
    }
});


