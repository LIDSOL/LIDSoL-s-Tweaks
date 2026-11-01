import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

export function createQWindow(uiPath) {
    const uiFile = Gio.File.new_for_path(uiPath);
    const [, bytes] = uiFile.load_contents(null);

    return GObject.registerClass({
        GTypeName: 'QWindow',
        Template: bytes,
        InternalChildren: ['form_area', 'listBox', 'openButton', 'toast_overlay'],
    }, class QWindow extends Gtk.ApplicationWindow {
        vfunc_close_request() {
            super.vfunc_close_request();
            this.run_dispose();
        }
    });
}
