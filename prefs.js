'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { TopBarOrganizerPrefs } from './extension/modules/topBarOrganizer/prefsSettings.js';
import { WorkspaceIndicatorPrefs } from './extension/modules/workspaceIndicator/prefsSettings.js';
import { WorkspacePrefs } from './extension/modules/workspace/prefsSettings.js';
import { QuickSettingsPrefs } from './extension/modules/quickSettingsTweaks/prefsSettings.js';
import {
  createModuleRow,
  createSwitchRow,
  createSpinButtonRow,
  createColorButtonRow,
  createComboRow,
  createEntryRow,
  createDialog,
  createGroup,
  createKeyboardShortcutRow,
  DropDownChoice,
} from './extension/utils/prefsHelpers.js';

const CATEGORIES = [
  {
    id: 'shell',
    title: 'Herramientas',
    icon: 'applications-utilities-symbolic',
    summary: 'Herramientas de escritorio',
    description: 'Dashboard personalizable, captura rápida de notas y ajustes a la busqueda y al lanzador.',
  },
  {
    id: 'quicksettings',
    title: 'Quick Settings',
    icon: 'emblem-system-symbolic',
    summary: 'Ajustes del menú rápido',
    description: 'Avatar de usuario y mejoras del menú de configuración rápida.',
  },
  {
    id: 'widgets',
    title: 'Widgets',
    icon: 'applications-graphics-symbolic',
    summary: 'Widgets visuales para el escritorio',
    description: 'Widgets de escritorio: reloj, imagen, indicadores y controles multimedia.',
  },
  {
    id: 'topbar',
    title: 'Top Bar',
    icon: 'go-top-symbolic',
    summary: 'Personalización de la barra superior',
    description: 'Esquinas redondeadas, indicador de espacios, formato de fecha y notificaciones.',
  },
  {
    id: 'general',
    title: 'General',
    icon: 'emblem-system-symbolic',
    summary: 'Configuración general',
    description: 'Filtros de jugadores multimedia y otras opciones generales.',
  },
];

