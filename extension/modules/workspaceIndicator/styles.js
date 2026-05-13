import Gio from 'gi://Gio';
import St from 'gi://St';
import { DebouncingNotifier } from './debouncingNotifier.js';
import { Settings } from './settings.js';

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
        this._registerSettingChanges();
        this._updateStyleSheet();
    }

    _destroy() {
        this._workspaceUpdateNotifier.destroy();
        this._unloadStyleSheet();
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
        content += `.space-bar-workspace-label.inactive.empty {\n${this._getEmptyWorkspaceStyle()}}`;
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
            this._settings.activeWorkspaceBackgroundColor,
            this._settings.activeWorkspaceTextColor,
            this._settings.activeWorkspaceBorderColor,
            this._settings.activeWorkspaceFontSize,
            this._settings.activeWorkspaceFontWeight,
            this._settings.activeWorkspaceBorderRadius,
            this._settings.activeWorkspaceBorderWidth,
            this._settings.activeWorkspacePaddingH,
            this._settings.activeWorkspacePaddingV,
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
        const bg = this._settings.activeWorkspaceBackgroundColor.value;
        const fg = this._settings.activeWorkspaceTextColor.value;
        const border = this._settings.activeWorkspaceBorderColor.value;
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
}
