'use strict';

import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { WorkspaceBar } from './bar.js';

const ACCENT_COLORS = {
    blue:   '#3584e4',
    teal:   '#2190a4',
    green:  '#3a944a',
    yellow: '#c88800',
    orange: '#ed5b00',
    red:    '#e62d42',
    pink:   '#d56199',
    purple: '#9141ac',
    slate:  '#6f8396',
};

const SIZE_PRESETS = {
    small:  { iconSize: 16, fontSize: 12, numSpacing: 5, btnSpacing: 4, vertSpacing: 3, roundness: 6, borderWidth: 2, iconSpacing: 3, wrapperSpacing: 4 },
    medium: { iconSize: 20, fontSize: 15, numSpacing: 7, btnSpacing: 6, vertSpacing: 4, roundness: 8, borderWidth: 2, iconSpacing: 5, wrapperSpacing: 5 },
    large:  { iconSize: 26, fontSize: 19, numSpacing: 9, btnSpacing: 8, vertSpacing: 5, roundness: 10, borderWidth: 2, iconSpacing: 6, wrapperSpacing: 6 },
};

function _buildCSS(p, accent, showBg) {
    const iconsBg = showBg ? 'rgba(255, 255, 255, 0.20)' : 'transparent';
    return `
.wsb-ws-btn-wrapper {
    margin-right: ${p.btnSpacing}px;
    padding: ${p.vertSpacing}px 0px ${p.vertSpacing}px 0px;
}

.wsb-container-wrapper .wsb-ws-btn-wrapper:last-child {
    margin-right: 0px;
}

.wsb-ws-num-wrapper {
    background-color: rgba(255, 255, 255, 0.04);
    border-radius: ${p.roundness}px 0px 0px ${p.roundness}px;
    border-top-width: ${p.borderWidth}px;
    border-right-width: 0px;
    border-bottom-width: ${p.borderWidth}px;
    border-left-width: ${p.borderWidth}px;
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.15);
    padding: 0 ${p.numSpacing}px 0px ${p.numSpacing}px;
}

.wsb-ws-num-wrapper-active {
    border-color: ${accent};
}

.wsb-ws-num-label-elem {
    font-size: ${p.fontSize}px;
}

.wsb-icons-wrapper {
    background-color: ${iconsBg};
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.15);
    padding: 0 ${p.wrapperSpacing}px 0px ${p.wrapperSpacing}px;
    min-width: ${Math.floor(p.iconSize / 2)}px;
    border-radius: 0px ${p.roundness}px ${p.roundness}px 0px;
    border-top-width: ${p.borderWidth}px;
    border-right-width: ${p.borderWidth}px;
    border-bottom-width: ${p.borderWidth}px;
    border-left-width: 0px;
}

.wsb-icons-wrapper-active {
    border-color: ${accent};
}

.wsb-single-icon-wrapper {
    margin-right: ${p.iconSpacing}px;
}

.wsb-icons-wrapper .wsb-single-icon-wrapper:last-child {
    margin-right: 0px;
}

.wsb-ws-btn-drag-hover .wsb-icons-wrapper {
    background-color: rgba(255, 255, 255, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.5) !important;
}

.wsb-ws-btn-drag-hover .wsb-ws-num-wrapper {
    background-color: rgba(255, 255, 255, 0.08) !important;
    border-color: rgba(255, 255, 255, 0.5) !important;
}

.wsb-insertion-indicator {
    background-color: ${accent};
    border-radius: 2px;
    min-width: 3px;
}

.wsb-overflow-arrow {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    padding: 0 2px;
}
`;
}

export class WorkspaceModule {
    constructor() {
        this._workspaceBar = null;
        this._settings = null;
        this._settingsIds = [];
        this._ifaceSettings = null;
        this._ifaceAccentId = null;
        this._stylesheetApplied = false;
    }

