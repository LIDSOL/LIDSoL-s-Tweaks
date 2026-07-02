'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { DesktopWidget } from './baseWidget.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

const PictureWidget = GObject.registerClass(
class PictureWidget extends DesktopWidget {
    _init(settings) {
        super._init(settings);

        this._currentImagePath = '';
        this._refreshId = 0;

        this._settings.connectObject(
            'changed::pw-image-path', this._updateImagePath.bind(this),
            'changed::pw-size', this._updateStyle.bind(this),
            'changed::pw-aspect-ratio', this._updateStyle.bind(this),
            'changed::pw-position-x', this._updatePosition.bind(this),
            'changed::pw-position-y', this._updatePosition.bind(this),
            'changed::pw-corner-radius', this._updateStyle.bind(this),
            'changed::pw-refresh-interval', this._updateRefresh.bind(this),
            this
        );

        this.connect('destroy', () => {
            if (this._refreshId) {
                GLib.source_remove(this._refreshId);
                this._refreshId = 0;
            }
        });

        this._updateImagePath();
        this._updatePosition();
        this._updateRefresh();
    }

    _updateImagePath() {
        const path = this._settings.get_string('pw-image-path');
        if (!path) {
            this._currentImagePath = '';
            this._updateStyle();
            return;
        }

        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) {
            this._currentImagePath = '';
            this._updateStyle();
            return;
        }

        const fileType = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);

        if (fileType === Gio.FileType.DIRECTORY) {
            this._pickRandomFromFolder(file);
        } else {
            this._currentImagePath = path;
            this._updateStyle();
        }
    }

    _pickRandomFromFolder(folder) {
        let imageFiles = [];

        try {
            const enumerator = folder.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const childPath = folder.get_child(name);

                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    try {
                        const subEnum = childPath.enumerate_children(
                            'standard::name',
                            Gio.FileQueryInfoFlags.NONE,
                            null
                        );
                        let subInfo;
                        while ((subInfo = subEnum.next_file(null)) !== null) {
                            const subName = subInfo.get_name();
                            if (IMAGE_EXTENSIONS.some(ext => subName.toLowerCase().endsWith(ext)))
                                imageFiles.push(`${name}/${subName}`);
                        }
                        subEnum.close(null);
                    } catch (e) {
                        console.warn('[PictureWidget] Error reading subdirectory:', e);
                    }
                } else {
                    if (IMAGE_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext)))
                        imageFiles.push(name);
                }
            }
            enumerator.close(null);
        } catch (e) {
            console.warn('[PictureWidget] Error enumerating folder:', e);
        }

        if (imageFiles.length > 0) {
            const randomIndex = Math.floor(Math.random() * imageFiles.length);
            this._currentImagePath = `${folder.get_path()}/${imageFiles[randomIndex]}`;
        } else {
            this._currentImagePath = '';
        }

        this._updateStyle();
    }

    _updateStyle() {
        const baseSize = this._settings.get_int('pw-size');
        const aspectRatio = this._settings.get_double('pw-aspect-ratio');
        const radiusPercent = this._settings.get_int('pw-corner-radius');

        const width = Math.round(baseSize * Math.sqrt(aspectRatio));
        const height = Math.round(baseSize / Math.sqrt(aspectRatio));

        this.set_width(width);
        this.set_height(height);

        const radiusPx = (radiusPercent / 100) * Math.min(width, height) / 2;

        if (this._currentImagePath) {
            this.style = `
                background-image: url("file://${this._currentImagePath}");
                background-size: cover;
                border-radius: ${radiusPx}px;
            `;
        } else {
            this.style = `
                background-color: rgba(0, 0, 0, 0.3);
                border-radius: ${radiusPx}px;
            `;
        }
    }

    _updatePosition() {
        const x = this._settings.get_int('pw-position-x');
        const y = this._settings.get_int('pw-position-y');
        this.set_position(x, y);
    }

    _updateRefresh() {
        if (this._refreshId) {
            GLib.source_remove(this._refreshId);
            this._refreshId = 0;
        }

        const interval = this._settings.get_int('pw-refresh-interval');
        if (interval > 0) {
            this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
                this._updateImagePath();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }
});

export { PictureWidget };
