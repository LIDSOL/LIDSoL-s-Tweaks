'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    createDialog,
    createModuleRow,
    enableDragAutoScroll,
} from '../../utils/prefsHelpers.js';

// Página "Top Bar" de las preferencias: configuración del módulo Top Bar
// Organizer (fila-módulo + diálogo drag&drop para reordenar/ocultar los
// indicadores de la barra superior).
export class TopBarOrganizerPrefs {
    constructor(settings, window) {
        this._settings = settings;
        this._window = window;
    }

    populateCategoryPage(page) {
        const group = new Adw.PreferencesGroup({
            title: 'Top Bar Organizer',
            description: 'Organización y apariencia del panel.',
        });
        group.add(createModuleRow({
            settings: this._settings,
            bindKey: 'tbo-enabled',
            title: 'Top Bar Organizer',
            subtitle: 'Reordena y oculta indicadores de la barra superior',
            onDetailed: () => {
                if (this._window && this._settings)
                    openTopBarOrganizerDialog(this._window, this._settings);
            },
        }));
        page.add(group);
    }
}

// ══════════════════════════════════════════════════════════════════
//  TOP BAR ORGANIZER
// ══════════════════════════════════════════════════════════════════

const TOP_BAR_ITEM_NAMES = {
    appMenu: 'Menú de aplicación',
    dateMenu: 'Fecha y hora',
    activities: 'Actividades',
    quickSettings: 'Ajustes rápidos',
    a11y: 'Accesibilidad',
    keyboard: 'Distribución del teclado',
    screencastIndicator: 'Grabación de pantalla',
    remoteAccessIndicator: 'Acceso remoto',
    appindicatorContainer: 'Indicadores de aplicación',
    'lidsol-workspace-indicator': 'Workspace Indicator',
};

const TOP_BAR_ITEM_ICONS = {
    appMenu: 'application-x-executable-symbolic',
    dateMenu: 'preferences-system-time-symbolic',
    activities: 'view-grid-symbolic',
    quickSettings: 'emblem-system-symbolic',
    a11y: 'preferences-desktop-accessibility-symbolic',
    keyboard: 'input-keyboard-symbolic',
    screencastIndicator: 'media-record-symbolic',
    remoteAccessIndicator: 'network-server-symbolic',
    'lidsol-workspace-indicator': 'preferences-desktop-multitasking-symbolic',
};

function getTopBarItemName(role) {
    return TOP_BAR_ITEM_NAMES[role] || role;
}

function getTopBarItemIcon(role) {
    return TOP_BAR_ITEM_ICONS[role] || 'pan-end-symbolic';
}

const TopBarOrganizerRow = GObject.registerClass({
    GTypeName: 'LidSolTopBarOrganizerRow',
}, class TopBarOrganizerRow extends Adw.ActionRow { });