    enable(gsettings, extension) {
        this._settings = gsettings;
        this._extension = extension;
        this._ifaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        this._generateAndApplyCSS();
        this._workspaceBar = new WorkspaceBar(this);
        this._workspaceBar.init();

        this._settingsIds.push(this._settings.connect('changed::wb-size-mode', () => {
            this._generateAndApplyCSS();
            this._workspaceBar.onSizeModeChanged();
        }));
        this._settingsIds.push(this._settings.connect('changed::wb-position', () => {
            this._workspaceBar.onPositionChanged();
        }));
        this._settingsIds.push(this._settings.connect('changed::wb-position-index', () => {
            this._workspaceBar.onPositionChanged();
        }));
        this._settingsIds.push(this._settings.connect('changed::wb-left-margin', () => {
            this._workspaceBar.onLeftMarginChanged();
        }));
        this._settingsIds.push(this._settings.connect('changed::wb-show-icons-background', () => {
            this._generateAndApplyCSS();
        }));
        for (let key of ['wb-focus-scale-effect', 'wb-focus-scale-reduction',
                        'wb-dim-inactive-icons', 'wb-desaturate-inactive-icons']) {
            this._settingsIds.push(this._settings.connect(`changed::${key}`, () => {
                this._workspaceBar.onIconEffectsChanged();
            }));
        }

        this._ifaceAccentId = this._ifaceSettings.connect('changed::accent-color', () => {
            this._generateAndApplyCSS();
        });
    }

    disable() {
        for (let id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];

        if (this._ifaceAccentId) {
            this._ifaceSettings.disconnect(this._ifaceAccentId);
            this._ifaceAccentId = null;
        }
        this._ifaceSettings = null;

        this._workspaceBar?.destroy();
        this._workspaceBar = null;

        this._removeCSS();
        this._settings = null;
        this._extension = null;
    }

    getPreset() {
        let mode = this._settings.get_string('wb-size-mode');
        return SIZE_PRESETS[mode] || SIZE_PRESETS.medium;
    }

    getPosition() {
        return this._settings.get_string('wb-position') || 'left';
    }

    getPositionIndex() {
        return this._settings.get_int('wb-position-index');
    }

    getLeftMargin() {
        return this._settings.get_int('wb-left-margin');
    }

    getShowIconsBackground() {
        return this._settings.get_boolean('wb-show-icons-background');
    }

    getEnableAnimations() {
        return this._settings.get_boolean('wb-enable-animations');
    }

    getFocusScaleEffect() {
        return this._settings.get_boolean('wb-focus-scale-effect');
    }

    getFocusScaleReduction() {
        return this._settings.get_int('wb-focus-scale-reduction');
    }

    getDimInactiveIcons() {
        return this._settings.get_boolean('wb-dim-inactive-icons');
    }

    getDesaturateInactiveIcons() {
        return this._settings.get_boolean('wb-desaturate-inactive-icons');
    }

    getMiddleClickClose() {
        return this._settings.get_boolean('wb-middle-click-close');
    }

    openPreferences() {
        this._extension?.openPreferences();
    }

    _getAccentColor() {
        let name = this._ifaceSettings.get_string('accent-color');
        return ACCENT_COLORS[name] || ACCENT_COLORS.blue;
    }

    _generateAndApplyCSS() {
        let p = this.getPreset();
        let css = _buildCSS(p, this._getAccentColor(), this.getShowIconsBackground());
        this._applyCSS(css);
    }

    _applyCSS(css) {
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        let theme = themeContext.get_theme();

        if (this._stylesheetApplied)
            this._removeCSS();

        let file = this._extension.dir.get_child('stylesheet.css');
        file.replace_contents(
            new TextEncoder().encode(css),
            null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        theme.load_stylesheet(file);
        this._stylesheetApplied = true;
    }

    _removeCSS() {
        if (!this._stylesheetApplied) return;
        try {
            let themeContext = St.ThemeContext.get_for_stage(global.stage);
            let theme = themeContext.get_theme();
            let file = this._extension.dir.get_child('stylesheet.css');
            theme.unload_stylesheet(file);
        } catch (_e) {}
        this._stylesheetApplied = false;
    }
}

export default WorkspaceModule;
