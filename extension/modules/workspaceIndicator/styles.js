import Gio from 'gi://Gio';
import St from 'gi://St';
import { DebouncingNotifier } from './debouncingNotifier.js';
import { Settings } from './settings.js';

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

export class Styles {
    static _instance = null;

    static init() {
        Styles._instance = new Styles();
        Styles._instance._init();
    }

    static destroy() {
        Styles._instance?._destroy();
        Styles._instance = null;
    }

    static getInstance() {
        return Styles._instance;
    }

    _init() {
        this._settings = Settings.getInstance();
        this._workspacesBarUpdateNotifier = new DebouncingNotifier();
        this._workspaceUpdateNotifier = new DebouncingNotifier();
        this._dynamicStyleSheet = null;
        this._interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
        this._accentColorSignal = this._interfaceSettings.connect('changed::accent-color', () => {
            if (this._settings.useAccentColor.value) {
                this._updateStyleSheet();
                this._workspaceUpdateNotifier.notify();
            }
        });
        this._registerSettingChanges();
        this._updateStyleSheet();
    }

    _destroy() {
        this._workspaceUpdateNotifier.destroy();
        this._unloadStyleSheet();
        if (this._accentColorSignal) {
            this._interfaceSettings.disconnect(this._accentColorSignal);
            this._accentColorSignal = null;
        }
    }

    _updateStyleSheet() {
        this._unloadStyleSheet();
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        let styles = this._generateStyleSheetContent();
        this._settings.applicationStyles.value = styles;
        if (this._settings.customStylesEnabled.value) {
            this._settings.customStylesFailed.value = false;
            styles = styles + '\n' + this._settings.customStyles.value;
        }
        const [file, stream] = Gio.File.new_tmp(null);
        const outputStream = Gio.DataOutputStream.new(stream.outputStream);
        outputStream.put_string(styles, null);
        try {
            themeContext.get_theme().load_stylesheet(file);
        } catch (e) {
            console.error('Failed to load stylesheet');
            if (this._settings.customStylesEnabled.value) {
                this._settings.customStylesEnabled.value = false;
                this._settings.customStylesFailed.value = true;
            }
        }
        outputStream.close(null);
        stream.close(null);
        this._dynamicStyleSheet = file;
    }

