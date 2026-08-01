import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Maid from '../../core/maid.js';
import { BatteryIndicatorWidget } from './widget.js';

const DisplayDeviceInterface = `
<node>
  <interface name="org.freedesktop.UPower.Device">
    <property name="Percentage" type="d" access="read"/>
    <property name="State" type="u" access="read"/>
    <property name="IsPresent" type="b" access="read"/>
    <property name="IconName" type="s" access="read"/>
  </interface>
</node>`;

const SETTINGS_KEYS = [
    'bi-top-bar-style',
    'bi-show-percentage',
    'bi-bar-width',
    'bi-bar-height',
    'bi-bar-radius',
    'bi-color',
    'bi-charging-color',
    'bi-low-color',
    'bi-bg-color',
    'bi-low-threshold',
    'bi-position',
    'bi-offset',
];

export class BatteryIndicatorModule {
    constructor() {
        this._maid = new Maid();
        this._settings = null;
        this._extension = null;
        this._proxy = null;
        this._indicator = null;
        this._stockIndicator = null;
        this._stylesheetFile = null;
        this._handlerIds = [];
    }

    enable(settings, extension) {
        this._settings = settings;
        this._extension = extension;

        this._loadStylesheet();

        this._handlerIds = SETTINGS_KEYS.map(key =>
            this._settings.connect(`changed::${key}`, () => {
                const gs = this._settings;
                const ext = this._extension;
                this.disable();
                this.enable(gs, ext);
            })
        );

        this._setupProxy();
        this._addPanelButton();
    }

    disable() {
        this._handlerIds.forEach(id => {
            if (this._settings) this._settings.disconnect(id);
        });
        this._handlerIds = [];

        this._maid.clear();

        if (this._proxy) {
            try { this._proxy.disconnectObject(this); } catch (e) {}
            this._proxy = null;
        }

        if (this._indicator) {
            const container = this._indicator.get_parent();
            this._indicator.destroy();
            if (container) container.destroy();
            this._indicator = null;
        }

        if (this._stockIndicator)
            this._stockIndicator.show();

        if (this._stylesheetFile) {
            const tc = St.ThemeContext.get_for_stage(global.stage);
            tc.get_theme().unload_stylesheet(this._stylesheetFile);
            this._stylesheetFile = null;
        }

        this._extension = null;
        this._settings = null;
    }

    _setupProxy() {
        const proxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);
        this._proxy = new proxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice'
        );
        this._proxy.connectObject('g-properties-changed', () => this._sync(), this);
        this._sync();
    }

    _addPanelButton() {
        this._stockIndicator = Main.panel.statusArea.quickSettings?._system;

        this._indicator = new BatteryIndicatorWidget(this._settings);

        const posMap = ['left', 'center', 'right'];
        const pos = this._settings.get_int('bi-position');
        const offset = this._settings.get_int('bi-offset');
        Main.panel.addToStatusArea('lidsol-battery-indicator', this._indicator, offset, posMap[pos] || 'right');

        this._sync();
    }

    _loadStylesheet() {
        if (!this._extension) return;
        const tc = St.ThemeContext.get_for_stage(global.stage);
        const file = Gio.File.new_for_path(
            this._extension.path + '/extension/modules/batteryIndicator/stylesheet.css'
        );
        tc.get_theme().load_stylesheet(file);
        this._stylesheetFile = file;
    }

    _sync() {
        if (this._proxy && this._indicator)
            this._indicator.sync(this._proxy);

        if (this._stockIndicator && this._proxy?.IsPresent)
            this._stockIndicator.hide();
        else if (this._stockIndicator && !this._proxy?.IsPresent)
            this._stockIndicator.show();
    }
}
