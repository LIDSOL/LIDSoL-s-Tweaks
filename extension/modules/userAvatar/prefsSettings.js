'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
            title: _('User Avatar'),
            subtitle: _('Shows your profile picture in the quick settings'),
            onDetailed: () => this.openDialog(),
        });
    }

    openDialog() {
        const s = this._settings;
        createDialog({
            window: this._window,
            title: _('User Avatar'),
            childrenRequest: (page) => {
                const posGroup = createGroup({ parent: page, title: _('Position') });
                const positionModel = new Gtk.StringList({ strings: [_('Right'), _('Left')] });
                const positionRow = new Adw.ComboRow({
                    title: _('Position'),
                    subtitle: _('Position of the avatar relative to the system buttons'),
                    model: positionModel,
                    selected: s.get_int('ua-position'),
                });
                positionRow.connect('notify::selected', () => s.set_int('ua-position', positionRow.selected));
                posGroup.add(positionRow);

                const appearGroup = createGroup({ parent: page, title: _('Appearance') });
                appearGroup.add(createSpinButtonRow({
                    settings: s,
                    bindKey: 'ua-size',
                    title: _('Size'),
                    subtitle: _('43 by default'),
                    adjProps: { lower: 15, upper: 75, step: 2 },
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-realname',
                    title: _('Show real name'),
                    subtitle: _('Depending on the length, it may increase the panel width'),
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-username',
                    title: _('Show user name'),
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-hostname',
                    title: _('Show host name'),
                }));
                appearGroup.add(createSwitchRow({
                    settings: s,
                    bindKey: 'ua-nobackground',
                    title: _('Remove button background'),
                    subtitle: _('Removes the default background'),
                }));
            },
        });
    }
}