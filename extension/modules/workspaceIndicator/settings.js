import Gio from 'gi://Gio';

export const ICON_PRESETS = {
    small:  { iconSize: 16, fontSize: 12, numSpacing: 5, btnSpacing: 4, vertSpacing: 3, roundness: 6, borderWidth: 2, iconSpacing: 3, wrapperSpacing: 4 },
    medium: { iconSize: 20, fontSize: 15, numSpacing: 7, btnSpacing: 6, vertSpacing: 4, roundness: 8, borderWidth: 2, iconSpacing: 5, wrapperSpacing: 5 },
    large:  { iconSize: 26, fontSize: 19, numSpacing: 9, btnSpacing: 8, vertSpacing: 5, roundness: 10, borderWidth: 2, iconSpacing: 6, wrapperSpacing: 6 },
};

class SettingsSubject {
    static _subjects = [];

    static createBoolean(settings, name) {
        return new SettingsSubject(settings, name, 'boolean');
    }

    static createInt(settings, name) {
        return new SettingsSubject(settings, name, 'int');
    }

    static createString(settings, name) {
        return new SettingsSubject(settings, name, 'string');
    }

    static createStringArray(settings, name) {
        return new SettingsSubject(settings, name, 'string-array');
    }

    static createJsonObject(settings, name) {
        return new SettingsSubject(settings, name, 'json-object');
    }

    static initAll() {
        for (const subject of SettingsSubject._subjects)
            subject._init();
    }

    static destroyAll() {
        for (const subject of SettingsSubject._subjects)
            subject._destroy();
        SettingsSubject._subjects = [];
    }

    get value() {
        return this._value;
    }

    set value(value) {
        this._setValue(value);
    }

    constructor(settings, name, type) {
        this._settings = settings;
        this._name = name;
        this._type = type;
        this._value = undefined;
        this._subscribers = [];
        this._getValue = null;
        this._setValue = null;
        this._disconnect = null;
        SettingsSubject._subjects.push(this);
    }

    subscribe(subscriber, { emitCurrentValue = false } = {}) {
        this._subscribers.push(subscriber);
        if (emitCurrentValue)
            subscriber(this._value);
    }

    _init() {
        this._getValue = () => {
            switch (this._type) {
                case 'boolean': return this._settings.get_boolean(this._name);
                case 'int': return this._settings.get_int(this._name);
                case 'string': return this._settings.get_string(this._name);
                case 'string-array': return this._settings.get_strv(this._name);
                case 'json-object': return JSON.parse(this._settings.get_string(this._name) || '{}');
            }
        };
        this._setValue = (value) => {
            switch (this._type) {
                case 'boolean': this._settings.set_boolean(this._name, value); break;
                case 'int': this._settings.set_int(this._name, value); break;
                case 'string': this._settings.set_string(this._name, value); break;
                case 'string-array': this._settings.set_strv(this._name, value); break;
                case 'json-object': this._settings.set_string(this._name, JSON.stringify(value)); break;
            }
        };
        this._value = this._getValue();
        const changed = this._settings.connect(`changed::${this._name}`, () => {
            this._value = this._getValue();
            for (const subscriber of this._subscribers)
                subscriber(this._value);
        });
        this._disconnect = () => this._settings.disconnect(changed);
    }

    _destroy() {
        if (this._disconnect)
            this._disconnect();
        this._subscribers = [];
    }
}

export class Settings {
    static _instance = null;
    static _settings = null;

    static init(gsettings) {
        Settings._settings = gsettings;
        Settings._instance = new Settings();
        Settings._instance._init();
    }

    static destroy() {
        Settings._instance?._destroy();
        Settings._instance = null;
        Settings._settings = null;
    }

    static getInstance() {
        return Settings._instance;
    }