    _unloadStyleSheet() {
        if (this._dynamicStyleSheet) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.get_theme().unload_stylesheet(this._dynamicStyleSheet);
            this._dynamicStyleSheet.delete(null);
            this._dynamicStyleSheet = null;
        }
    }

    _generateStyleSheetContent() {
        let content = `.space-bar {\n${this._getWorkspacesBarStyle()}}\n\n`;
        content += `.space-bar-workspace-label.active {\n${this._getActiveWorkspaceStyle()}}\n\n`;
        content += `.space-bar-workspace-label.inactive {\n${this._getInactiveWorkspaceStyle()}}\n\n`;
        content += `.space-bar-workspace-label.inactive.empty {\n${this._getEmptyWorkspaceStyle()}}\n\n`;
        content += `.space-bar-ws-box-icons {\n  margin: 0 ${this._settings.workspaceMargin.value}px;\n}\n\n`;
        content += `.space-bar-ws-label.active {\n${this._getActiveWsLabelStyle()}}\n\n`;
        content += `.space-bar-ws-icons.active {\n${this._getActiveWsIconsStyle()}}\n\n`;
        content += `.space-bar-ws-label.inactive {\n${this._getInactiveWsLabelStyle()}}\n\n`;
        content += `.space-bar-ws-icons.inactive {\n${this._getInactiveWsIconsStyle()}}\n\n`;
        content += `.space-bar-ws-label.inactive.empty {\n${this._getEmptyWsLabelStyle()}}\n\n`;
        content += `.space-bar-ws-icons.inactive.empty {\n${this._getEmptyWsIconsStyle()}}\n\n`;
        content += `.space-bar-app-icons {\n  spacing: 2px;\n}\n\n`;
        content += `.space-bar-app-icon-wrapper {\n  border-radius: 3px;\n  padding: 2px;\n}\n\n`;
        content += `.space-bar-app-icon-wrapper:hover {\n  background-color: rgba(255, 255, 255, 0.15);\n  transition: background-color 150ms ease;\n}`;
        return content;
    }

    onWorkspacesBarChanged(callback) {
        this._workspacesBarUpdateNotifier.subscribe(callback);
    }

    onWorkspaceLabelsChanged(callback) {
        this._workspaceUpdateNotifier.subscribe(callback);
    }

    _registerSettingChanges() {
        [this._settings.workspacesBarPadding].forEach((setting) =>
            setting.subscribe(() => {
                this._updateStyleSheet();
                this._workspacesBarUpdateNotifier.notify();
            }),
        );
        [
            this._settings.workspaceMargin,
            this._settings.useAccentColor,
            this._settings.activeWorkspaceBackgroundColor,
            this._settings.activeWorkspaceTextColor,
            this._settings.activeWorkspaceBorderColor,
            this._settings.activeWorkspaceFontSize,
            this._settings.activeWorkspaceFontWeight,
            this._settings.activeWorkspaceBorderRadius,
            this._settings.activeWorkspaceBorderWidth,
            this._settings.activeWorkspacePaddingH,
            this._settings.activeWorkspacePaddingV,
            this._settings.appIconsActiveBackgroundColor,
        ].forEach((setting) =>
            setting.subscribe(() => {
                this._updateStyleSheet();
                this._workspaceUpdateNotifier.notify();
            }),
        );
        [
            this._settings.workspaceMargin,
            this._settings.inactiveWorkspaceBackgroundColor,
            this._settings.inactiveWorkspaceTextColor,
            this._settings.inactiveWorkspaceBorderColor,
            this._settings.inactiveWorkspaceFontSize,
            this._settings.inactiveWorkspaceFontWeight,
            this._settings.inactiveWorkspaceBorderRadius,
            this._settings.inactiveWorkspaceBorderWidth,
            this._settings.inactiveWorkspacePaddingH,
            this._settings.inactiveWorkspacePaddingV,
            this._settings.appIconsInactiveBackgroundColor,
        ].forEach((setting) =>
            setting.subscribe(() => {
                this._updateStyleSheet();
                this._workspaceUpdateNotifier.notify();
            }),
        );
        [
            this._settings.workspaceMargin,
            this._settings.emptyWorkspaceBackgroundColor,
            this._settings.emptyWorkspaceTextColor,
            this._settings.emptyWorkspaceBorderColor,
            this._settings.emptyWorkspaceFontSize,
            this._settings.emptyWorkspaceFontWeight,
            this._settings.emptyWorkspaceBorderRadius,
            this._settings.emptyWorkspaceBorderWidth,
            this._settings.emptyWorkspacePaddingH,
            this._settings.emptyWorkspacePaddingV,
            this._settings.appIconsEmptyBackgroundColor,
        ].forEach((setting) =>
            setting.subscribe(() => {
                this._updateStyleSheet();
                this._workspaceUpdateNotifier.notify();
            }),
        );
        this._settings.customStylesEnabled.subscribe(() => {
            this._updateStyleSheet();
            this._workspacesBarUpdateNotifier.notify();
        });
        this._settings.customStyles.subscribe(() => {
            if (this._settings.customStylesEnabled.value) {
                this._updateStyleSheet();
                this._workspacesBarUpdateNotifier.notify();
            }
        });
    }

    _getWorkspacesBarStyle() {
        const padding = this._settings.workspacesBarPadding.value;
        return `  -natural-hpadding: ${padding}px;\n`;
    }

    _getActiveWorkspaceStyle() {
        const margin = this._settings.workspaceMargin.value;
        const useAccent = this._settings.useAccentColor.value;
        const accentHex = useAccent ? this._getAccentColor() : null;
        const bg = useAccent ? accentHex : this._settings.activeWorkspaceBackgroundColor.value;
        const fg = useAccent ? '#F6F5F4' : this._settings.activeWorkspaceTextColor.value;
        const border = useAccent ? accentHex : this._settings.activeWorkspaceBorderColor.value;
        const size = this._settings.activeWorkspaceFontSize.value;
        const weight = this._settings.activeWorkspaceFontWeight.value;
        const radius = this._settings.activeWorkspaceBorderRadius.value;
        const bwidth = this._settings.activeWorkspaceBorderWidth.value;
        const padH = this._settings.activeWorkspacePaddingH.value;
        const padV = this._settings.activeWorkspacePaddingV.value;
        let style = `  margin: 0 ${margin}px;\n  background-color: ${bg};\n  color: ${fg};\n  border-color: ${border};\n  font-weight: ${weight};\n  border-radius: ${radius}px;\n  border-width: ${bwidth}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getInactiveWorkspaceStyle() {
        const margin = this._settings.workspaceMargin.value;
        const bg = this._settings.inactiveWorkspaceBackgroundColor.value;
        const fg = this._settings.inactiveWorkspaceTextColor.value;
        const border = this._settings.inactiveWorkspaceBorderColor.value;
        const size = this._settings.inactiveWorkspaceFontSize.value;
        const weight = this._settings.inactiveWorkspaceFontWeight.value;
        const radius = this._settings.inactiveWorkspaceBorderRadius.value;
        const bwidth = this._settings.inactiveWorkspaceBorderWidth.value;
        const padH = this._settings.inactiveWorkspacePaddingH.value;
        const padV = this._settings.inactiveWorkspacePaddingV.value;
        let style = `  margin: 0 ${margin}px;\n  background-color: ${bg};\n  color: ${fg};\n  border-color: ${border};\n  font-weight: ${weight};\n  border-radius: ${radius}px;\n  border-width: ${bwidth}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getEmptyWorkspaceStyle() {
        const margin = this._settings.workspaceMargin.value;
        const bg = this._settings.emptyWorkspaceBackgroundColor.value;
        const fg = this._settings.emptyWorkspaceTextColor.value;
        const border = this._settings.emptyWorkspaceBorderColor.value;
        const size = this._settings.emptyWorkspaceFontSize.value;
        const weight = this._settings.emptyWorkspaceFontWeight.value;
        const radius = this._settings.emptyWorkspaceBorderRadius.value;
        const bwidth = this._settings.emptyWorkspaceBorderWidth.value;
        const padH = this._settings.emptyWorkspacePaddingH.value;
        const padV = this._settings.emptyWorkspacePaddingV.value;
        let style = `  margin: 0 ${margin}px;\n  background-color: ${bg};\n  color: ${fg};\n  border-color: ${border};\n  font-weight: ${weight};\n  border-radius: ${radius}px;\n  border-width: ${bwidth}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getAccentColor() {
        const name = this._interfaceSettings.get_string('accent-color');
        return ACCENT_COLORS[name] || ACCENT_COLORS.blue;
    }

    _accentToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    _getActiveWsLabelStyle() {
        const useAccent = this._settings.useAccentColor.value;
        const accentHex = useAccent ? this._getAccentColor() : null;
        const bg = useAccent ? accentHex : this._settings.activeWorkspaceBackgroundColor.value;
        const fg = useAccent ? '#F6F5F4' : this._settings.activeWorkspaceTextColor.value;
        const border = useAccent ? accentHex : this._settings.activeWorkspaceBorderColor.value;
        const size = this._settings.activeWorkspaceFontSize.value;
        const weight = this._settings.activeWorkspaceFontWeight.value;
        const radius = this._settings.activeWorkspaceBorderRadius.value;
        const bwidth = this._settings.activeWorkspaceBorderWidth.value;
        const padH = this._settings.activeWorkspacePaddingH.value;
        const padV = this._settings.activeWorkspacePaddingV.value;
        let style = `  background-color: ${bg};\n  color: ${fg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-right-width: 0;\n  font-weight: ${weight};\n  border-radius: ${radius}px 0 0 ${radius}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getActiveWsIconsStyle() {
        const useAccent = this._settings.useAccentColor.value;
        const accentHex = useAccent ? this._getAccentColor() : null;
        const bg = useAccent ? this._accentToRgba(accentHex, 0.35) : this._settings.appIconsActiveBackgroundColor.value;
        const border = useAccent ? accentHex : this._settings.activeWorkspaceBorderColor.value;
        const radius = this._settings.activeWorkspaceBorderRadius.value;
        const bwidth = this._settings.activeWorkspaceBorderWidth.value;
        const padH = Math.max(0, this._settings.activeWorkspacePaddingH.value - 2);
        const padV = this._settings.activeWorkspacePaddingV.value;
        return `  background-color: ${bg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-left-width: 0;\n  border-radius: 0 ${radius}px ${radius}px 0;\n  padding: ${padV}px ${padH}px;\n  min-width: 10px;\n`;
    }

    _getInactiveWsLabelStyle() {
        const bg = this._settings.inactiveWorkspaceBackgroundColor.value;
        const fg = this._settings.inactiveWorkspaceTextColor.value;
        const border = this._settings.inactiveWorkspaceBorderColor.value;
        const size = this._settings.inactiveWorkspaceFontSize.value;
        const weight = this._settings.inactiveWorkspaceFontWeight.value;
        const radius = this._settings.inactiveWorkspaceBorderRadius.value;
        const bwidth = this._settings.inactiveWorkspaceBorderWidth.value;
        const padH = this._settings.inactiveWorkspacePaddingH.value;
        const padV = this._settings.inactiveWorkspacePaddingV.value;
        let style = `  background-color: ${bg};\n  color: ${fg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-right-width: 0;\n  font-weight: ${weight};\n  border-radius: ${radius}px 0 0 ${radius}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getInactiveWsIconsStyle() {
        const bg = this._settings.appIconsInactiveBackgroundColor.value;
        const border = this._settings.inactiveWorkspaceBorderColor.value;
        const radius = this._settings.inactiveWorkspaceBorderRadius.value;
        const bwidth = this._settings.inactiveWorkspaceBorderWidth.value;
        const padH = Math.max(0, this._settings.inactiveWorkspacePaddingH.value - 2);
        const padV = this._settings.inactiveWorkspacePaddingV.value;
        return `  background-color: ${bg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-left-width: 0;\n  border-radius: 0 ${radius}px ${radius}px 0;\n  padding: ${padV}px ${padH}px;\n  min-width: 10px;\n`;
    }

    _getEmptyWsLabelStyle() {
        const bg = this._settings.emptyWorkspaceBackgroundColor.value;
        const fg = this._settings.emptyWorkspaceTextColor.value;
        const border = this._settings.emptyWorkspaceBorderColor.value;
        const size = this._settings.emptyWorkspaceFontSize.value;
        const weight = this._settings.emptyWorkspaceFontWeight.value;
        const radius = this._settings.emptyWorkspaceBorderRadius.value;
        const bwidth = this._settings.emptyWorkspaceBorderWidth.value;
        const padH = this._settings.emptyWorkspacePaddingH.value;
        const padV = this._settings.emptyWorkspacePaddingV.value;
        let style = `  background-color: ${bg};\n  color: ${fg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-right-width: 0;\n  font-weight: ${weight};\n  border-radius: ${radius}px 0 0 ${radius}px;\n  padding: ${padV}px ${padH}px;\n`;
        if (size >= 0)
            style += `  font-size: ${size}pt;\n`;
        return style;
    }

    _getEmptyWsIconsStyle() {
        const bg = this._settings.appIconsEmptyBackgroundColor.value;
        const border = this._settings.emptyWorkspaceBorderColor.value;
        const radius = this._settings.emptyWorkspaceBorderRadius.value;
        const bwidth = this._settings.emptyWorkspaceBorderWidth.value;
        const padH = Math.max(0, this._settings.emptyWorkspacePaddingH.value - 2);
        const padV = this._settings.emptyWorkspacePaddingV.value;
        return `  background-color: ${bg};\n  border-style: solid;\n  border-color: ${border};\n  border-width: ${bwidth}px;\n  border-left-width: 0;\n  border-radius: 0 ${radius}px ${radius}px 0;\n  padding: ${padV}px ${padH}px;\n  min-width: 10px;\n`;
    }
}