// Visual placeholder for empty lists (DnD handled by list-level DropTarget)
const TopBarOrganizerPlaceholder = GObject.registerClass({
    GTypeName: 'LidSolTopBarOrganizerPlaceholder',
}, class TopBarOrganizerPlaceholder extends Gtk.Box {
    _init(params = {}) {
        super._init(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);
        this.set_hexpand(true);
        this.set_vexpand(true);

        const label = new Gtk.Label({
            label: 'Arrastra elementos aquí',
            sensitive: false,
            opacity: 0.5,
            margin_top: 16,
            margin_bottom: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        this.append(label);
    }
});

const BOX_NAMES = {
    left: 'Caja izquierda',
    center: 'Caja central',
    right: 'Caja derecha',
};

function openTopBarOrganizerDialog(parentWindow, settings) {
    const getOrder = (box) => {
        try { return settings.get_strv(`tbo-${box}-box-order`); }
        catch (e) { return []; }
    };

    function _createRow(item, settings) {
        const row = new TopBarOrganizerRow();
        row._item = item;
        row.set_title(getTopBarItemName(item));

        const icon = Gtk.Image.new_from_icon_name(getTopBarItemIcon(item));
        icon.pixel_size = 18;
        icon.margin_start = 4;
        icon.margin_end = 4;
        row.add_prefix(icon);

        const dragHandle = Gtk.Image.new_from_icon_name('list-drag-handle-symbolic');
        dragHandle.pixel_size = 14;
        dragHandle.margin_start = 4;
        dragHandle.margin_end = 6;
        dragHandle.opacity = 0.5;
        row.add_prefix(dragHandle);

        const hideList = (() => {
            try { return settings.get_strv('tbo-hide'); }
            catch (e) { return []; }
        })();
        const hideSwitch = new Gtk.Switch({
            active: !hideList.includes(item),
            valign: Gtk.Align.CENTER,
        });
        hideSwitch.connect('notify::active', () => {
            const currentHide = (() => {
                try { return settings.get_strv('tbo-hide'); }
                catch (e) { return []; }
            })();
            const currentShow = (() => {
                try { return settings.get_strv('tbo-show'); }
                catch (e) { return []; }
            })();
            if (hideSwitch.active) {
                const hideIdx = currentHide.indexOf(item);
                if (hideIdx !== -1)
                    currentHide.splice(hideIdx, 1);
                if (!currentShow.includes(item))
                    currentShow.push(item);
            } else {
                const showIdx = currentShow.indexOf(item);
                if (showIdx !== -1)
                    currentShow.splice(showIdx, 1);
                if (!currentHide.includes(item))
                    currentHide.push(item);
            }
            try {
                settings.set_strv('tbo-hide', currentHide);
                settings.set_strv('tbo-show', currentShow);
            } catch (e) {
                console.error('[TBO] error toggling hide/show:', e);
            }
        });
        row.add_suffix(hideSwitch);

        const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
        dragSource.connect('prepare', (_src, _x, _y) => {
            const val = new GObject.Value();
            val.init(TopBarOrganizerRow.$gtype);
            val.set_object(row);
            return Gdk.ContentProvider.new_for_value(val);
        });
        dragSource.connect('drag-begin', (_src, drag) => {
            const alloc = row.get_allocation();
            const iconBox = new Gtk.ListBox();
            iconBox.set_size_request(alloc.width, alloc.height);
            const ghostRow = new Gtk.ListBoxRow();
            const ghostLabel = new Gtk.Label({
                label: row.get_title(),
                margin_start: 8,
                margin_end: 8,
                margin_top: 4,
                margin_bottom: 4,
                xalign: 0,
            });
            ghostRow.set_child(ghostLabel);
            iconBox.append(ghostRow);
            iconBox.drag_highlight_row(ghostRow);
            const dragIcon = Gtk.DragIcon.get_for_drag(drag);
            if (dragIcon) dragIcon.set_child(iconBox);
        });
        row.add_controller(dragSource);

        const dropTarget = new Gtk.DropTarget({
            actions: Gdk.DragAction.MOVE,
            formats: Gdk.ContentFormats.new_for_gtype(TopBarOrganizerRow.$gtype),
        });
        dropTarget.connect('drop', (_trg, value, _x, _y) => {
            return _handleDrop(value, row, settings);
        });
        row.add_controller(dropTarget);

        return row;
    }

    function _handleDrop(value, targetRow, settings) {
        if (!(value instanceof TopBarOrganizerRow))
            return false;
        if (value === targetRow)
            return false;

        const sourceList = value.get_parent();
        const targetList = targetRow.get_parent();
        if (!sourceList || !targetList)
            return false;

        const role = value._item;
        const sourceIndex = value.get_index();
        const targetBeforeRemove = targetRow.get_index();
        sourceList.remove(value);

        if (sourceList === targetList) {
            const newRow = _createRow(role, settings);
            const insertIndex = sourceIndex < targetBeforeRemove
                ? targetRow.get_index() + 1
                : targetRow.get_index();
            sourceList.insert(newRow, insertIndex);
            _saveListBoxOrder(sourceList, settings);
        } else {
            const newRow = _createRow(role, settings);
            targetList.insert(newRow, targetBeforeRemove);
            _saveBothListBoxOrders(sourceList, targetList, settings);
        }

        return true;
    }

    function _addListBoxDropTarget(listBox, settings) {
        const dropTarget = new Gtk.DropTarget({
            actions: Gdk.DragAction.MOVE,
            formats: Gdk.ContentFormats.new_for_gtype(TopBarOrganizerRow.$gtype),
        });
        dropTarget.connect('drop', (_trg, value, _x, _y) => {
            if (!(value instanceof TopBarOrganizerRow))
                return false;
            const src = value.get_parent();
            if (!src || src === listBox)
                return false;
            const role = value._item;
            src.remove(value);
            const newRow = _createRow(role, settings);
            listBox.append(newRow);
            _saveBothListBoxOrders(src, listBox, settings);
            return true;
        });
        listBox.add_controller(dropTarget);
    }

    function _saveListBoxOrder(listBox, settings) {
        const key = listBox.boxOrder;
        const items = [];
        for (const child of listBox) {
            if (child instanceof TopBarOrganizerRow)
                items.push(child._item);
        }
        try {
            settings.set_strv(key, items);
        } catch (e) {
            console.error('[TBO] error saving box order:', e);
        }
    }

    function _saveBothListBoxOrders(listBoxA, listBoxB, settings) {
        // listBoxA is the source list box, listBoxB is the destination list box.
        // Save the destination box order FIRST, then the source, so that when the
        // module's `changed` handler runs `saveNewTopBarItems`, the moved item is
        // already present in the destination box order and is NOT re-added to its
        // original box (which would corrupt the order / duplicate items).
        const keyA = listBoxA.boxOrder;
        const keyB = listBoxB.boxOrder;
        const itemsA = [];
        const itemsB = [];
        for (const child of listBoxA) {
            if (child instanceof TopBarOrganizerRow)
                itemsA.push(child._item);
        }
        for (const child of listBoxB) {
            if (child instanceof TopBarOrganizerRow)
                itemsB.push(child._item);
        }
        try {
            settings.set_strv(keyB, itemsB);
            settings.set_strv(keyA, itemsA);
        } catch (e) {
            console.error('[TBO] error saving box orders:', e);
        }
    }

    function _populateListBox(listBox, box, settings) {
        listBox.boxOrder = `tbo-${box}-box-order`;
        const order = getOrder(box);
        for (const name of order) {
            const row = _createRow(name, settings);
            listBox.append(row);
        }
    }

    createDialog({
        window: parentWindow,
        title: 'Ordenar elementos de la barra superior',
        childrenRequest: (page, dialog) => {
            const group = new Adw.PreferencesGroup({
                title: 'Orden de la barra superior',
                description: 'Arrastra y suelta para reordenar los elementos entre cajas.',
            });
            page.add(group);

            const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
            resetBtn.has_frame = false;
            resetBtn.valign = Gtk.Align.CENTER;
            resetBtn.tooltip_text = 'Actualizar barra: mostrar solo los elementos actuales';

            const showAlert = (heading, body) => {
                const alert = new Adw.AlertDialog({
                    heading,
                    body,
                });
                alert.add_response('ok', 'Aceptar');
                alert.set_default_response('ok');
                alert.set_close_response('ok');
                alert.present(parentWindow);
            };

            resetBtn.connect('clicked', () => {
                const dbusName = 'org.gnome.Shell.Extensions.LidSolWidgets';
                const dbusPath = '/org/gnome/Shell/Extensions/LidSolWidgets';
                Gio.DBus.session.call(
                    dbusName,
                    dbusPath,
                    dbusName,
                    'CleanTopBar',
                    null,
                    new GLib.VariantType('(b)'),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (conn, res) => {
                        let changed = false;
                        try {
                            const reply = conn.call_finish(res);
                            changed = reply.deep_unpack()[0];
                        } catch (e) {
                            console.error('[TBO] no ha sido posible actualizar la barra:', e);
                            showAlert(
                                'No se pudo actualizar la barra',
                                'El módulo "Top Bar Organizer" no está activo. Activa el módulo e inténtalo de nuevo.'
                            );
                            return;
                        }
                        _rebuildAll();
                        showAlert(
                            changed ? 'Barra actualizada' : 'Sin cambios',
                            changed
                                ? 'La barra ahora muestra solo los elementos actuales.'
                                : 'Todos los elementos guardados ya son los actuales.'
                        );
                    }
                );
            });
            const headerBox = new Gtk.Box({ spacing: 4 });
            headerBox.append(resetBtn);
            group.header_suffix = headerBox;

            const listBoxes = {};

            for (const box of ['left', 'center', 'right']) {
                const label = new Gtk.Label({
                    label: BOX_NAMES[box],
                    halign: Gtk.Align.START,
                    margin_bottom: 6,
                    margin_top: box === 'left' ? 0 : 12,
                });
                group.add(label);

                const listBox = new Gtk.ListBox({
                    selection_mode: Gtk.SelectionMode.NONE,
                    show_separators: true,
                });
                listBox.add_css_class('boxed-list');
                listBox.set_size_request(-1, 60);
                const placeholder = new TopBarOrganizerPlaceholder();
                placeholder._targetListBox = listBox;
                placeholder._targetBoxOrder = `tbo-${box}-box-order`;
                placeholder._settings = settings;
                listBox.set_placeholder(placeholder);
                group.add(listBox);
                listBoxes[box] = listBox;

                _populateListBox(listBox, box, settings);
                _addListBoxDropTarget(listBox, settings);
                enableDragAutoScroll(listBox);
            }

            function _rebuildAll() {
                for (const box of ['left', 'center', 'right']) {
                    const listBox = listBoxes[box];
                    while (listBox.get_first_child())
                        listBox.remove(listBox.get_first_child());
                    listBox.set_placeholder(null);
                    const placeholder = new TopBarOrganizerPlaceholder();
                    listBox.set_placeholder(placeholder);
                    _populateListBox(listBox, box, settings);
                }
            }

            const currentRoles = () => {
                const roles = new Set();
                for (const box of ['left', 'center', 'right'])
                    for (const role of getOrder(box))
                        roles.add(role);
                return roles;
            };

            const knownRoles = currentRoles();
            const refreshKeys = [
                'tbo-left-box-order',
                'tbo-center-box-order',
                'tbo-right-box-order',
                'tbo-hide',
                'tbo-show',
            ];
            const refreshHandlerIds = refreshKeys.map((key) =>
                settings.connect(`changed::${key}`, () => {
                    const roles = currentRoles();
                    for (const role of roles) {
                        if (!knownRoles.has(role)) {
                            knownRoles.add(role);
                            _rebuildAll();
                            return;
                        }
                    }
                })
            );
            dialog.connect('closed', () => {
                for (const id of refreshHandlerIds)
                    settings.disconnect(id);
            });
        },
    });
}