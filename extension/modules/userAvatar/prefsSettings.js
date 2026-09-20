'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {
    createDialog,
    createGroup,
    createModuleRow,
    createSpinButtonRow,
    createSwitchRow,
} from '../../utils/prefsHelpers.js';

export class UserAvatarPrefs {
    constructor(settings, window) {
        this._settings = settings;
        this._window = window;
    }

    createModuleRow() {
        return createModuleRow({
            settings: this._settings,
            bindKey: 'user-avatar-enabled',
            title: 'Avatar de Usuario',
            subtitle: 'Muestra tu foto de perfil en los ajustes rápidos',
            onDetailed: () => this.openDialog(),
        });
    }

    openDialog() {
        const s = this._settings;
        createDialog({
            window: this._window,
            title: 'Avatar de Usuario',
            childrenRequest: (page) => {
                const posGroup = createGroup({ parent: page, title: 'Posición' });
                const positionModel = new Gtk.StringList({ strings: ['Derecha', 'Izquierda'] });
                const positionRow = new Adw.ComboRow({
                    title: 'Posición',
                    subtitle: 'Posición del avatar respecto a los botones del sistema',
                    model: positionModel,
                    selected: s.get_int('ua-position'),
                });
                positionRow.connect('notify::selected', () => s.set_int('ua-position', positionRow.selected));
                posGroup.add(positionRow);

                const appearGroup = createGroup({ parent: page, title: 'Apariencia' });
                appearGroup.add(createSpinButtonRow({
                    settings: s,
                    bindKey: 'ua-size',
                    title: 'Tamaño',
                    subtitle: '43 por defecto',
                    adjProps: { lower: 15, upper: 75, step: 2 },
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-realname',
                    title: 'Mostrar nombre real',
                    subtitle: 'Según la longitud, puede aumentar el ancho del panel',
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-username',
                    title: 'Mostrar nombre de usuario',
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-hostname',
                    title: 'Mostrar nombre del equipo',
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-nobackground',
                    title: 'Quitar fondo del botón',
                    subtitle: 'Elimina el fondo predeterminado',
                }));
            },
        });
    }
}