'use strict';

import { createGroup, createComboRow, createSwitchRow, createSpinButtonRow } from '../../utils/prefsHelpers.js';

export class WorkspacePrefs {
    constructor(settings) {
        this._settings = settings;
    }

    populateGroups(page) {
        const s = this._settings;

        // ── Apariencia ──
        const appearanceGroup = createGroup({
            parent: page,
            title: 'Apariencia',
            description: 'Cómo se ve la barra de espacios.',
        });
        appearanceGroup.add(createComboRow({
            settings: s, bindKey: 'wb-size-mode',
            title: 'Tamaño', subtitle: 'Controla tamaño de icono, fuente, espaciado y redondeo',
            options: { small: 'Pequeño', medium: 'Mediano', large: 'Grande' },
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-show-icons-background',
            title: 'Mostrar fondo de iconos', subtitle: 'Dibuja un fondo sutil detrás de los iconos de espacio',
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-dim-inactive-icons',
            title: 'Reducir opacidad de iconos inactivos', subtitle: 'Muestra todos los iconos excepto el enfocado con opacidad reducida',
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-desaturate-inactive-icons',
            title: 'Desaturar iconos inactivos', subtitle: 'Muestra todos los iconos excepto el enfocado en escala de grises',
        }));

        // ── Animación ──
        const animationGroup = createGroup({
            parent: page,
            title: 'Animación',
            description: 'Cómo reacciona la barra de espacios a los cambios.',
        });
        animationGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-enable-animations',
            title: 'Habilitar animaciones',
            subtitle: 'Anima suavemente aperturas, cierres, movimientos, creaciones y reordenamientos. Desactivar para actualizaciones instantáneas.',
        }));
        const focusRow = animationGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-focus-scale-effect',
            title: 'Efecto de escala de enfoque', subtitle: 'Reduce ligeramente los iconos de apps no enfocadas con transición suave',
        }));
        const focusAmountRow = createSpinButtonRow({
            settings: s, bindKey: 'wb-focus-scale-reduction',
            title: 'Cantidad de reducción', subtitle: 'Porcentaje por el cual se reducen los iconos no enfocados',
            adjProps: { lower: 5, upper: 95, step: 1 },
        });
        animationGroup.add(focusAmountRow);

        // ── Comportamiento ──
        const behaviourGroup = createGroup({
            parent: page,
            title: 'Comportamiento',
            description: 'Cómo responde la barra de espacios a los clics.',
        });
        behaviourGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-middle-click-close',
            title: 'Clic central cierra ventana',
            subtitle: 'Clic central en un icono de app cierra esa ventana. El clic central en cualquier otro lugar del espacio sigue activando la vista general.',
        }));
    }
}
