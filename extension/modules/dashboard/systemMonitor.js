'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

let GTop, hasGTop = true;
try {
    GTop = imports.gi.GTop;
} catch (e) {
    hasGTop = false;
}

const ROUNDNESS = 7;

export var LevelBar = GObject.registerClass(
class LevelBar extends St.BoxLayout {
    _init(props = {}) {
        super._init({
            style_class: `level-bar ${props.style_class || ''}`,
            y_expand: true,
            x_expand: true,
        });
        this._fillLevel = new St.Bin({
            style_class: 'level-fill',
            x_expand: true,
            y_expand: true,
        });
        this.add_child(this._fillLevel);
        this._value = props.value || 0;
        this._vertical = props.vertical || false;
        this._roundness = props.roundness || ROUNDNESS;
        this._zero = props.zero || 0;
        this._timeoutDelay = props.timeoutDelay || 80;
        this._timeoutId = 0;

        this.style = `border-radius: ${this._roundness}px;`;
        this._fillLevel.style = `border-radius: ${this._roundness}px;`;

        if (this._vertical) {
            this._fillLevel.x_align = Clutter.ActorAlign.FILL;
            this._fillLevel.y_align = Clutter.ActorAlign.END;
        } else {
            this._fillLevel.x_align = Clutter.ActorAlign.START;
            this._fillLevel.y_align = Clutter.ActorAlign.FILL;
        }

        this.connect('destroy', () => {
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
        });
    }

    get value() {
        return this._value;
    }

    set value(v) {
        this._value = v;
        this._repaint();
    }

    animate(v) {
        this._value = v;
        this._repaint(true);
    }

    _repaint(animate = false) {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (!this.has_allocation()) {
            this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                this._timeoutDelay, () => this._repaint(animate));
            return;
        }

        let v = this._value;
        if (v > 1) v = 1;
        if (v < 0) v = 0;

        if (this._vertical) {
            const max = this.height;
            let zero = Math.min(this._roundness * 2, this.width);
            zero = Math.max(zero, this._zero);
            const val = Math.floor((max - zero) * v + zero);
            if (animate) {
                this._fillLevel.ease({
                    height: val,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                this._fillLevel.height = val;
            }
        } else {
            const max = this.width;
            let zero = Math.min(this._roundness * 2, this.height);
            zero = Math.max(zero, this._zero);
            const val = Math.floor((max - zero) * v + zero);
            if (animate) {
                this._fillLevel.ease({
                    width: val,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                this._fillLevel.width = val;
            }
        }
    }
});

const SystemLevelBar = GObject.registerClass(
class SystemLevelBar extends LevelBar {
    _init(vertical) {
        super._init({
            vertical,
            roundness: ROUNDNESS,
        });
        if (this._vertical) {
            this.x_align = Clutter.ActorAlign.CENTER;
            this.y_align = Clutter.ActorAlign.FILL;
        } else {
            this.x_align = Clutter.ActorAlign.FILL;
            this.y_align = Clutter.ActorAlign.CENTER;
        }
    }
});

const UsageLevel = GObject.registerClass(
class UsageLevel extends St.BoxLayout {
    _init(vertical) {
        super._init({
            style_class: 'usage-level',
            x_expand: true,
            y_expand: true,
        });
        if (vertical)
            this.vertical = true;
        this.colorSwitchValues = [25, 50, 75];

        this.icon = new St.Icon({reactive: true, track_hover: true, icon_size: 16});
        this.label = new St.Label({style_class: 'level-label'});
        this.level = new SystemLevelBar(vertical);
        this.hoverLabel = new St.Label({style_class: 'dash-label'});
        this.icon.connect('notify::hover', () => this._toggleHoverLabel());

        this._buildUI();
    }

    updateLevel() {
        this.setUsage();
        this.setColorClass();
    }

    setColorClass() {
        const value = this.level.value * 100;
        this.remove_style_pseudo_class('red');
        this.remove_style_pseudo_class('orange');
        this.remove_style_pseudo_class('yellow');
        this.remove_style_pseudo_class('green');
        if (this.colorSwitchValues[0] < this.colorSwitchValues[2]) {
            if (value >= this.colorSwitchValues[2])
                this.add_style_pseudo_class('red');
            else if (value >= this.colorSwitchValues[1])
                this.add_style_pseudo_class('orange');
            else if (value >= this.colorSwitchValues[0])
                this.add_style_pseudo_class('yellow');
            else
                this.add_style_pseudo_class('green');
        } else if (value >= this.colorSwitchValues[2]) {
            this.add_style_pseudo_class('green');
        } else if (value >= this.colorSwitchValues[1]) {
            this.add_style_pseudo_class('yellow');
        } else if (value >= this.colorSwitchValues[0]) {
            this.add_style_pseudo_class('orange');
        } else {
            this.add_style_pseudo_class('red');
        }
    }

    _buildUI() {
        if (this.vertical) {
            this.add_child(this.label);
            this.add_child(this.level);
            this.add_child(this.icon);
            this.vertical = true;
            this.label.style = 'text-align: center';
            this.x_align = Clutter.ActorAlign.CENTER;
            this.x_expand = true;
        } else {
            this.add_child(this.icon);
            this.add_child(this.level);
            this.add_child(this.label);
            this.y_align = Clutter.ActorAlign.CENTER;
            this.y_expand = true;
        }
    }

    _toggleHoverLabel() {
        if (this.icon.hover) {
            global.stage.add_actor(this.hoverLabel);
            this.hoverLabel.opacity = 0;
            const [stageX, stageY] = this.icon.get_transformed_position();
            const iconWidth = this.icon.allocation.get_width();
            const labelWidth = this.hoverLabel.get_width();
            const xOffset = Math.floor((iconWidth - labelWidth) / 2);
            const x = Math.clamp(stageX + xOffset, 0, global.stage.width - labelWidth);
            const y = stageY - this.icon.height;
            this.hoverLabel.set_position(x, y);
            this.hoverLabel.ease({
                opacity: 255,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this.hoverLabel.get_parent()?.remove_child(this.hoverLabel);
        }
    }
});

export var PowerLevel = GObject.registerClass(
class PowerLevel extends UsageLevel {
    _init(vertical) {
        super._init(vertical);
        this.icon.icon_name = 'battery-symbolic';
        this.hoverLabel.text = 'Battery';
        this.colorSwitchValues = [75, 50, 25];

        const DisplayDeviceInterface = `
<node>
  <interface name="org.freedesktop.UPower.Device">
    <property name="IsPresent" type="b" access="read"/>
    <property name="State" type="u" access="read"/>
    <property name="Percentage" type="d" access="read"/>
    <property name="IconName" type="s" access="read"/>
  </interface>
</node>`;
        const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);

        this._proxy = new PowerManagerProxy(Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice',
            (_proxy, error) => {
                if (error)
                    log(error.message);
            });

        this.connect('destroy', () => {
            this._proxy = null;
        });
    }

    setUsage() {
        if (this._proxy && this._proxy.IsPresent) {
            this.show();
            const percentage = this._proxy.Percentage;
            const fillLevel = 10 * Math.floor(percentage / 10);

            const UPower = {
                DeviceState: {
                    CHARGING: 1,
                    FULLY_CHARGED: 4,
                }
            };

            const chargingState = this._proxy.State === UPower.DeviceState.CHARGING
                ? '-charging' : '';
            const charged =
                this._proxy.State === UPower.DeviceState.FULLY_CHARGED ||
                (this._proxy.State === UPower.DeviceState.CHARGING && fillLevel === 100);

            this.icon.icon_name = charged
                ? 'battery-level-100-charged-symbolic'
                : `battery-level-${fillLevel}${chargingState}-symbolic`;

            this.icon.fallback_icon_name = this._proxy.IconName;
            this.label.text = fillLevel > 99 ? 'F' : `${percentage.toString()}%`;
            this.level.value = percentage / 100;
        } else {
            this.hide();
        }
    }
});

export var CpuLevel = GObject.registerClass(
class CpuLevel extends UsageLevel {
    _init(vertical) {
        super._init(vertical);
        this.icon.icon_name = 'power-profile-performance-symbolic';
        this.hoverLabel.text = 'CPU';
        this.lastCPUTotal = 0;
        this.lastCPUUsed = 0;
    }

    setUsage() {
        let currentCPUUsage = 0;
        try {
            const [, content] = Gio.File.new_for_path('/proc/stat').load_contents(null);
            const text = new TextDecoder().decode(content);
            const lines = text.split('\n');

            let currentCPUUsed = 0;
            let currentCPUTotal = 0;

            for (let i = 0; i < lines.length; i++) {
                const fields = lines[i].trim().split(/\W+/);
                if (fields.length < 2)
                    continue;
                if (fields[0] === 'cpu' && fields.length >= 5) {
                    const user = Number.parseInt(fields[1]);
                    const nice = Number.parseInt(fields[2]) || 0;
                    const system = Number.parseInt(fields[3]);
                    const idle = Number.parseInt(fields[4]);
                    const iowait = Number.parseInt(fields[5]) || 0;
                    const irq = Number.parseInt(fields[6]) || 0;
                    const softirq = Number.parseInt(fields[7]) || 0;
                    const steal = Number.parseInt(fields[8]) || 0;

                    currentCPUUsed = user + nice + system;
                    currentCPUTotal = user + nice + system + idle + iowait + irq + softirq + steal;
                    break;
                }
            }

            const totalDelta = currentCPUTotal - this.lastCPUTotal;
            const usedDelta = currentCPUUsed - this.lastCPUUsed;

            if (totalDelta > 0) {
                currentCPUUsage = usedDelta / totalDelta;
                if (currentCPUUsage < 0 || !Number.isFinite(currentCPUUsage))
                    currentCPUUsage = 0;
            } else {
                currentCPUUsage = 0;
            }

            this.lastCPUTotal = currentCPUTotal;
            this.lastCPUUsed = currentCPUUsed;
        } catch (e) {
            this.hide();
            logError(e);
        }

        this.level.value = currentCPUUsage;
        this.label.text = `${Math.floor(currentCPUUsage * 100)}%`;
    }
});

export var RamLevel = GObject.registerClass(
class RamLevel extends UsageLevel {
    _init(vertical) {
        super._init(vertical);
        this.icon.icon_name = 'drive-harddisk-solidstate-symbolic';
        this.hoverLabel.text = 'RAM';
    }

    setUsage() {
        let currentMemoryUsage = 0;
        try {
            const [, content] = Gio.File.new_for_path('/proc/meminfo').load_contents(null);
            const text = new TextDecoder().decode(content);
            const lines = text.split('\n');

            let memTotal = -1;
            let memAvailable = -1;

            for (let i = 0; i < lines.length; i++) {
                const fields = lines[i].trim().split(/\W+/);
                if (fields.length < 2)
                    break;
                const name = fields[0];
                const val = Number.parseInt(fields[1]);
                if (name === 'MemTotal')
                    memTotal = val;
                if (name === 'MemAvailable')
                    memAvailable = val;
                if (memTotal !== -1 && memAvailable !== -1)
                    break;
            }

            if (memTotal !== -1 && memAvailable !== -1) {
                currentMemoryUsage = (memTotal - memAvailable) / memTotal;
            }
        } catch (e) {
            this.hide();
            logError(e);
        }

        this.level.value = currentMemoryUsage;
        this.label.text = `${Math.floor(currentMemoryUsage * 100)}%`;
    }
});

export var TempLevel = GObject.registerClass(
class TempLevel extends UsageLevel {
    _init(vertical) {
        super._init(vertical);
        this.icon.icon_name = 'temperature-symbolic';
        this.hoverLabel.text = 'Temperature';
        this.colorSwitchValues = [50, 65, 80];
    }

    setUsage() {
        try {
            const [, contents] =
                Gio.File.new_for_path('/sys/class/thermal/thermal_zone0/temp')
                .load_contents(null);
            const temperature = Number.parseInt(
                new TextDecoder().decode(contents)
            ) / 100000;

            this.level.value = temperature;
            this.label.text = `${Math.floor(temperature * 100)}\u02DA`;
        } catch (e) {
            this.hide();
            logError(e);
        }
    }
});

export var StorageLevel = GObject.registerClass(
class StorageLevel extends UsageLevel {
    _init(vertical) {
        super._init(vertical);
        this.icon.icon_name = 'drive-harddisk-symbolic';
        this.hoverLabel.text = 'Disk';
        this.colorSwitchValues = [40, 60, 80];

        if (hasGTop)
            this.storage = new GTop.glibtop_fsusage();

        this.connect('destroy', () => {
            this.storage = null;
        });
    }

    setUsage() {
        if (hasGTop && this.storage) {
            GTop.glibtop_get_fsusage(this.storage, '/');
            const max = this.storage.blocks * this.storage.block_size;
            const free = this.storage.bfree * this.storage.block_size;
            const used = max - free;
            this.level.value = used / max;
            this.label.text = `${Math.floor((used / max) * 100)}%`;
        } else {
            this.hide();
        }
    }
});
