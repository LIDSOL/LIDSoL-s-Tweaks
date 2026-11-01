'use strict';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { createGroup, createComboRow, createSwitchRow, createSpinButtonRow } from '../../utils/prefsHelpers.js';

export class WorkspacePrefs {
    constructor(settings) {
        this._settings = settings;
    }

    populateGroups(page) {
        const s = this._settings;

        // ── Appearance ──
        const appearanceGroup = createGroup({
            parent: page,
            title: _('Appearance'),
            description: _('How the workspace bar looks.'),
        });
        appearanceGroup.add(createComboRow({
            settings: s, bindKey: 'wb-size-mode',
            title: _('Size'), subtitle: _('Controls icon size, font, spacing and roundness'),
            options: { small: _('Small'), medium: _('Medium'), large: _('Large') },
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-show-icons-background',
            title: _('Show icons background'), subtitle: _('Draws a subtle background behind the workspace icons'),
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-dim-inactive-icons',
            title: _('Dim inactive icons'), subtitle: _('Shows all icons except the focused one with reduced opacity'),
        }));
        appearanceGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-desaturate-inactive-icons',
            title: _('Desaturate inactive icons'), subtitle: _('Shows all icons except the focused one in grayscale'),
        }));

        // ── Animation ──
        const animationGroup = createGroup({
            parent: page,
            title: _('Animation'),
            description: _('How the workspace bar reacts to changes.'),
        });
        animationGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-enable-animations',
            title: _('Enable animations'),
            subtitle: _('Smoothly animates openings, closings, movements, creations and reorderings. Disable for instant updates.'),
        }));
        const focusRow = animationGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-focus-scale-effect',
            title: _('Focus scale effect'), subtitle: _('Slightly reduces the icons of unfocused apps with a smooth transition'),
        }));
        const focusAmountRow = createSpinButtonRow({
            settings: s, bindKey: 'wb-focus-scale-reduction',
            title: _('Reduction amount'), subtitle: _('Percentage by which unfocused icons are reduced'),
            adjProps: { lower: 5, upper: 95, step: 1 },
        });
        animationGroup.add(focusAmountRow);

        // ── Behavior ──
        const behaviourGroup = createGroup({
            parent: page,
            title: _('Behavior'),
            description: _('How the workspace bar responds to clicks.'),
        });
        behaviourGroup.add(createSwitchRow({
            settings: s, bindKey: 'wb-middle-click-close',
            title: _('Middle click closes window'),
            subtitle: _('Middle click on an app icon closes that window. Middle click anywhere else on the workspace keeps opening the overview.'),
        }));
    }
}