    _init() {
        const s = Settings._settings;

        this.wsEnabled = s;

        this.mutterSettings = new Gio.Settings({ schema: 'org.gnome.mutter' });
        this.wmPreferencesSettings = new Gio.Settings({ schema: 'org.gnome.desktop.wm.preferences' });

        this._version = SettingsSubject.createInt(s, 'ws-version');
        this.workspaceNamesMap = SettingsSubject.createJsonObject(s, 'ws-workspace-names-map');
        this.dynamicWorkspaces = SettingsSubject.createBoolean(this.mutterSettings, 'dynamic-workspaces');
        this.indicatorStyle = SettingsSubject.createString(s, 'ws-indicator-style');
        this.enableCustomLabel = SettingsSubject.createBoolean(s, 'ws-enable-custom-label');
        this.enableCustomLabelInMenus = SettingsSubject.createBoolean(s, 'ws-enable-custom-label-in-menu');
        this.customLabelNamed = SettingsSubject.createString(s, 'ws-custom-label-named');
        this.customLabelUnnamed = SettingsSubject.createString(s, 'ws-custom-label-unnamed');
        this.position = SettingsSubject.createString(s, 'ws-position');
        this.systemWorkspaceIndicator = SettingsSubject.createBoolean(s, 'ws-system-workspace-indicator');
        this.positionIndex = SettingsSubject.createInt(s, 'ws-position-index');
        this.scrollWheel = SettingsSubject.createString(s, 'ws-scroll-wheel');
        this.scrollWheelDebounce = SettingsSubject.createBoolean(s, 'ws-scroll-wheel-debounce');
        this.scrollWheelDebounceTime = SettingsSubject.createInt(s, 'ws-scroll-wheel-debounce-time');
        this.scrollWheelVertical = SettingsSubject.createString(s, 'ws-scroll-wheel-vertical');
        this.scrollWheelHorizontal = SettingsSubject.createString(s, 'ws-scroll-wheel-horizontal');
        this.scrollWheelWrapAround = SettingsSubject.createBoolean(s, 'ws-scroll-wheel-wrap-around');
        this.alwaysShowNumbers = SettingsSubject.createBoolean(s, 'ws-always-show-numbers');
        this.showEmptyWorkspaces = SettingsSubject.createBoolean(s, 'ws-show-empty-workspaces');
        this.toggleOverview = SettingsSubject.createBoolean(s, 'ws-toggle-overview');
        this.showAppIcons = SettingsSubject.createBoolean(s, 'ws-show-app-icons');
        this.smartWorkspaceNames = SettingsSubject.createBoolean(s, 'ws-smart-workspace-names');
        this.reevaluateSmartWorkspaceNames = SettingsSubject.createBoolean(s, 'ws-reevaluate-smart-workspace-names');
        this.enableActivateWorkspaceShortcuts = SettingsSubject.createBoolean(s, 'ws-enable-activate-workspace-shortcuts');
        this.backAndForth = SettingsSubject.createBoolean(s, 'ws-back-and-forth');
        this.enableMoveToWorkspaceShortcuts = SettingsSubject.createBoolean(s, 'ws-enable-move-to-workspace-shortcuts');
        this.workspaceNames = SettingsSubject.createStringArray(this.wmPreferencesSettings, 'workspace-names');

        // Appearance
        this.workspacesBarPadding = SettingsSubject.createInt(s, 'ws-workspaces-bar-padding');
        this.workspaceMargin = SettingsSubject.createInt(s, 'ws-workspace-margin');
        this.iconSizeMode = SettingsSubject.createString(s, 'ws-icon-size-mode');
        this.activeWorkspaceBackgroundColor = SettingsSubject.createString(s, 'ws-active-workspace-background-color');
        this.activeWorkspaceTextColor = SettingsSubject.createString(s, 'ws-active-workspace-text-color');
        this.activeWorkspaceBorderColor = SettingsSubject.createString(s, 'ws-active-workspace-border-color');
        this.activeWorkspaceFontSize = SettingsSubject.createInt(s, 'ws-active-workspace-font-size');
        this.activeWorkspaceFontWeight = SettingsSubject.createString(s, 'ws-active-workspace-font-weight');
        this.activeWorkspaceBorderRadius = SettingsSubject.createInt(s, 'ws-active-workspace-border-radius');
        this.activeWorkspaceBorderWidth = SettingsSubject.createInt(s, 'ws-active-workspace-border-width');
        this.activeWorkspacePaddingH = SettingsSubject.createInt(s, 'ws-active-workspace-padding-h');
        this.activeWorkspacePaddingV = SettingsSubject.createInt(s, 'ws-active-workspace-padding-v');

        this.inactiveWorkspaceBackgroundColor = SettingsSubject.createString(s, 'ws-inactive-workspace-background-color');
        this.inactiveWorkspaceTextColor = SettingsSubject.createString(s, 'ws-inactive-workspace-text-color');
        this.inactiveWorkspaceBorderColor = SettingsSubject.createString(s, 'ws-inactive-workspace-border-color');
        this.inactiveWorkspaceFontSize = SettingsSubject.createInt(s, 'ws-inactive-workspace-font-size');
        this.inactiveWorkspaceFontWeight = SettingsSubject.createString(s, 'ws-inactive-workspace-font-weight');
        this.inactiveWorkspaceBorderRadius = SettingsSubject.createInt(s, 'ws-inactive-workspace-border-radius');
        this.inactiveWorkspaceBorderWidth = SettingsSubject.createInt(s, 'ws-inactive-workspace-border-width');
        this.inactiveWorkspacePaddingH = SettingsSubject.createInt(s, 'ws-inactive-workspace-padding-h');
        this.inactiveWorkspacePaddingV = SettingsSubject.createInt(s, 'ws-inactive-workspace-padding-v');

        this.emptyWorkspaceBackgroundColor = SettingsSubject.createString(s, 'ws-empty-workspace-background-color');
        this.emptyWorkspaceTextColor = SettingsSubject.createString(s, 'ws-empty-workspace-text-color');
        this.emptyWorkspaceBorderColor = SettingsSubject.createString(s, 'ws-empty-workspace-border-color');
        this.emptyWorkspaceFontSize = SettingsSubject.createInt(s, 'ws-empty-workspace-font-size');
        this.emptyWorkspaceFontWeight = SettingsSubject.createString(s, 'ws-empty-workspace-font-weight');
        this.emptyWorkspaceBorderRadius = SettingsSubject.createInt(s, 'ws-empty-workspace-border-radius');
        this.emptyWorkspaceBorderWidth = SettingsSubject.createInt(s, 'ws-empty-workspace-border-width');
        this.emptyWorkspacePaddingH = SettingsSubject.createInt(s, 'ws-empty-workspace-padding-h');
        this.emptyWorkspacePaddingV = SettingsSubject.createInt(s, 'ws-empty-workspace-padding-v');

        this.transitionAnimation = SettingsSubject.createString(s, 'ws-transition-animation');
        this.enableAnimations = SettingsSubject.createBoolean(s, 'ws-enable-animations');
        this.useAccentColor = SettingsSubject.createBoolean(s, 'ws-use-accent-color');
        this.dimInactiveIcons = SettingsSubject.createBoolean(s, 'ws-dim-inactive-icons');
        this.desaturateInactiveIcons = SettingsSubject.createBoolean(s, 'ws-desaturate-inactive-icons');
        this.focusScaleEffect = SettingsSubject.createBoolean(s, 'ws-focus-scale-effect');
        this.focusScaleReduction = SettingsSubject.createInt(s, 'ws-focus-scale-reduction');
        this.middleClickClose = SettingsSubject.createBoolean(s, 'ws-middle-click-close');
        this.appIconsActiveBackgroundColor = SettingsSubject.createString(s, 'ws-app-icons-active-background-color');
        this.appIconsInactiveBackgroundColor = SettingsSubject.createString(s, 'ws-app-icons-inactive-background-color');
        this.appIconsEmptyBackgroundColor = SettingsSubject.createString(s, 'ws-app-icons-empty-background-color');
        this.applicationStyles = SettingsSubject.createString(s, 'ws-application-styles');
        this.customStylesEnabled = SettingsSubject.createBoolean(s, 'ws-custom-styles-enabled');
        this.customStylesFailed = SettingsSubject.createBoolean(s, 'ws-custom-styles-failed');
        this.customStyles = SettingsSubject.createString(s, 'ws-custom-styles');

        this._settings = s;
        SettingsSubject.initAll();
        this._runMigrations();
    }

    _destroy() {
        SettingsSubject.destroyAll();
    }

    _runMigrations() {
        if (this._version.value < 26) {
            if (this.indicatorStyle.value === 'current-workspace-name')
                this.indicatorStyle.value = 'current-workspace';
        }
        this._version.value = 1;
    }
}