export default class LidsolWidgetsPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._window = window;

    for (const cat of CATEGORIES) {
      const page = this._buildPage(cat);
      page.title = cat.title;
      window.add(page);
    }

    window.set_default_size(550, 550);
  }

  _buildPage(cat) {
    const page = new Adw.PreferencesPage();
    page.set_name(cat.id);
    page.icon_name = cat.icon;

    const descGroup = new Adw.PreferencesGroup({
      title: cat.summary,
      description: cat.description,
    });
    page.add(descGroup);

    if (cat.id === 'shell') {
      this._addShellModuleGroup(page);
    }
    if (cat.id === 'quicksettings') {
      this._addQuicksettingsModuleGroup(page);
    }
    if (cat.id === 'widgets') {
      this._addWidgetsModuleGroup(page);
    }
    if (cat.id === 'topbar') {
      const prefs = new TopBarOrganizerPrefs(this._settings, this._window);
      prefs.populateCategoryPage(page);
      this._addTopbarModuleGroup(page);
    }
    if (cat.id === 'general') {
      this._addGeneralPage(page);
    }
    return page;
  }

  _addQuicksettingsModuleGroup(page) {
    const prefs = new QuickSettingsPrefs(this._settings, this._window);
    prefs.populateCategoryPage(page);
  }

  _addWidgetsModuleGroup(page) {
    const group = new Adw.PreferencesGroup({
      description: 'Activa o desactiva todos los widgets de escritorio. (testing)',
    });
    group.add(createSwitchRow({
      settings: this._settings,
      bindKey: 'background-widgets-enabled',
      title: 'Background Widgets',
      subtitle: 'Activar widgets de escritorio',
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'pw-enabled',
      title: 'Picture Widget',
      subtitle: 'Imagen superpuesta en el escritorio',
      onDetailed: () => this._openDialog('Picture Widget', p => this._buildPictureWidgetDialog(p)),
      sensitiveBind: 'background-widgets-enabled',
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'background-clock-enabled',
      title: 'Background Clock',
      subtitle: 'Reloj superpuesto en el escritorio',
      onDetailed: () => this._openDialog('Background Clock', p => this._buildBackgroundClockDialog(p)),
      sensitiveBind: 'background-widgets-enabled',
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'uadm-enabled',
      title: 'User Avatar (Date Menu)',
      subtitle: 'Avatar de usuario en el menú de fecha, sobre el calendario',
      onDetailed: () => this._openDialog('User Avatar (Date Menu)', p => this._buildUserAvatarDateMenuDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dmm-enabled',
      title: 'Date Menu Media',
      subtitle: 'Control multimedia en el menú de fecha, sobre el calendario',
      onDetailed: () => this._openDialog('Date Menu Media', p => this._buildDateMenuMediaDialog(p)),
    }));
    page.add(group);
  }

  _addTopbarModuleGroup(page) {
    // ── General ──
    const generalGroup = new Adw.PreferencesGroup({
      title: 'General',
      description: 'Organización y apariencia del panel.',
    });
    generalGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'panel-corners-enabled',
      title: 'Panel Corners',
      subtitle: 'Esquinas redondeadas en el panel y la pantalla',
      onDetailed: () => this._openDialog('Panel Corners', p => this._buildPanelCornersDialog(p)),
    }));
    page.add(generalGroup);

    // ── Elementos del panel ──
    const elementsGroup = new Adw.PreferencesGroup({
      title: 'Elementos del panel',
      description: 'Configuración de cada elemento en la barra superior.',
    });

    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'workspace-indicator-enabled',
      title: 'Workspace Indicator',
      subtitle: 'Indicador de espacios de trabajo estilo Space Bar',
      onDetailed: () => this._openDialog('Workspace Indicator', p => this._buildWorkspaceIndicatorDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'wb-enabled',
      title: 'Workspace Bar',
      subtitle: 'Barra de espacios con iconos de ventanas (estilo Space Bar)',
      onDetailed: () => this._openDialog('Workspace Bar', p => this._buildWorkspaceBarDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dm-enabled',
      title: 'Date Menu Tweaks',
      subtitle: 'Formato personalizado del reloj del panel con indicador multimedia',
      onDetailed: () => this._openDialog('Date Menu Tweaks', p => this._buildDateMenuDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'battery-indicator-enabled',
      title: 'Battery Indicator',
      subtitle: 'Círculo y/o barra personalizados para la batería en la barra superior',
      onDetailed: () => this._openDialog('Battery Indicator', p => this._buildBatteryIndicatorDialog(p)),
    }));
    page.add(elementsGroup);
  }

  _buildBatteryIndicatorDialog(page) {
    const s = this._settings;

    const mainGroup = new Adw.PreferencesGroup({
      title: 'Estilo',
      description: 'Configura el estilo del indicador de batería.',
    });
    const styleOptions = {
      'circle': 'Círculo',
      'bar': 'Barra',
      'both': 'Ambos',
    };
    mainGroup.add(createComboRow({
      settings: s, bindKey: 'bi-top-bar-style', title: 'Estilo', subtitle: 'Círculo, barra, o ambos', options: styleOptions,
    }));
    mainGroup.add(createSwitchRow({
      settings: s, bindKey: 'bi-show-percentage',
      title: 'Mostrar porcentaje', subtitle: 'Muestra el porcentaje junto al indicador',
    }));
    page.add(mainGroup);

    const barGroup = new Adw.PreferencesGroup({
      title: 'Barra',
      description: 'Configura la apariencia de la barra de batería.',
    });
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-width', title: 'Ancho', subtitle: 'Ancho en píxeles',
      adjProps: { lower: 20, upper: 300, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-height', title: 'Alto', subtitle: 'Alto en píxeles',
      adjProps: { lower: 4, upper: 40, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-radius', title: 'Redondeo', subtitle: 'Radio de borde en píxeles',
      adjProps: { lower: 0, upper: 20, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-low-threshold', title: 'Umbral bajo', subtitle: 'Porcentaje para activar el color de batería baja',
      adjProps: { lower: 0, upper: 100, step: 1 },
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-color', title: 'Color normal', subtitle: 'Vacío usa el color del tema',
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-charging-color', title: 'Color de carga', subtitle: 'Vacío usa el color del tema',
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-low-color', title: 'Color batería baja', subtitle: 'Vacío usa el color del tema',
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-bg-color', title: 'Color de fondo', subtitle: 'Vacío usa el color por defecto',
    }));
    page.add(barGroup);
  }

  _addGeneralPage(page) {
    const s = this._settings;

    const filterGroup = createGroup({
      parent: page,
      title: 'Filtro de jugadores multimedia',
      description: 'Controla qué reproductores multimedia aparecen en los widgets.',
    });

    const filterModel = new Gtk.StringList();
    filterModel.append('Desactivado');
    filterModel.append('Lista negra (excluir listados)');
    filterModel.append('Lista blanca (solo permitir listados)');

    const filterModeRow = new Adw.ComboRow({
      title: 'Modo de filtro',
      subtitle: 'Off = permitir todos, Lista negra = excluir los marcados, Lista blanca = solo permitir los marcados',
      model: filterModel,
      selected: s.get_int('player-filter-mode'),
    });
    filterModeRow.connect('notify::selected', () => {
      s.set_int('player-filter-mode', filterModeRow.selected);
    });
    filterGroup.add(filterModeRow);

    const headerBox = new Gtk.Box({ spacing: 4 });
    const refreshBtn = new Gtk.Button({
      icon_name: 'view-refresh-symbolic',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    });
    refreshBtn.tooltip_text = 'Actualizar lista de jugadores';
    headerBox.append(refreshBtn);
    filterGroup.header_suffix = headerBox;

    const switchRows = new Map();
    const playerRows = [];

    const getFilterList = () => {
      try {
        return s.get_string('player-filter-list')
          .split(',').map(v => v.trim()).filter(v => v.length > 0);
      } catch { return []; }
    };

    const saveFilterList = (list) => {
      s.set_string('player-filter-list', list.join(', '));
    };

    const isPlayerEnabled = (name) => getFilterList().includes(name);

    const togglePlayer = (name, enabled) => {
      const list = getFilterList();
      const idx = list.indexOf(name);
      if (enabled && idx === -1)
        list.push(name);
      else if (!enabled && idx !== -1)
        list.splice(idx, 1);
      saveFilterList(list);
    };

    const rebuildPlayers = () => {
      for (const row of playerRows)
        filterGroup.remove(row);
      playerRows.length = 0;
      switchRows.clear();

      const connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);
      connection.call(
        'org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'ListNames',
        null, null, Gio.DBusCallFlags.NONE, -1, null,
        (c, res) => {
          try {
            const r = c.call_finish(res);
            const names = r.deep_unpack()[0];
            const mpris = names.filter(n => n.startsWith('org.mpris.MediaPlayer2.'));
            const detected = [...new Set(mpris.map(n =>
              n.replace('org.mpris.MediaPlayer2.', '').split('.')[0]
            ))];

            const filterList = getFilterList();
            const configured = filterList.filter(name => !detected.includes(name));
            const all = [...detected, ...configured];

            const filterActive = s.get_int('player-filter-mode') !== 0;

            if (all.length === 0) {
              const emptyRow = new Adw.ActionRow({
                title: 'Sin jugadores detectados',
                activatable: false,
              });
              emptyRow.set_opacity(0.5);
              filterGroup.add(emptyRow);
              playerRows.push(emptyRow);
              return;
            }

            for (const name of all) {
              const isDetected = detected.includes(name);
              const sw = new Gtk.Switch({
                active: isPlayerEnabled(name),
                valign: Gtk.Align.CENTER,
                sensitive: filterActive,
              });
              sw.connect('notify::active', () => {
                togglePlayer(name, sw.active);
              });

              const row = new Adw.ActionRow({
                title: name,
                subtitle: isDetected ? 'Activo' : 'No detectado',
                activatable: false,
              });
              row.add_suffix(sw);

              if (!isDetected)
                row.set_opacity(0.5);

              switchRows.set(name, { row, sw });
              filterGroup.add(row);
              playerRows.push(row);
            }
          } catch (e) { /* ignore */ }
        }
      );
    };

    const updateAllSensitive = () => {
      const active = s.get_int('player-filter-mode') !== 0;
      for (const [, { sw }] of switchRows)
        sw.set_sensitive(active);
    };

    s.connect('changed::player-filter-mode', () => {
      updateAllSensitive();
    });
    refreshBtn.connect('clicked', rebuildPlayers);
    rebuildPlayers();
  }

  _addShellModuleGroup(page) {
    const group = new Adw.PreferencesGroup();
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dashboard-enabled',
      title: 'Dashboard',
      subtitle: 'Panel con widgets generales',
      onDetailed: () => this._openDialog('Dashboard', p => this._buildDashboardDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qt-enabled',
      title: 'Quick Text',
      subtitle: 'Captura rápida de notas con atajo de teclado',
      onDetailed: () => this._openDialog('Quick Text', p => this._buildQuickTextDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'launcher-enabled',
      title: 'Launcher',
      subtitle: 'Atajo para abrir la búsqueda del Overview (modo búsqueda)',
      onDetailed: () => this._openDialog('Launcher', p => this._buildLauncherDialog(p)),
    }));
    page.add(group);
  }

  _openDialog(title, buildFn) {
    const window = this._getWindow();
    createDialog({
      window,
      title,
      childrenRequest: (page, dialog) => buildFn(page, dialog),
    });
  }

  _getWindow() { return this._window; }

  // ═══ DIALOG BUILDERS ═══

  _buildPanelCornersDialog(page) {
    const s = this._settings;
    const panelGroup = createGroup({ parent: page, title: 'Panel Corners', description: 'Esquinas redondeadas en la parte inferior del panel' });
    this._addEnableSubSwitch(panelGroup, s, 'panel-corners', 'Activar Panel Corners');
    panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-radius', title: 'Radio', subtitle: 'Recomendado: 12px', adjProps: { lower: 0, upper: 25 } }));
    panelGroup.add(createColorButtonRow({ settings: s, bindKey: 'panel-corner-background-color', title: 'Color', subtitle: 'Recomendado: negro' }));
    panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-opacity', title: 'Opacidad', adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
    const screenGroup = createGroup({ parent: page, title: 'Screen Corners', description: 'Esquinas redondeadas alrededor de la pantalla' });
    this._addEnableSubSwitch(screenGroup, s, 'screen-corners', 'Activar Screen Corners');
    screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-radius', title: 'Radio', subtitle: 'Recomendado: 12px', adjProps: { lower: 0, upper: 25 } }));
    screenGroup.add(createColorButtonRow({ settings: s, bindKey: 'screen-corner-background-color', title: 'Color' }));
    screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-opacity', title: 'Opacidad', adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
    const advGroup = createGroup({ parent: page, title: 'Opciones avanzadas' });
    advGroup.add(createSwitchRow({ settings: s, bindKey: 'force-extension-values', title: 'Forzar valores de la extensión', subtitle: 'Sobreescribe las preferencias del tema actual' }));
  }

  _buildWorkspaceIndicatorDialog(page) {
    const prefs = new WorkspaceIndicatorPrefs(this._settings);
    prefs.populateGroups(page);
  }

  _buildWorkspaceBarDialog(page) {
    const prefs = new WorkspacePrefs(this._settings);
    prefs.populateGroups(page);
  }

  _buildPictureWidgetDialog(page) {
    const s = this._settings;

    const pathGroup = createGroup({ parent: page, title: 'Imagen', description: 'Carpeta con imágenes para mostrar en el escritorio. Se elige una imagen aleatoria.' });
    const folderRow = new Adw.ActionRow({ title: 'Carpeta de imágenes', subtitle: s.get_string('pw-image-path') || 'Sin carpeta seleccionada' });
    const folderBtn = new Gtk.Button({ label: 'Examinar', valign: Gtk.Align.CENTER });
    folderBtn.connect('clicked', () => {
      const dialog = new Gtk.FileChooserDialog({
        title: 'Seleccionar carpeta de imágenes',
        transient_for: page.get_root(),
        modal: true,
        action: Gtk.FileChooserAction.SELECT_FOLDER,
      });
      dialog.add_button('_Cancelar', Gtk.ResponseType.CANCEL);
      dialog.add_button('_Abrir', Gtk.ResponseType.OK);
      dialog.connect('response', (dlg, response) => {
        if (response === Gtk.ResponseType.OK) {
          const path = dlg.get_file().get_path();
          s.set_string('pw-image-path', path);
          folderRow.set_subtitle(path);
        }
        dlg.destroy();
      });
      dialog.present();
    });
    folderRow.add_suffix(folderBtn);
    folderRow.activatable_widget = folderBtn;
    pathGroup.add(folderRow);

    const sizeGroup = createGroup({ parent: page, title: 'Tamaño' });
    sizeGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-size', title: 'Tamaño base', subtitle: 'Se combina con el aspect ratio', adjProps: { lower: 10, upper: 2000, step: 10 } }));
    sizeGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-aspect-ratio', title: 'Relación de aspecto', subtitle: 'Ancho / Alto (1.0 = cuadrado)', adjProps: { lower: 0.1, upper: 10, step: 0.1, digits: 2 } }));

    const posGroup = createGroup({ parent: page, title: 'Posición' });
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-position-x', title: 'Posición X', subtitle: 'Píxeles desde el borde izquierdo', adjProps: { lower: 0, upper: 10000, step: 5 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-position-y', title: 'Posición Y', subtitle: 'Píxeles desde el borde superior', adjProps: { lower: 0, upper: 10000, step: 5 } }));

    const appearGroup = createGroup({ parent: page, title: 'Apariencia' });
    appearGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-corner-radius', title: 'Radio de esquina', subtitle: 'Porcentaje (0 = sin bordes redondeados)', adjProps: { lower: 0, upper: 100, step: 5 } }));

    const advGroup = createGroup({ parent: page, title: 'Avanzado' });
    advGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-refresh-interval', title: 'Intervalo de rotación', subtitle: 'Segundos (0 = sin cambio automático)', adjProps: { lower: 0, upper: 86400, step: 10 } }));
  }

  _buildBackgroundClockDialog(page) {
    const s = this._settings;
    const posGroup = createGroup({ parent: page, title: 'Posición' });
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-position', title: 'Posición', subtitle: '0=sup-izq … 8=inf-der', adjProps: { lower: 0, upper: 8 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-x-offset', title: 'Desplazamiento horizontal', adjProps: { lower: -500, upper: 500 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-y-offset', title: 'Desplazamiento vertical', adjProps: { lower: -500, upper: 500 } }));
    const clockGroup = createGroup({ parent: page, title: 'Hora' });
    this._addEnableSubSwitch(clockGroup, s, 'background-clock-enable-clock', 'Mostrar hora');
    clockGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-clock-format', title: 'Formato', subtitle: '%H:%M (24h) o %I:%M %p (12h)' }));
    clockGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-clock-size', title: 'Tamaño', subtitle: 'Tamaño de fuente en puntos', adjProps: { lower: 8, upper: 200, step: 2 } }));
    clockGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-clock-color', title: 'Color' }));
    this._addFontToggleRow(clockGroup, s, 'background-clock-clock-custom-font', 'background-clock-clock-font', 'Fuente personalizada');
    const dateGroup = createGroup({ parent: page, title: 'Fecha' });
    this._addEnableSubSwitch(dateGroup, s, 'background-clock-enable-date', 'Mostrar fecha');
    dateGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-date-format', title: 'Formato', subtitle: '%A, %d de %B' }));
    dateGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-date-size', title: 'Tamaño', adjProps: { lower: 8, upper: 200, step: 2 } }));
    dateGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-date-color', title: 'Color' }));
    this._addFontToggleRow(dateGroup, s, 'background-clock-date-custom-font', 'background-clock-date-font', 'Fuente personalizada');
    const bgGroup = createGroup({ parent: page, title: 'Contenedor', description: 'Estilo del fondo del reloj' });
    bgGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-bg-color', title: 'Color de fondo', subtitle: 'Usa alpha para fondo semitransparente', useAlpha: true }));
    bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-padding', title: 'Padding', adjProps: { lower: 0, upper: 100, step: 2 } }));
    bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-border-radius', title: 'Radio del borde', adjProps: { lower: 0, upper: 50 } }));
  }

  _buildQuickTextDialog(page) {
    const s = this._settings;
    const group = createGroup({ parent: page, title: 'Quick Text', description: 'Captura rápida de notas mediante atajo de teclado' });
    const hotkeyRow = new Adw.ActionRow({ title: 'Atajo de teclado', subtitle: 'Combinación para abrir el diálogo de notas' });
    const hotkeyLabel = new Gtk.ShortcutLabel({
      accelerator: s.get_strv('qt-hotkey')[0] ?? null,
      valign: Gtk.Align.CENTER,
    });
    const hotkeyBtn = new Gtk.Button({ label: 'Establecer atajo', valign: Gtk.Align.CENTER });
    hotkeyBtn.connect('clicked', () => {
      const dialog = new Gtk.Dialog({
        title: 'Establecer atajo',
        modal: true,
        useHeaderBar: 1,
        transientFor: page.get_root(),
        widthRequest: 400,
        heightRequest: 200,
      });
      const box = new Gtk.Box({
        marginBottom: 12, marginEnd: 12, marginStart: 12, marginTop: 12,
        orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER,
      });
      box.append(new Gtk.Label({ label: 'Introduce una combinación de teclas:', marginBottom: 12 }));
      box.append(new Gtk.Label({
        label: 'Esc para cancelar, Retroceso para desactivar',
        css_classes: ['dim-label'],
      }));
      dialog.set_child(box);
      const keyCtrl = new Gtk.EventControllerKey({ propagationPhase: Gtk.PropagationPhase.CAPTURE });
      dialog.add_controller(keyCtrl);
      keyCtrl.connect('key-pressed', (_, keyval, _keycode, modifier) => {
        modifier = modifier & ~64 & ~16;
        if (!Gtk.accelerator_valid(keyval, modifier)) return Gdk.EVENT_STOP;
        if (keyval === Gdk.KEY_Escape) { dialog.close(); return Gdk.EVENT_STOP; }
        if (keyval === Gdk.KEY_BackSpace && !modifier) {
          s.set_strv('qt-hotkey', []);
          hotkeyLabel.accelerator = null;
          dialog.close(); return Gdk.EVENT_STOP;
        }
        const accel = Gtk.accelerator_name(keyval, modifier);
        s.set_strv('qt-hotkey', [accel]);
        hotkeyLabel.accelerator = accel;
        dialog.close(); return Gdk.EVENT_STOP;
      });
      dialog.present();
    });
    hotkeyRow.add_suffix(hotkeyLabel);
    hotkeyRow.add_suffix(hotkeyBtn);
    group.add(hotkeyRow);
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-multiline', title: 'Entrada de una sola línea', subtitle: 'Si está activo, Enter guarda la nota directamente' }));
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-hideacted', title: 'Ocultar notas procesadas', subtitle: 'Oculta notas marcadas como procesadas en la ventana de acciones' }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-filepath', title: 'Archivo de notas', subtitle: 'Ruta absoluta al archivo de texto' }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-prepend', title: 'Prefijo', subtitle: 'Texto antes de cada nota (vacío = fecha actual)' }));
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-linebreak', title: 'Salto de línea', subtitle: 'Añade un salto de línea después del prefijo.\nSi está desactivado, el prefijo y la nota van en la misma línea.' }));
    const appendRow = createEntryRow({ settings: s, bindKey: 'qt-append', title: 'Separador', subtitle: 'Texto que separa las notas en el archivo' });
    const updateAppendSensitive = () => {
      const enabled = s.get_boolean('qt-append-enabled');
      appendRow.sensitive = enabled;
      appendRow.set_opacity(enabled ? 1.0 : 0.5);
    };
    s.connect('changed::qt-append-enabled', updateAppendSensitive);
    updateAppendSensitive();
    group.add(createSwitchRow({
      settings: s,
      bindKey: 'qt-append-enabled',
      title: 'Separador',
      subtitle: 'Añade un separador entre notas. Si está vacío, deja una línea extra',
    }));
    group.add(appendRow);
  }

  _buildDashboardDialog(page) {
    const s = this._settings;

    const _alignModel = new Gtk.StringList({ strings: ['Fill', 'Start', 'Center', 'End'] });


    function _makeAlignRow(title, bindKey) {
      const row = new Adw.ComboRow({
        title,
        model: _alignModel,
        selected: s.get_int(bindKey),
      });
      row.connect('notify::selected', () => s.set_int(bindKey, row.selected));
      s.connect(`changed::${bindKey}`, () => { row.selected = s.get_int(bindKey); });
      return row;
    }

    function _makeExpandRow(title, bindKey) {
      const row = new Adw.SwitchRow({
        title,
        active: s.get_boolean(bindKey),
      });
      s.bind(bindKey, row, 'active', Gio.SettingsBindFlags.DEFAULT);
      return row;
    }

    function _makeSpinRow(title, bindKey, low, high, step) {
      const adj = new Gtk.Adjustment({ lower: low, upper: high, step_increment: step });
      const spin = new Gtk.SpinButton({ adjustment: adj, numeric: true, valign: Gtk.Align.CENTER });
      s.bind(bindKey, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
      const row = new Adw.ActionRow({ title, activatable_widget: spin });
      row.add_suffix(spin);
      return row;
    }

    function _makeWidgetExpander(name, title, extraRows) {
      const prefix = `dashboard-${name}`;
      const expander = new Adw.ExpanderRow({ title });
      expander.add_row(_makeExpandRow('Background', `${prefix}-background`));
      if (extraRows) extraRows(expander);
      return expander;
    }

    // ── Dash group ──
    const dashGroup = new Adw.PreferencesGroup({ title: 'Dash' });

    const shortcutRow = new Adw.ActionRow({ title: 'Shortcut Hotkey' });
    const shortcutLabel = new Gtk.ShortcutLabel({
      accelerator: s.get_strv('dashboard-shortcut')[0] ?? null,
      valign: Gtk.Align.CENTER,
    });
    const shortcutBtn = new Gtk.Button({ label: 'Set Hotkey', valign: Gtk.Align.CENTER });
    shortcutBtn.connect('clicked', () => {
      const dialog = new Gtk.Dialog({
        title: 'Set Hotkey',
        modal: true,
        useHeaderBar: 1,
        transientFor: page.get_root(),
        widthRequest: 400,
        heightRequest: 200,
      });
      const box = new Gtk.Box({
        marginBottom: 12, marginEnd: 12, marginStart: 12, marginTop: 12,
        orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER,
      });
      box.append(new Gtk.Label({ label: 'Press a key combination:', marginBottom: 12 }));
      box.append(new Gtk.Label({
        label: 'Esc to cancel, Backspace to disable',
        css_classes: ['dim-label'],
      }));
      dialog.set_child(box);
      const keyCtrl = new Gtk.EventControllerKey({ propagationPhase: Gtk.PropagationPhase.CAPTURE });
      dialog.add_controller(keyCtrl);
      keyCtrl.connect('key-pressed', (_, keyval, _keycode, modifier) => {
        modifier = modifier & ~64 & ~16;
        if (!Gtk.accelerator_valid(keyval, modifier)) return Gdk.EVENT_STOP;
        if (keyval === Gdk.KEY_Escape) { dialog.close(); return Gdk.EVENT_STOP; }
        if (keyval === Gdk.KEY_BackSpace && !modifier) {
          s.set_strv('dashboard-shortcut', []);
          shortcutLabel.accelerator = null;
          dialog.close(); return Gdk.EVENT_STOP;
        }
        const accel = Gtk.accelerator_name(keyval, modifier);
        s.set_strv('dashboard-shortcut', [accel]);
        shortcutLabel.accelerator = accel;
        dialog.close(); return Gdk.EVENT_STOP;
      });
      dialog.present();
    });
    shortcutRow.add_suffix(shortcutLabel);
    shortcutRow.add_suffix(shortcutBtn);
    dashGroup.add(shortcutRow);

    dashGroup.add(_makeAlignRow('X Align', 'dashboard-x-align'));
    dashGroup.add(_makeAlignRow('Y Align', 'dashboard-y-align'));
    dashGroup.add(_makeSpinRow('X Offset', 'dashboard-x-offset', -1000, 1000, 10));
    dashGroup.add(_makeSpinRow('Y Offset', 'dashboard-y-offset', -1000, 1000, 10));
    dashGroup.add(_makeExpandRow('Darken Background', 'dashboard-darken'));
    dashGroup.add(_makeExpandRow('Transparent Container', 'dashboard-container-transparent'));
    dashGroup.add(_makeSpinRow('Container Scale (%)', 'dashboard-dialog-scale', 50, 150, 5));
    page.add(dashGroup);

    // ── Grid group ──
    const gridGroup = new Adw.PreferencesGroup({ title: 'Grid Layout' });
    gridGroup.add(_makeSpinRow('Spacing', 'dashboard-grid-spacing', 0, 60, 1));
    gridGroup.add(_makeSpinRow('Columns', 'dashboard-grid-columns', 1, 6, 1));

    const resetLayoutRow = new Adw.ActionRow({
      title: 'Reset Layout',
      subtitle: 'Restore the default grid layout',
    });
    const resetLayoutBtn = new Gtk.Button({ label: 'Reset', valign: Gtk.Align.CENTER });
    resetLayoutBtn.connect('clicked', () => {
      s.reset('dashboard-layout-json');
    });
    resetLayoutRow.add_suffix(resetLayoutBtn);
    gridGroup.add(resetLayoutRow);
    page.add(gridGroup);

    // ── Widgets group ──
    const widgetsGroup = new Adw.PreferencesGroup({ title: 'Widgets' });
    page.add(widgetsGroup);

    widgetsGroup.add(_makeWidgetExpander('user', 'User', exp => {
      exp.add_row(_makeSpinRow('Icon Roundness', 'dashboard-user-icon-roundness', 1, 99, 1));
      exp.add_row(_makeSpinRow('Icon Width', 'dashboard-user-icon-width', 10, 150, 2));
      exp.add_row(_makeSpinRow('Icon Height', 'dashboard-user-icon-height', 10, 150, 2));
      exp.add_row(_makeSpinRow('Text Spacing', 'dashboard-user-text-spacing', 0, 80, 1));
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-user-vertical'));
      exp.add_row(_makeExpandRow('Show User Name', 'dashboard-user-real-name'));
    }));

    widgetsGroup.add(_makeWidgetExpander('levels', 'System Levels', exp => {
      exp.add_row(_makeSpinRow('Width', 'dashboard-levels-fixed-width', 300, 530, 5));
      exp.add_row(_makeExpandRow('Show Battery', 'dashboard-levels-show-battery'));
      exp.add_row(_makeExpandRow('Show Storage', 'dashboard-levels-show-storage'));
      exp.add_row(_makeExpandRow('Show CPU', 'dashboard-levels-show-cpu'));
      exp.add_row(_makeExpandRow('Show RAM', 'dashboard-levels-show-ram'));
      exp.add_row(_makeExpandRow('Show Temperature', 'dashboard-levels-show-temp'));

      const commandEntry = new Gtk.Entry({
        text: s.get_string('dashboard-levels-command'),
        valign: Gtk.Align.CENTER,
      });
      const cf = new Gtk.EventControllerFocus();
      cf.connect('leave', () => s.set_string('dashboard-levels-command', commandEntry.get_buffer().text));
      commandEntry.add_controller(cf);
      const commandRow = new Adw.ActionRow({ title: 'Command', activatable_widget: commandEntry });
      commandRow.add_suffix(commandEntry);
      exp.add_row(commandRow);
    }));

    widgetsGroup.add(_makeWidgetExpander('media', 'Media Player', exp => {
      const preferEntry = new Gtk.Entry({ text: s.get_string('dashboard-media-prefer'), valign: Gtk.Align.CENTER });
      const pf = new Gtk.EventControllerFocus();
      pf.connect('leave', () => s.set_string('dashboard-media-prefer', preferEntry.get_buffer().text));
      preferEntry.add_controller(pf);
      const preferRow = new Adw.ActionRow({ title: 'Prefer', activatable_widget: preferEntry });
      preferRow.add_suffix(preferEntry);
      exp.add_row(preferRow);

      const styleModel = new Gtk.StringList({ strings: ['Normal Vertical', 'Normal Horizontal', 'Full'] });
      const styleRow = new Adw.ComboRow({ title: 'Style', model: styleModel, selected: s.get_int('dashboard-media-style') });
      styleRow.connect('notify::selected', () => s.set_int('dashboard-media-style', styleRow.selected));
      exp.add_row(styleRow);

      exp.add_row(_makeSpinRow('Cover Width', 'dashboard-media-cover-width', 100, 800, 5));
      exp.add_row(_makeSpinRow('Cover Height', 'dashboard-media-cover-height', 100, 800, 5));
      exp.add_row(_makeSpinRow('Cover Roundness', 'dashboard-media-cover-roundness', 0, 48, 1));
      exp.add_row(_makeExpandRow('Fade', 'dashboard-media-fade'));
      exp.add_row(_makeExpandRow('Show Text', 'dashboard-media-show-text'));

      exp.add_row(_makeExpandRow('Show Loop and Shuffle', 'dashboard-media-show-loop-shuffle'));
    }));

    widgetsGroup.add(_makeWidgetExpander('clock', 'Clock', exp => {
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-clock-vertical'));
      exp.add_row(_makeSpinRow('Time Size', 'dashboard-clock-clock-size', 8, 200, 2));
      exp.add_row(_makeSpinRow('Date Size', 'dashboard-clock-date-size', 8, 100, 1));
      exp.add_row(_makeSpinRow('Spacing', 'dashboard-clock-spacing', 0, 50, 1));
    }));

    widgetsGroup.add(_makeWidgetExpander('apps', 'App Launcher', exp => {
      exp.add_row(_makeSpinRow('Rows', 'dashboard-apps-rows', 1, 6, 1));
      exp.add_row(_makeSpinRow('Columns', 'dashboard-apps-cols', 1, 6, 1));
      exp.add_row(_makeSpinRow('Icon Size', 'dashboard-apps-icon-size', 4, 100, 2));
    }));

    widgetsGroup.add(_makeWidgetExpander('system', 'Settings &amp; System', exp => {
      const layoutModel = new Gtk.StringList({ strings: ['Stacked', 'Side by Side'] });
      const layoutRow = new Adw.ComboRow({ title: 'Layout', subtitle: 'Stacked: two rows (current behavior).\nSide by Side: single row.', model: layoutModel, selected: s.get_int('dashboard-system-layout') });
      layoutRow.connect('notify::selected', () => s.set_int('dashboard-system-layout', layoutRow.selected));
      exp.add_row(layoutRow);
      exp.add_row(_makeSpinRow('Icon Size', 'dashboard-system-icon-size', 4, 100, 2));
    }));
  }

  _buildUserAvatarDateMenuDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: 'User Avatar (Date Menu)', description: 'Muestra avatar y nombre de usuario en el menú de fecha, sobre el calendario.' });
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-enabled', title: 'Habilitar avatar en el menú de fecha' }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-show-realname', title: 'Mostrar nombre real' }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-show-username', title: 'Mostrar nombre de usuario' }));
  }

  _buildDateMenuMediaDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: 'Date Menu Media', description: 'Widget de control multimedia en el menú de fecha, sobre el calendario.' });
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-enabled', title: 'Habilitar widget multimedia' }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'nm-enabled', title: 'Ocultar indicadores multimedia nativos', subtitle: 'Oculta los controles multimedia nativos de las notificaciones, dentro del menú de fecha' }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-auto-switch', title: 'Cambiar automáticamente al último medio reproduciéndose', subtitle: 'Siempre muestra el medio activo, incluso por sobre la selección manual' }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-art', title: 'Mostrar carátula del álbum' }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-art-size', title: 'Tamaño de carátula', adjProps: { lower: 31, upper: 110, step: 1 } }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-album-roundness', title: 'Redondeo de carátula', subtitle: 'Redondeo de bordes de la carátula (1-99 píxeles)', adjProps: { lower: 1, upper: 99, step: 1 } }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-compact', title: 'Modo compacto', subtitle: 'Reduce el espacio del widget' }));

    const controlsGroup = createGroup({ parent: page, title: 'Controles', description: 'Visibilidad y apariencia de los botones de control multimedia.' });
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-prev', title: 'Mostrar botón anterior' }));
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-pause', title: 'Mostrar botón pausa/reproducir' }));
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-next', title: 'Mostrar botón siguiente' }));
    controlsGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-control-opacity', title: 'Opacidad de controles', adjProps: { lower: 0, upper: 255, step: 5 } }));

    const progressGroup = createGroup({ parent: page, title: 'Barra de progreso', description: 'Configuración de la barra de progreso con tiempo transcurrido.' });
    progressGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-progress-enabled', title: 'Mostrar barra de progreso' }));
    const styleModel = new Gtk.StringList({ strings: ['slim', 'default'] });
    const styleRow = new Adw.ComboRow({ title: 'Estilo', subtitle: 'Estilo de la barra de progreso', model: styleModel, selected: s.get_string('dmm-progress-style') === 'default' ? 1 : 0 });
    styleRow.connect('notify::selected', () => {
      s.set_string('dmm-progress-style', styleRow.selected === 1 ? 'default' : 'slim');
    });
    progressGroup.add(styleRow);
    progressGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-slider-handle-radius', title: 'Radio del asa', subtitle: '0 = ocultar asa', adjProps: { lower: 0, upper: 20, step: 1 } }));
    progressGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-slider-bar-height', title: 'Altura de la barra', adjProps: { lower: 2, upper: 20, step: 1 } }));
    progressGroup.add(createEntryRow({ settings: s, bindKey: 'dmm-slider-active-color', title: 'Color activo', subtitle: 'Color CSS o vacío para usar el acento del tema' }));
    progressGroup.add(createEntryRow({ settings: s, bindKey: 'dmm-slider-background-color', title: 'Color de fondo', subtitle: 'Color CSS de la parte inactiva' }));

    const gradientGroup = createGroup({ parent: page, title: 'Gradiente desde carátula', description: 'Extrae el color dominante de la carátula y lo aplica como fondo gradiente.' });
    gradientGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-gradient-enabled', title: 'Habilitar gradiente' }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-start-opaque', title: 'Opacidad inicial', adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-start-mix', title: 'Mezcla inicial', subtitle: 'Qué tanto del color extraído se mezcla al inicio (0-1000)', adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-end-opaque', title: 'Opacidad final', adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-end-mix', title: 'Mezcla final', subtitle: 'Qué tanto del color extraído se mezcla al final (0-1000)', adjProps: { lower: 0, upper: 1000, step: 50 } }));

    const roundGroup = createGroup({ parent: page, title: 'Clip redondeado', description: 'Recorta las esquinas del widget multimedia.' });
    roundGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-round-clip-enabled', title: 'Habilitar clip redondeado' }));
    roundGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-round-clip-radius', title: 'Radio de esquina', adjProps: { lower: 0, upper: 48, step: 1 } }));
  }

  _buildLauncherDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: 'Launcher', description: 'Abre la búsqueda nativa del Overview (modo búsqueda) con un atajo de teclado.' });
    mainGroup.add(createKeyboardShortcutRow({ settings: s, bindKey: 'launcher-hotkey', title: 'Atajo de teclado', subtitle: 'Combinación para abrir la búsqueda del Overview (modo búsqueda)' }));
    const overviewGroup = createGroup({ parent: page, title: 'Overview', description: 'Ajustes relacionados con la vista general' });
    overviewGroup.add(createSwitchRow({ settings: s, bindKey: 'launcher-hide-search', title: 'Ocultar barra de búsqueda', subtitle: 'Oculta el campo "Type to search" en el Overview. Aparece al empezar a escribir.' }));

    const cmdGroup = createGroup({ parent: page, title: 'Comandos', description: 'Comandos ejecutables desde la búsqueda escribiendo ":nombre"' });
    const addBtn = new Gtk.Button({ label: 'Añadir' });
    addBtn.connect('clicked', () => this._addLauncherCommandDialog(s, cmdList, null));
    cmdGroup.set_header_suffix(addBtn);
    const cmdList = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
    cmdGroup.add(cmdList);
    this._populateLauncherCommands(cmdList, s);
  }

  _parseLauncherCommand(entry) {
    const parts = entry.split('|');
    const name = parts[0].trim();
    if (!name)
      return null;
    let command;
    let icon = '';
    if (parts.length >= 3) {
      icon = parts[parts.length - 1].trim();
      command = parts.slice(1, -1).join('|').trim();
    } else {
      command = parts[1] ? parts[1].trim() : '';
    }
    if (!command)
      return null;
    return { name, command, icon };
  }

  _serializeLauncherCommand(name, command, icon) {
    const iconPart = icon && icon.trim() ? icon.trim() : '';
    return `${name.trim()}|${command.trim()}|${iconPart}`;
  }

  _populateLauncherCommands(listBox, s) {
    while (listBox.get_first_child())
      listBox.remove(listBox.get_first_child());

    const entries = s.get_strv('launcher-commands') || [];
    entries.forEach((entry, index) => {
      let name = entry;
      let icon = '';
      const parsed = this._parseLauncherCommand(entry);
      if (parsed) {
        name = parsed.name;
        icon = parsed.icon;
      }

      const row = new Gtk.ListBoxRow();
      const box = new Gtk.Box({ spacing: 12, margin_start: 8, margin_end: 8, margin_top: 6, margin_bottom: 6 });
      const iconImage = Gtk.Image.new_from_icon_name(icon || 'utilities-terminal-symbolic');
      iconImage.pixel_size = 20;
      iconImage.valign = Gtk.Align.CENTER;
      box.append(iconImage);
      const labels = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
      const nameLabel = new Gtk.Label({ label: `:${name}`, xalign: 0, halign: Gtk.Align.START });
      nameLabel.add_css_class('title-4');
      const cmdLabel = new Gtk.Label({ label: parsed ? parsed.command : '', xalign: 0, halign: Gtk.Align.START, ellipsize: Pango.EllipsizeMode.MIDDLE });
      cmdLabel.add_css_class('dim-label');
      labels.append(nameLabel);
      labels.append(cmdLabel);
      box.append(labels);
      const editBtn = new Gtk.Button({ icon_name: 'document-edit-symbolic', css_classes: ['flat'], valign: Gtk.Align.CENTER, tooltip_text: 'Editar' });
      editBtn.connect('clicked', () => this._addLauncherCommandDialog(s, listBox, index));
      box.append(editBtn);
      const delBtn = new Gtk.Button({ icon_name: 'user-trash-symbolic', css_classes: ['flat', 'error'], valign: Gtk.Align.CENTER, tooltip_text: 'Eliminar' });
      delBtn.connect('clicked', () => {
        const next = s.get_strv('launcher-commands') || [];
        next.splice(index, 1);
        s.set_strv('launcher-commands', next);
        this._populateLauncherCommands(listBox, s);
      });
      box.append(delBtn);
      row.set_child(box);
      listBox.append(row);
    });
  }

  _addLauncherCommandDialog(s, listBox, editIndex) {
    const isEdit = editIndex !== null && editIndex !== undefined;
    const commands = s.get_strv('launcher-commands') || [];
    const existing = isEdit ? this._parseLauncherCommand(commands[editIndex] || '') : null;

    const dialog = new Adw.MessageDialog({
      heading: isEdit ? 'Editar comando' : 'Añadir comando',
      body: 'Al escribir ":$nombre" en la búsqueda se ejecutará el comando.',
      modal: true,
      transient_for: this._getWindow(),
    });

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 8 });
    const nameEntry = new Gtk.Entry({ placeholder_text: 'Nombre (sin ":")', text: existing ? existing.name : '' });
    const cmdEntry = new Gtk.Entry({ placeholder_text: 'Comando de bash (ej: notify-send "Hola")', text: existing ? existing.command : '' });

    const iconRow = new Adw.ActionRow({ title: 'Icono', subtitle: 'Nombre del icono simbólico (vacío = predeterminado)' });
    const iconBox = new Gtk.Box({ spacing: 14, valign: Gtk.Align.CENTER });
    const iconPreview = Gtk.Image.new_from_icon_name((existing && existing.icon) || 'utilities-terminal-symbolic');
    iconPreview.pixel_size = 20;
    const iconEntry = new Gtk.Entry({ text: existing ? existing.icon : '', valign: Gtk.Align.CENTER, hexpand: true });
    iconEntry.connect('changed', () => {
      iconPreview.icon_name = iconEntry.get_text().trim() || 'utilities-terminal-symbolic';
    });
    iconBox.append(iconPreview);
    iconBox.append(iconEntry);
    iconRow.add_suffix(iconBox);
    iconRow.activatable_widget = iconEntry;
    const iconRefLink = new Gtk.LinkButton({
      uri: 'https://gitlab.gnome.org/GNOME/adwaita-icon-theme/-/tree/master/Adwaita/symbolic',
      label: 'Más iconos',
      valign: Gtk.Align.CENTER,
    });
    const iconRefRow = new Adw.ActionRow({
      title: 'Sugerencias',
      subtitle: 'utilities-terminal-symbolic, system-search-symbolic, starred-symbolic, audio-headphones-symbolic, …',
    });
    iconRefRow.add_suffix(iconRefLink);

    content.append(nameEntry);
    content.append(cmdEntry);
    content.append(iconRow);
    content.append(iconRefRow);
    dialog.set_extra_child(content);

    const saveResponse = 'save';
    dialog.add_response('cancel', 'Cancelar');
    dialog.add_response(saveResponse, isEdit ? 'Guardar' : 'Añadir');
    dialog.set_response_appearance(saveResponse, Adw.ResponseAppearance.SUGGESTED);
    dialog.set_default_response(saveResponse);
    dialog.connect('response', (_dlg, response) => {
      if (response !== saveResponse) {
        dialog.close();
        return;
      }
      const name = nameEntry.get_text().trim();
      const command = cmdEntry.get_text().trim();
      if (name && command) {
        const next = s.get_strv('launcher-commands') || [];
        const serialized = this._serializeLauncherCommand(name, command, iconEntry.get_text());
        if (isEdit)
          next[editIndex] = serialized;
        else
          next.push(serialized);
        s.set_strv('launcher-commands', next);
        this._populateLauncherCommands(listBox, s);
      }
      dialog.close();
    });
    dialog.present(this._getWindow());
  }

  _buildDateMenuDialog(page) {
    const s = this._settings;

    // ── Formatos ──────────────────────────────────────────────────
    const formatGroup = createGroup({
      parent: page,
      title: 'Formatos',
      description: 'Personaliza el formato del reloj en el panel.',
    });
    formatGroup.add(createEntryRow({
      settings: s,
      bindKey: 'dm-format',
      title: 'Formato de fecha y hora',
      subtitle: 'Ej: %B %d, %I:%M:%S %p',
    }));

    const completeFormatRow = createEntryRow({
      settings: s,
      bindKey: 'dm-complete-format',
      title: 'Date menu + Media',
      subtitle: 'Formato para el modo Multimedia + Reloj\n(máx 10 caracteres)',
    });
    completeFormatRow.activatable_widget.max_length = 10;

    const updateCompleteSensitive = () => {
      const showMedia = s.get_boolean('dm-show-media');
      completeFormatRow.sensitive = showMedia && s.get_int('dm-media-layout') === 2;
    };
    s.connect('changed::dm-media-layout', updateCompleteSensitive);
    s.connect('changed::dm-show-media', updateCompleteSensitive);
    updateCompleteSensitive();
    formatGroup.add(completeFormatRow);

    const swapRow = createSwitchRow({
      settings: s,
      bindKey: 'dm-swap-text-order',
      title: 'Permutar orden',
      subtitle: 'Muestra primero la información multimedia y luego el reloj (solo Vista completa)',
    });
    const updateSwapSensitive = () => {
      swapRow.sensitive = s.get_boolean('dm-show-media') && s.get_int('dm-media-layout') === 2;
    };
    s.connect('changed::dm-show-media', updateSwapSensitive);
    s.connect('changed::dm-media-layout', updateSwapSensitive);
    updateSwapSensitive();
    formatGroup.add(swapRow);

    // ── Multimedia ────────────────────────────────────────────────
    const mediaGroup = createGroup({
      parent: page,
      title: 'Multimedia',
      description: 'Controla cómo se muestra la información de reproducción multimedia en el panel.',
    });

    function bindMaster(row) {
      s.bind('dm-show-media', row, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    }

    const mediaSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-media',
      title: 'Módulo multimedia',
      subtitle: 'Muestra la información de la pista actual en el panel durante la reproducción',
    });
    mediaGroup.add(mediaSwitch);

    const layoutRow = this._createLayoutRow(s);
    bindMaster(layoutRow);
    mediaGroup.add(layoutRow);

    const playingOnlyRow = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-media-playing-only',
      title: 'Solo mostrar durante reproducción',
      subtitle: 'Si está inactivo, la información multimedia se muestra incluso cuando el medio está en pausa',
    });
    bindMaster(playingOnlyRow);
    mediaGroup.add(playingOnlyRow);

    // — Longitudes de texto —
    const titleLenRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-title-max-length',
      title: 'Longitud del título',
      subtitle: 'Máximo de caracteres para el título de la pista (5-30)',
      adjProps: { lower: 5, upper: 30 },
    });
    bindMaster(titleLenRow);
    mediaGroup.add(titleLenRow);

    const artistLenRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-artist-max-length',
      title: 'Longitud del artista',
      subtitle: 'Máximo de caracteres para el nombre del artista (5-30)',
      adjProps: { lower: 5, upper: 30 },
    });
    bindMaster(artistLenRow);
    mediaGroup.add(artistLenRow);

    // — Álbum —
    const artSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-art',
      title: 'Mostrar carátula del álbum',
      subtitle: 'Muestra la carátula del álbum junto a la información de la canción',
    });
    bindMaster(artSwitch);
    mediaGroup.add(artSwitch);

    const artPosRow = this._createArtPositionRow(s);
    const updateArtPosSensitive = () => {
      artPosRow.sensitive = s.get_boolean('dm-show-media') && s.get_boolean('dm-show-art');
    };
    s.connect('changed::dm-show-media', updateArtPosSensitive);
    s.connect('changed::dm-show-art', updateArtPosSensitive);
    updateArtPosSensitive();
    mediaGroup.add(artPosRow);

    const artCacheRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-art-cache-size',
      title: 'Tamaño de caché de carátulas',
      subtitle: 'Límite máximo de almacenamiento en disco (MB). Las carátulas antiguas se eliminan automáticamente.',
      adjProps: { lower: 1, upper: 500, step: 5 },
    });
    const updateArtCacheSensitive = () => {
      artCacheRow.sensitive = s.get_boolean('dm-show-media') && s.get_boolean('dm-show-art');
    };
    s.connect('changed::dm-show-media', updateArtCacheSensitive);
    s.connect('changed::dm-show-art', updateArtCacheSensitive);
    updateArtCacheSensitive();
    mediaGroup.add(artCacheRow);

    // — Visualizador —
    const visEnabledSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-visualizer-enabled',
      title: 'Activar visualizador',
      subtitle: 'Muestra el visualizador de audio durante la reproducción',
    });
    bindMaster(visEnabledSwitch);
    mediaGroup.add(visEnabledSwitch);

    const visStyleRow = this._createVisualizerStyleRow(s);
    const visPosRow = this._createVisPositionRow(s);
    const barsRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-visualizer-bars',
      title: 'Barras',
      subtitle: 'Cantidad de barras del visualizador',
      adjProps: { lower: 2, upper: 16 },
    });
    const heightRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-visualizer-height',
      title: 'Altura',
      subtitle: 'Altura en píxeles del visualizador',
      adjProps: { lower: 8, upper: 64 },
    });

    const updateVisChildrenSensitive = () => {
      const active = s.get_boolean('dm-show-media') && s.get_boolean('dm-visualizer-enabled');
      visStyleRow.sensitive = active;
      visPosRow.sensitive = active;
      barsRow.sensitive = active;
      heightRow.sensitive = active;
    };
    s.connect('changed::dm-show-media', updateVisChildrenSensitive);
    s.connect('changed::dm-visualizer-enabled', updateVisChildrenSensitive);
    updateVisChildrenSensitive();

    mediaGroup.add(visStyleRow);
    mediaGroup.add(visPosRow);
    mediaGroup.add(barsRow);
    mediaGroup.add(heightRow);
  }

  _createLayoutRow(settings) {
    const model = Gio.ListStore.new(DropDownChoice);
    const options = {
      '0': 'Vista multimedia',
      '1': 'Vista de reloj',
      '2': 'Reloj + Multimedia',
    };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: 'Disposición',
      subtitle: 'Multimedia (solo texto), Reloj (reloj+carátula+visualizador), Completa (texto+reloj)',
      model,
      expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    const updateSelected = () => {
      const current = String(settings.get_int('dm-media-layout'));
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).id === current) {
          row.selected = i;
          return;
        }
      }
      row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();

    row.connect('notify::selected-item', () => {
      const value = row.selectedItem?.id;
      if (value === '1') {
        const showArt = settings.get_boolean('dm-show-art');
        const visEnabled = settings.get_boolean('dm-visualizer-enabled');
        if (!showArt && !visEnabled) {
          updateSelected();
          return;
        }
      }
      if (value !== undefined && value !== null)
        settings.set_int('dm-media-layout', parseInt(value, 10));
    });
    settings.connect('changed::dm-media-layout', updateSelected);
    settings.connect('changed::dm-show-art', updateSelected);
    settings.connect('changed::dm-visualizer-enabled', updateSelected);

    return row;
  }

  _createVisualizerStyleRow(settings) {
    const model = Gio.ListStore.new(DropDownChoice);
    const options = { '1': 'Wave', '2': 'Beat', '3': 'Cava' };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: 'Estilo del visualizador',
      subtitle: 'Wave (senoidal), Beat (pulso), Cava (FFT, requiere cava)',
      model,
      expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    const updateSelected = () => {
      const current = String(settings.get_int('dm-visualizer-style'));
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).id === current) {
          row.selected = i;
          return;
        }
      }
      row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();

    row.connect('notify::selected-item', () => {
      const value = row.selectedItem?.id;
      if (value !== undefined && value !== null)
        settings.set_int('dm-visualizer-style', parseInt(value, 10));
    });
    settings.connect('changed::dm-visualizer-style', updateSelected);

    return row;
  }

  _createArtPositionRow(settings) {
    const model = Gio.ListStore.new(DropDownChoice);
    const options = { '0': 'Izquierda', '1': 'Derecha' };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: 'Ubicación de la carátula',
      subtitle: 'Coloca la carátula a la izquierda o derecha del texto',
      model,
      expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    const updateSelected = () => {
      const current = String(settings.get_int('dm-art-position'));
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).id === current) {
          row.selected = i;
          return;
        }
      }
      row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();

    row.connect('notify::selected-item', () => {
      const value = row.selectedItem?.id;
      if (value !== undefined && value !== null)
        settings.set_int('dm-art-position', parseInt(value, 10));
    });
    settings.connect('changed::dm-art-position', updateSelected);

    return row;
  }

  _createVisPositionRow(settings) {
    const model = Gio.ListStore.new(DropDownChoice);
    const options = { '0': 'Izquierda', '1': 'Derecha' };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: 'Ubicación del visualizador',
      subtitle: 'Coloca el visualizador a la izquierda o derecha del texto',
      model,
      expression: Gtk.PropertyExpression.new(DropDownChoice, null, 'title'),
    });

    const updateSelected = () => {
      const current = String(settings.get_int('dm-visualizer-position'));
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).id === current) {
          row.selected = i;
          return;
        }
      }
      row.selected = Gtk.INVALID_LIST_POSITION;
    };
    updateSelected();

    row.connect('notify::selected-item', () => {
      const value = row.selectedItem?.id;
      if (value !== undefined && value !== null)
        settings.set_int('dm-visualizer-position', parseInt(value, 10));
    });
    settings.connect('changed::dm-visualizer-position', updateSelected);

    return row;
  }

  _addEnableSubSwitch(group, settings, bindKey, title) {
    const sw = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind(bindKey, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
    const row = new Adw.ActionRow({ title, activatable_widget: sw });
    row.add_suffix(sw);
    group.add(row);
  }

  _addFontToggleRow(group, settings, toggleKey, fontKey, title) {
    group.add(createSwitchRow({ settings, bindKey: toggleKey, title }));
    group.add(createEntryRow({ settings, bindKey: fontKey, title: 'Fuente', subtitle: 'Nombre de la fuente (ej: Monospace)' }));
  }
}

export { CATEGORIES };
