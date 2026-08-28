'use strict';

import St from 'gi://St';
import Gio from 'gi://Gio';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';

const TBO_DBUS_NAME = 'org.gnome.Shell.Extensions.LidSolWidgets';
const TBO_DBUS_PATH = '/org/gnome/Shell/Extensions/LidSolWidgets';
const TBO_DBUS_IFACE_XML = `<node>
  <interface name="org.gnome.Shell.Extensions.LidSolWidgets">
    <method name="CleanTopBar">
      <arg type="b" direction="out" name="changed"/>
    </method>
  </interface>
</node>`;

const OBSOLETE_ROLES = new Set([
    "LIDSoL's Tweaks",
]);

const DEFAULT_BOX_BY_ROLE = {
    'lidsol-workspace-indicator': 'left',
};

export class TopBarOrganizerModule {
    constructor() {
        this._maid = new Maid();
        this._settings = null;
    }

    enable(gsettings, extension) {
        console.log('[LIDSoL Widgets] TopBarOrganizer enable');
        this._settings = gsettings;

        const self = this;

        Panel.Panel.prototype._originalAddToPanelBox = Panel.Panel.prototype._addToPanelBox;

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

        try {
            const serviceImplementation = {
                CleanTopBar() {
                    return self._cleanTopBar();
                },
            };
            this._dbusInterface =
                Gio.DBusExportedObject.wrapJSObject(TBO_DBUS_IFACE_XML, serviceImplementation);

            this._dbusNameId = Gio.bus_own_name(
                Gio.BusType.SESSION,
                TBO_DBUS_NAME,
                Gio.BusNameOwnerFlags.NONE,
                (connection) => {
                    this._dbusConnection = connection;
                    try {
                        this._dbusInterface.export(connection, TBO_DBUS_PATH);
                    } catch (e) {
                        console.error('[TBO] export_object error:', e);
                    }
                },
                null, null);
        } catch (e) {
            console.error('[TBO] no se pudo exportar el método D-Bus CleanTopBar:', e);
        }
    }

    disable() {
        console.log('[LIDSoL Widgets] TopBarOrganizer disable');
        if (this._maid) {
            this._maid.clear();
            this._maid.destroy();
        }
        if (this._dbusInterface) {
            try {
                this._dbusInterface.unexport();
            } catch (e) { console.error('[TBO] unexport error:', e); }
            this._dbusInterface = null;
            this._dbusConnection = null;
        }
        if (this._dbusNameId) {
            Gio.bus_unown_name(this._dbusNameId);
            this._dbusNameId = null;
        }
        this._settings = null;
    }

    _handleNewItemsAndOrderTopBar() {
        if (!this._settings) return;
        if (Main.sessionMode.currentMode !== 'user' &&
            Main.sessionMode.parentMode !== 'user') {
            return;
        }
        console.log('[TBO] _handleNewItemsAndOrderTopBar called');
        this._saveNewTopBarItems();
        this._orderTopBarItems('left');
        this._orderTopBarItems('center');
        this._orderTopBarItems('right');
        console.log('[TBO] _handleNewItemsAndOrderTopBar done');
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

    _removeObsoleteRoles() {
        if (!this._settings) return;
        const keys = [
            'tbo-left-box-order',
            'tbo-center-box-order',
            'tbo-right-box-order',
            'tbo-hide',
            'tbo-show',
        ];
        for (const key of keys) {
            const arr = this._settings.get_strv(key);
            const filtered = arr.filter(r => !OBSOLETE_ROLES.has(r));
            if (filtered.length !== arr.length &&
                JSON.stringify(filtered) !== JSON.stringify(arr)) {
                this._settings.set_strv(key, filtered);
            }
        }
    }

    _saveNewTopBarItems() {
        this._removeObsoleteRoles();

        const boxOrders = {
            left: this._getBoxOrder('left'),
            center: this._getBoxOrder('center'),
            right: this._getBoxOrder('right'),
        };

        for (const box of ['left', 'center', 'right']) {
            boxOrders[box] = [...new Set(boxOrders[box])];
        }

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
                const targetBox = DEFAULT_BOX_BY_ROLE[role] || box;
                const targetOrder = boxOrders[targetBox];
                if (targetBox === 'right')
                    targetOrder.unshift(role);
                else
                    targetOrder.push(role);
            }
        };

        addNewItems(boxChildren.left, boxOrders.left, 'left');
        addNewItems(boxChildren.center, boxOrders.center, 'center');
        addNewItems(boxChildren.right, boxOrders.right, 'right');

        this._saveBoxOrder('left', boxOrders.left);
        this._saveBoxOrder('center', boxOrders.center);
        this._saveBoxOrder('right', boxOrders.right);
    }

    _cleanTopBar() {
        if (!this._settings) return false;
        if (Main.sessionMode.currentMode !== 'user' &&
            Main.sessionMode.parentMode !== 'user') {
            return false;
        }

        const boxContainers = {
            left: Main.panel._leftBox.get_children().filter(c => c instanceof St.Bin),
            center: Main.panel._centerBox.get_children().filter(c => c instanceof St.Bin),
            right: Main.panel._rightBox.get_children().filter(c => c instanceof St.Bin).reverse(),
        };

        const containerRoleMap = new Map();
        for (const role in Main.panel.statusArea) {
            const item = Main.panel.statusArea[role];
            if (item?.container instanceof St.Bin)
                containerRoleMap.set(item.container, role);
        }

        let changed = false;
        for (const box of ['left', 'center', 'right']) {
            const roles = boxContainers[box]
                .map(c => containerRoleMap.get(c))
                .filter(r => !!r);
            const key = `tbo-${box}-box-order`;
            const current = this._settings.get_strv(key);
            if (JSON.stringify(roles) !== JSON.stringify(current)) {
                this._settings.set_strv(key, roles);
                changed = true;
            }
        }

        const liveRoles = [];
        for (const containers of Object.values(boxContainers)) {
            for (const container of containers) {
                const role = containerRoleMap.get(container);
                if (role) liveRoles.push(role);
            }
        }

        for (const key of ['tbo-hide', 'tbo-show']) {
            const arr = this._settings.get_strv(key);
            const filtered = arr.filter(r => liveRoles.includes(r));
            if (JSON.stringify(filtered) !== JSON.stringify(arr)) {
                this._settings.set_strv(key, filtered);
                changed = true;
            }
        }

        return changed;
    }

    _orderTopBarItems(box) {
        if (!this._settings) return;
        if (Main.sessionMode.currentMode !== 'user' &&
            Main.sessionMode.parentMode !== 'user') {
            return;
        }

        const boxOrder = this._getBoxOrder(box);
        const hideItems = this._settings.get_strv('tbo-hide');
        const showItems = this._settings.get_strv('tbo-show');

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
            const { role, container } = validItems[i];
            const isVisible = container.visible;

            const parent = container.get_parent();
            if (parent) parent.remove_child(container);

            if (box === 'right')
                panelBox.insert_child_at_index(container, -1);
            else
                panelBox.insert_child_at_index(container, i);

            if (hideItems.includes(role)) {
                container.hide();
            } else if (showItems.includes(role)) {
                container.show();
            } else if (!isVisible) {
                container.hide();
            }
        }
    }
}
