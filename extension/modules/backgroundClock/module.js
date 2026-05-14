'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const POSITION_ANCHORS = [
    { v: 'top',    h: 'left'   },
    { v: 'top',    h: 'center' },
    { v: 'top',    h: 'right'  },
    { v: 'middle', h: 'left'   },
    { v: 'middle', h: 'center' },
    { v: 'middle', h: 'right'  },
    { v: 'bottom', h: 'left'   },
    { v: 'bottom', h: 'center' },
    { v: 'bottom', h: 'right'  },
];

const BackgroundClockWidget = GObject.registerClass(
class BackgroundClockWidget extends St.Widget {
    _init(settings) {
        super._init({ reactive: false });

        this._settings = settings;

        this._box = new St.BoxLayout({ vertical: true });
        this._clockLabel = new St.Label();
        this._dateLabel = new St.Label();
        this._box.add_child(this._clockLabel);
        this._box.add_child(this._dateLabel);
        this.add_child(this._box);

        this._settings.connectObject(
            'changed::background-clock-position', this._settingsChanged.bind(this),
            'changed::background-clock-x-offset', this._settingsChanged.bind(this),
            'changed::background-clock-y-offset', this._settingsChanged.bind(this),
            'changed::background-clock-enable-clock', this._settingsChanged.bind(this),
            'changed::background-clock-clock-format', this._settingsChanged.bind(this),
            'changed::background-clock-clock-size', this._settingsChanged.bind(this),
            'changed::background-clock-clock-custom-font', this._settingsChanged.bind(this),
            'changed::background-clock-clock-font', this._settingsChanged.bind(this),
            'changed::background-clock-clock-color', this._settingsChanged.bind(this),
            'changed::background-clock-clock-shadow-x', this._settingsChanged.bind(this),
            'changed::background-clock-clock-shadow-y', this._settingsChanged.bind(this),
            'changed::background-clock-clock-shadow-blur', this._settingsChanged.bind(this),
            'changed::background-clock-clock-shadow-color', this._settingsChanged.bind(this),
            'changed::background-clock-enable-date', this._settingsChanged.bind(this),
            'changed::background-clock-date-format', this._settingsChanged.bind(this),
            'changed::background-clock-date-size', this._settingsChanged.bind(this),
            'changed::background-clock-date-custom-font', this._settingsChanged.bind(this),
            'changed::background-clock-date-font', this._settingsChanged.bind(this),
            'changed::background-clock-date-color', this._settingsChanged.bind(this),
            'changed::background-clock-date-shadow-x', this._settingsChanged.bind(this),
            'changed::background-clock-date-shadow-y', this._settingsChanged.bind(this),
            'changed::background-clock-date-shadow-blur', this._settingsChanged.bind(this),
            'changed::background-clock-date-shadow-color', this._settingsChanged.bind(this),
            'changed::background-clock-bg-color', this._settingsChanged.bind(this),
            'changed::background-clock-bg-padding', this._settingsChanged.bind(this),
            'changed::background-clock-bg-border-size', this._settingsChanged.bind(this),
            'changed::background-clock-bg-border-radius', this._settingsChanged.bind(this),
            'changed::background-clock-bg-border-color', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-inset', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-x', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-y', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-blur', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-width', this._settingsChanged.bind(this),
            'changed::background-clock-bg-shadow-color', this._settingsChanged.bind(this),
            this
        );

        this._updateTimer();

        this._settingsChanged();

        this._allocationId = this.connect('notify::allocation', () => {
            this._updatePosition();
        });

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _updateTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateClockContents();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _ensureChildren() {
        const showClock = this._settings.get_boolean('background-clock-enable-clock');
        const showDate = this._settings.get_boolean('background-clock-enable-date');

        const children = this._box.get_children();
        const hasClock = children.indexOf(this._clockLabel) !== -1;
        const hasDate = children.indexOf(this._dateLabel) !== -1;

        if (showClock && !hasClock)
            this._box.add_child(this._clockLabel);
        else if (!showClock && hasClock)
            this._box.remove_child(this._clockLabel);

        if (showDate && !hasDate)
            this._box.add_child(this._dateLabel);
        else if (!showDate && hasDate)
            this._box.remove_child(this._dateLabel);
    }

    _settingsChanged() {
        this._ensureChildren();

        this._clockFormat = this._settings.get_string('background-clock-clock-format');
        this._dateFormat = this._settings.get_string('background-clock-date-format');

        this._updateClockContents();
        this._updateStyle();
    }

    _updateStyle() {
        this.style = `
            background-color: ${this._settings.get_string('background-clock-bg-color')};
            border: ${this._settings.get_int('background-clock-bg-border-size')}px
                    solid
                    ${this._settings.get_string('background-clock-bg-border-color')};
            border-radius: ${this._settings.get_int('background-clock-bg-border-radius')}px;
            box-shadow: ${this._settings.get_boolean('background-clock-bg-shadow-inset') ? 'inset' : ''}
                        ${this._settings.get_int('background-clock-bg-shadow-x')}px
                        ${this._settings.get_int('background-clock-bg-shadow-y')}px
                        ${this._settings.get_int('background-clock-bg-shadow-blur')}px
                        ${this._settings.get_int('background-clock-bg-shadow-width')}px
                        ${this._settings.get_string('background-clock-bg-shadow-color')};
            padding: ${this._settings.get_int('background-clock-bg-padding')}px;
        `;

        this._clockLabel.style = `
            font-size: ${this._settings.get_int('background-clock-clock-size')}pt;
            color: ${this._settings.get_string('background-clock-clock-color')};
            text-shadow: ${this._settings.get_int('background-clock-clock-shadow-x')}px
                         ${this._settings.get_int('background-clock-clock-shadow-y')}px
                         ${this._settings.get_int('background-clock-clock-shadow-blur')}px
                         ${this._settings.get_string('background-clock-clock-shadow-color')};
        `;
        if (this._settings.get_boolean('background-clock-clock-custom-font'))
            this._clockLabel.style += `font-family: ${this._settings.get_string('background-clock-clock-font')};`;

        this._dateLabel.style = `
            font-size: ${this._settings.get_int('background-clock-date-size')}pt;
            color: ${this._settings.get_string('background-clock-date-color')};
            text-shadow: ${this._settings.get_int('background-clock-date-shadow-x')}px
                         ${this._settings.get_int('background-clock-date-shadow-y')}px
                         ${this._settings.get_int('background-clock-date-shadow-blur')}px
                         ${this._settings.get_string('background-clock-date-shadow-color')};
        `;
        if (this._settings.get_boolean('background-clock-date-custom-font'))
            this._dateLabel.style += `font-family: ${this._settings.get_string('background-clock-date-font')};`;
    }

    _updateClockContents() {
        const clock = GLib.DateTime.new_now_local().format(this._clockFormat);
        const date = GLib.DateTime.new_now_local().format(this._dateFormat);

        this._clockLabel.set_text(clock);
        this._dateLabel.set_text(date);
    }

    _updatePosition() {
        if (this.width === 0 || this.height === 0)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;

        const pos = this._settings.get_int('background-clock-position') || 8;
        const xOff = this._settings.get_int('background-clock-x-offset');
        const yOff = this._settings.get_int('background-clock-y-offset');
        const anchor = POSITION_ANCHORS[pos];

        let x, y;

        if (anchor.h === 'left')
            x = monitor.x + xOff;
        else if (anchor.h === 'right')
            x = monitor.x + monitor.width - this.width - xOff;
        else
            x = monitor.x + Math.round((monitor.width - this.width) / 2) + xOff;

        if (anchor.v === 'top')
            y = monitor.y + yOff;
        else if (anchor.v === 'bottom')
            y = monitor.y + monitor.height - this.height - yOff;
        else
            y = monitor.y + Math.round((monitor.height - this.height) / 2) + yOff;

        this.set_position(x, y);
    }

    _onDestroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._allocationId) {
            this.disconnect(this._allocationId);
            this._allocationId = 0;
        }
        this._settings.disconnectObject(this);
    }
});

export class BackgroundClockModule {
    constructor() {
        this._widget = null;
    }

    enable(gsettings, extension) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            console.warn('[BackgroundClock] No primary monitor available');
            return;
        }

        this._widget = new BackgroundClockWidget(gsettings);

        const bgGroup = Main.layoutManager._backgroundGroup;
        const container = bgGroup || Main.layoutManager.uiGroup;
        container.add_child(this._widget);
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
    }
}
