'use strict';

export const SettingType = {
    BOOLEAN: 'Boolean',
    INTEGER: 'Integer',
    DOUBLE: 'Double',
    STRING: 'String',
};

class Setting {
    constructor(settings, key) {
        this.key = key.name;
        this._settings = settings;
        this._connectionId = null;
    }

    changed(callback) {
        this._connectionId = this._settings.connect('changed::' + this.key, callback);
        return this._connectionId;
    }

    disconnect(id = this._connectionId) {
        if (id) {
            return this._settings.disconnect(id);
        }
        return false;
    }

    get() {
        return undefined;
    }

    set(_value) {
        return false;
    }
}

class BooleanSetting extends Setting {
    get() {
        return this._settings.get_boolean(this.key);
    }

    set(value) {
        return this._settings.set_boolean(this.key, value);
    }
}

class IntegerSetting extends Setting {
    get() {
        return this._settings.get_int(this.key);
    }

    set(value) {
        return this._settings.set_int(this.key, value);
    }
}

class DoubleSetting extends Setting {
    get() {
        return this._settings.get_double(this.key);
    }

    set(value) {
        return this._settings.set_double(this.key, value);
    }
}

class StringSetting extends Setting {
    get() {
        return this._settings.get_string(this.key);
    }

    set(value) {
        return this._settings.set_string(this.key, value);
    }
}

export class SettingsManager {
    constructor(keys, gsettings) {
        this._keys = keys;
        this._settings = gsettings;

        keys.forEach(key => {
            const propName = this._getPropertyName(key.name);

            switch (key.type) {
                case SettingType.BOOLEAN:
                    this[propName] = new BooleanSetting(gsettings, key);
                    break;
                case SettingType.INTEGER:
                    this[propName] = new IntegerSetting(gsettings, key);
                    break;
                case SettingType.DOUBLE:
                    this[propName] = new DoubleSetting(gsettings, key);
                    break;
                case SettingType.STRING:
                    this[propName] = new StringSetting(gsettings, key);
                    break;
            }
        });
    }

    _getPropertyName(name) {
        return name.replaceAll('-', '_').toUpperCase();
    }

    getProperty(name) {
        return this[this._getPropertyName(name)];
    }

    disconnectAll() {
        this._keys.forEach(key => {
            this.getProperty(key.name).disconnect();
        });
    }
}

