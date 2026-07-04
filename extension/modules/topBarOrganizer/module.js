'use strict';

import St from 'gi://St';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';

export class TopBarOrganizerModule {
    constructor() {
        this._maid = new Maid();
        this._settings = null;
    }

    enable(gsettings, extension) {
        console.log('[LIDSoL Widgets] TopBarOrganizer enable');
        this._settings = gsettings;

        Panel.Panel.prototype._originalAddToPanelBox = Panel.Panel.prototype._addToPanelBox;

        const self = this;
        this._maid.patchJob(Panel.Panel.prototype, '_addToPanelBox',
            function (role, indicator, position, box) {
                Panel.Panel.prototype._originalAddToPanelBox.call(
                    this, role, indicator, position, box
                );
                self._handleNewItemsAndOrderTopBar();
            }
        );

        this._maid.functionJob(() => {
            delete Panel.Panel.prototype._originalAddToPanelBox;
        });

        const keys = [
            'tbo-left-box-order',
            'tbo-center-box-order',
            'tbo-right-box-order',
            'tbo-hide',
            'tbo-show',
        ];
        for (const key of keys) {
            this._maid.connectJob(this._settings, `changed::${key}`, () => {
                this._handleNewItemsAndOrderTopBar();
            });
        }

        this._handleNewItemsAndOrderTopBar();
    }

    disable() {
        console.log('[LIDSoL Widgets] TopBarOrganizer disable');
        if (this._maid) {
            this._maid.clear();
            this._maid.destroy();
        }
        this._settings = null;
    }

    _handleNewItemsAndOrderTopBar() {
        if (!this._settings) return;
        if (Main.sessionMode.currentMode !== 'user' &&
            Main.sessionMode.parentMode !== 'user') {
            return;
        }
        this._saveNewTopBarItems();
        this._orderTopBarItems('left');
        this._orderTopBarItems('center');
        this._orderTopBarItems('right');
    }

    _getBoxOrder(box) {
        return this._settings.get_strv(`tbo-${box}-box-order`);
    }

    _saveBoxOrder(box, boxOrder) {
        const current = this._getBoxOrder(box);
        if (JSON.stringify(boxOrder) !== JSON.stringify(current)) {
            this._settings.set_strv(`tbo-${box}-box-order`, boxOrder);
        }
    }

    _saveNewTopBarItems() {
        const boxOrders = {
            left: this._getBoxOrder('left'),
            center: this._getBoxOrder('center'),
            right: this._getBoxOrder('right'),
        };

        const containerRoleMap = new Map();
        for (const role in Main.panel.statusArea) {
            const item = Main.panel.statusArea[role];
            if (item?.container instanceof St.Bin)
                containerRoleMap.set(item.container, role);
        }

        const boxChildren = {
            left: Main.panel._leftBox.get_children().filter(c => c instanceof St.Bin),
            center: Main.panel._centerBox.get_children().filter(c => c instanceof St.Bin),
            right: Main.panel._rightBox.get_children().filter(c => c instanceof St.Bin).reverse(),
        };

        const allBoxOrders = [
            ...boxOrders.left,
            ...boxOrders.center,
            ...boxOrders.right,
        ];

        const addNewItems = (containers, boxOrder, box) => {
            for (const container of containers) {
                const role = containerRoleMap.get(container);
                if (!role) continue;
                if (allBoxOrders.includes(role)) continue;
                if (boxOrder.includes(role)) continue;
                if (box === 'right')
                    boxOrder.unshift(role);
                else
                    boxOrder.push(role);
            }
        };

        addNewItems(boxChildren.left, boxOrders.left, 'left');
        addNewItems(boxChildren.center, boxOrders.center, 'center');
        addNewItems(boxChildren.right, boxOrders.right, 'right');

        this._saveBoxOrder('left', boxOrders.left);
        this._saveBoxOrder('center', boxOrders.center);
        this._saveBoxOrder('right', boxOrders.right);
    }

    _orderTopBarItems(box) {
        if (!this._settings) return;
        if (Main.sessionMode.currentMode !== 'user' &&
            Main.sessionMode.parentMode !== 'user') {
            return;
        }

        const boxOrder = this._getBoxOrder(box);
        const hideItems = this._settings.get_strv('tbo-hide');

        const panelBox = Main.panel[`_${box}Box`];
        if (!panelBox) return;

        const allContainers = new Set([
            ...Main.panel._leftBox.get_children(),
            ...Main.panel._centerBox.get_children(),
            ...Main.panel._rightBox.get_children(),
        ].filter(c => c instanceof St.Bin));

        const validItems = [];
        for (const role of boxOrder) {
            const indicator = Main.panel.statusArea[role];
            if (!(indicator?.container instanceof St.Bin)) continue;
            if (!allContainers.has(indicator.container)) continue;

            validItems.push({
                role,
                container: indicator.container,
            });
        }

        for (let i = 0; i < validItems.length; i++) {
            const { container } = validItems[i];
            const parent = container.get_parent();
            if (parent) parent.remove_child(container);

            if (box === 'right')
                panelBox.insert_child_at_index(container, -1);
            else
                panelBox.insert_child_at_index(container, i);

            if (hideItems.includes(validItems[i].role))
                container.hide();
            else
                container.show();
        }
    }
}
