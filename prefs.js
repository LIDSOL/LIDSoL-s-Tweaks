'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { WorkspaceIndicatorPrefs } from './extension/modules/workspaceIndicator/prefsSettings.js';
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
    title: 'Shell',
    icon: 'system-search-symbolic',
    summary: 'Herramientas del sistema',
    description: 'Lanzador, menú de apagado y notas rápidas.',
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
    title: 'Top Bar / Panel',
    icon: 'pan-end-symbolic',
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
      this._addTopbarModuleGroup(page);
    }
    if (cat.id === 'general') {
      this._addGeneralPage(page);
    }
    return page;
  }

  _addQuicksettingsModuleGroup(page) {
    const systemGroup = new Adw.PreferencesGroup({
      title: 'Área de sistema',
      description: 'Avatar de usuario y organización de los botones del sistema.',
    });
    systemGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'user-avatar-enabled',
      title: 'Avatar de Usuario',
      subtitle: 'Muestra tu foto de perfil en los ajustes rápidos',
      onDetailed: () => this._openDialog('Avatar de Usuario', p => this._buildUserAvatarDialog(p)),
    }));
    systemGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qst-system-items-enabled',
      title: 'System Items Layout',
      subtitle: 'Reordena y oculta botones del área de sistema (captura, ajustes, bloqueo, apagado, batería)',
      onDetailed: () => {
        if (this._window && this._settings)
          openSystemItemsDialog(this._window, this._settings);
      },
    }));
    page.add(systemGroup);

    const togglesGroup = new Adw.PreferencesGroup({
      title: 'Toggles',
      description: 'Personalización de los toggles del menú de configuración rápida.',
    });
    togglesGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qst-toggles-enabled',
      title: 'Quick Toggles Layout',
      subtitle: 'Reordena y oculta toggles del menú de configuración rápida',
      onDetailed: () => {
        if (this._window && this._settings)
          openToggleOrderDialog(this._window, this._settings);
      },
    }));
    togglesGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qst-overlay-menu-enabled',
      title: 'Overlay Mode',
      subtitle: 'Muestra los menús como superposición sobre los ajustes rápidos (útil en pantallas pequeñas)',
      onDetailed: () => {
        if (this._window && this._settings)
          this._buildOverlayMenuDialog();
      },
    }));
    page.add(togglesGroup);
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
    const group = new Adw.PreferencesGroup();
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'panel-corners-enabled',
      title: 'Panel Corners',
      subtitle: 'Esquinas redondeadas en el panel y la pantalla',
      onDetailed: () => this._openDialog('Panel Corners', p => this._buildPanelCornersDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'workspace-indicator-enabled',
      title: 'Workspace Indicator',
      subtitle: 'Indicador de espacios de trabajo estilo Space Bar',
      onDetailed: () => this._openDialog('Workspace Indicator', p => this._buildWorkspaceIndicatorDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'battery-indicator-enabled',
      title: 'Battery Indicator',
      subtitle: 'Círculo y/o barra personalizados para la batería en la barra superior',
      onDetailed: () => this._openDialog('Battery Indicator', p => this._buildBatteryIndicatorDialog(p)),
    }));
    page.add(group);

    const startGroup = new Adw.PreferencesGroup({
      title: 'Start Icon',
      description: 'Botón de inicio en el panel que abre el dashboard (y más adelante, el launcher).',
    });
    startGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dashboard-button-enable',
      title: 'Start Icon',
      subtitle: 'Botón de panel que abre el dashboard',
      onDetailed: () => this._openDialog('Start Icon', p => this._buildStartIconDialog(p)),
    }));
    page.add(startGroup);

    const dmGroup = new Adw.PreferencesGroup({
      title: 'Date Menu',
      description: 'Formato personalizado del reloj del panel con indicador multimedia.',
    });
    dmGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dm-enabled',
      title: 'Date Menu (At a Glance)',
      subtitle: 'Reloj con formato personalizado e indicador multimedia',
      onDetailed: () => this._openDialog('Date Menu', p => this._buildDateMenuDialog(p)),
    }));
    page.add(dmGroup);

    const orgGroup = new Adw.PreferencesGroup({
      title: 'Organización del panel',
      description: 'Reordena y oculta elementos de la barra superior.',
    });
    orgGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'tbo-enabled',
      title: 'Top Bar Organizer',
      subtitle: 'Reordena y oculta indicadores de la barra superior',
      onDetailed: () => {
        if (this._window && this._settings)
          openTopBarOrganizerDialog(this._window, this._settings);
      },
    }));
    page.add(orgGroup);
  }

  _buildBatteryIndicatorDialog(page) {
    const s = this._settings;

    const mainGroup = new Adw.PreferencesGroup({
      title: 'Estilo',
      description: 'Configura el estilo del indicador en la barra superior.',
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
    mainGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-position', title: 'Posición', subtitle: '0=izquierda, 1=centro, 2=derecha',
      adjProps: { lower: 0, upper: 2, step: 1 },
    }));
    mainGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-offset', title: 'Desplazamiento', subtitle: 'Orden dentro de la sección',
      adjProps: { lower: 0, upper: 100, step: 1 },
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
    const dashGroup = new Adw.PreferencesGroup({
      title: 'Dashboard',
      description: 'Panel de inicio con widgets configurables (aplicaciones, reloj, multimedia, sistema, etc.).',
    });
    dashGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dashboard-enabled',
      title: 'Dashboard',
      subtitle: 'Panel de inicio con acceso rápido a todo',
      onDetailed: () => this._openDialog('Dashboard', p => this._buildDashboardDialog(p)),
    }));
    page.add(dashGroup);

    const group = new Adw.PreferencesGroup();
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qt-enabled',
      title: 'Quick Text',
      subtitle: 'Captura rápida de notas con atajo de teclado',
      onDetailed: () => this._openDialog('Quick Text', p => this._buildQuickTextDialog(p)),
    }));
    page.add(group);

    const launcherGroup = new Adw.PreferencesGroup({
      title: 'Launcher',
      description: 'Buscador flotante que roba la búsqueda del overview para mostrarla en una ventana flotante.',
    });
    launcherGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'launcher-enabled',
      title: 'Launcher',
      subtitle: 'Buscador flotante que sustituye la búsqueda del overview',
      onDetailed: () => this._openDialog('Launcher', p => this._buildLauncherDialog(p)),
    }));
    page.add(launcherGroup);

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
    advGroup.add(createSwitchRow({ settings: s, bindKey: 'debug', title: 'Modo debug', subtitle: 'Activa logs más verbosos' }));
  }

  _buildWorkspaceIndicatorDialog(page) {
    const prefs = new WorkspaceIndicatorPrefs(this._settings);
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
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-multiline', title: 'Entrada de una sola línea', subtitle: 'Si está activo, Enter guarda la nota directamente' }));
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-hideacted', title: 'Ocultar notas procesadas', subtitle: 'Oculta notas marcadas como procesadas en la ventana de acciones' }));
    const hotkeyEntry = new Gtk.Entry({ text: s.get_strv('qt-hotkey')[0] || '', valign: Gtk.Align.CENTER });
    hotkeyEntry.connect('changed', () => s.set_strv('qt-hotkey', [hotkeyEntry.get_text()]));
    const hotkeyRow = new Adw.ActionRow({ title: 'Atajo de teclado', subtitle: 'Combinación para abrir el diálogo de notas', activatable_widget: hotkeyEntry });
    hotkeyRow.add_suffix(hotkeyEntry);
    group.add(hotkeyRow);
    group.add(createEntryRow({ settings: s, bindKey: 'qt-filepath', title: 'Archivo de notas', subtitle: 'Ruta absoluta al archivo de texto' }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-prepend', title: 'Prefijo', subtitle: 'Texto antes de cada nota (vacío = fecha actual)' }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-append', title: 'Separador', subtitle: 'Texto que separa las notas en el archivo' }));
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

    const readConfigRow = new Adw.ActionRow({
      title: 'Read Config',
      subtitle: 'Load config from dashboard.json',
    });
    const readConfigBtn = new Gtk.Button({ label: 'Apply', valign: Gtk.Align.CENTER });
    readConfigBtn.connect('clicked', () => {
      s.set_int('dashboard-read-config', s.get_int('dashboard-read-config') + 1);
    });
    readConfigRow.add_suffix(readConfigBtn);
    dashGroup.add(readConfigRow);

    dashGroup.add(_makeAlignRow('X Align', 'dashboard-x-align'));
    dashGroup.add(_makeAlignRow('Y Align', 'dashboard-y-align'));
    dashGroup.add(_makeSpinRow('X Offset', 'dashboard-x-offset', -1000, 1000, 10));
    dashGroup.add(_makeSpinRow('Y Offset', 'dashboard-y-offset', -1000, 1000, 10));
    dashGroup.add(_makeExpandRow('Darken Background', 'dashboard-darken'));
    page.add(dashGroup);

    // ── Grid group ──
    const gridGroup = new Adw.PreferencesGroup({ title: 'Grid Layout' });
    gridGroup.add(_makeSpinRow('Spacing', 'dashboard-grid-spacing', 0, 60, 1));
    gridGroup.add(_makeSpinRow('Columns', 'dashboard-grid-columns', 1, 6, 1));
    gridGroup.add(_makeExpandRow('Homogeneous Cells', 'dashboard-grid-homogeneous'));

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
      exp.add_row(_makeSpinRow('Icon Roundness', 'dashboard-user-icon-roundness', 0, 99, 1));
      exp.add_row(_makeSpinRow('Icon Width', 'dashboard-user-icon-width', 10, 500, 2));
      exp.add_row(_makeSpinRow('Icon Height', 'dashboard-user-icon-height', 10, 500, 2));
      exp.add_row(_makeSpinRow('Text Spacing', 'dashboard-user-text-spacing', 0, 80, 1));
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-user-vertical'));
      exp.add_row(_makeExpandRow('Show Real Name', 'dashboard-user-real-name'));
    }));

    widgetsGroup.add(_makeWidgetExpander('levels', 'System Levels', exp => {
      exp.add_row(_makeSpinRow('Fixed Width', 'dashboard-levels-fixed-width', 300, 530, 5));
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-levels-vertical'));
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

      exp.add_row(_makeExpandRow('Show Volume Slider', 'dashboard-media-show-volume'));
      exp.add_row(_makeExpandRow('Show Loop and Shuffle', 'dashboard-media-show-loop-shuffle'));
    }));

    widgetsGroup.add(_makeWidgetExpander('links', 'Links', exp => {
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-links-vertical'));
      exp.add_row(_makeSpinRow('Icon Size', 'dashboard-links-icon-size', 4, 100, 2));
      exp.add_row(new Adw.ActionRow({
        title: 'Web Links',
        subtitle: 'You can change the links through dconf editor.\nPlace SVGs named name-symbolic.svg in the extension media folder.',
      }));
    }));

    widgetsGroup.add(_makeWidgetExpander('clock', 'Clock', exp => {
      exp.add_row(_makeExpandRow('Vertical', 'dashboard-clock-vertical'));
    }));

    widgetsGroup.add(_makeWidgetExpander('apps', 'App Launcher', exp => {
      exp.add_row(_makeSpinRow('Rows', 'dashboard-apps-rows', 1, 6, 1));
      exp.add_row(_makeSpinRow('Columns', 'dashboard-apps-cols', 1, 6, 1));
      exp.add_row(_makeSpinRow('Icon Size', 'dashboard-apps-icon-size', 4, 100, 2));
    }));

    widgetsGroup.add(_makeWidgetExpander('system', 'System & Settings', exp => {
      const layoutModel = new Gtk.StringList({ strings: ['Vertical', 'Horizontal', '2x2'] });
      const layoutRow = new Adw.ComboRow({ title: 'Layout', model: layoutModel, selected: s.get_int('dashboard-system-layout') });
      layoutRow.connect('notify::selected', () => s.set_int('dashboard-system-layout', layoutRow.selected));
      exp.add_row(layoutRow);
      exp.add_row(_makeSpinRow('Icon Size', 'dashboard-system-icon-size', 4, 100, 2));
      exp.add_row(_makeExpandRow('Settings Vertical', 'dashboard-settings-vertical'));
      exp.add_row(_makeSpinRow('Settings Icon Size', 'dashboard-settings-icon-size', 4, 100, 2));
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
    const mainGroup = createGroup({ parent: page, title: 'Launcher', description: 'Buscador flotante similar a rofi o spotlight, .' });
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'launcher-enabled', title: 'Habilitar Launcher' }));
    mainGroup.add(createKeyboardShortcutRow({ settings: s, bindKey: 'launcher-hotkey', title: 'Atajo de teclado', subtitle: 'Combinación para abrir/cerrar el launcher' }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'launcher-width', title: 'Ancho', adjProps: { lower: 400, upper: 1200, step_increment: 10 } }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'launcher-height', title: 'Alto', adjProps: { lower: 300, upper: 1000, step_increment: 10 } }));
    const posGroup = createGroup({ parent: page, title: 'Posición', description: 'Ajusta dónde aparece el launcher en la pantalla' });
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'launcher-position-x', title: 'Posición horizontal (%)', subtitle: '0=izquierda, 50=centro, 100=derecha', adjProps: { lower: 0, upper: 100, step_increment: 5 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'launcher-position-y', title: 'Posición vertical (%)', subtitle: '0=arriba, 50=centro, 100=abajo', adjProps: { lower: 0, upper: 100, step_increment: 5 } }));

    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'launcher-use-animations', title: 'Usar animaciones' }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'launcher-animation-speed', title: 'Velocidad de animación (ms)', adjProps: { lower: 50, upper: 500, step_increment: 10 } }));
    const overviewGroup = createGroup({ parent: page, title: 'Overview', description: 'Ajustes relacionados con la vista general' });
    overviewGroup.add(createSwitchRow({ settings: s, bindKey: 'launcher-hide-search', title: 'Ocultar barra de búsqueda', subtitle: 'Oculta el campo "Type to search" en el Overview. Aparece al empezar a escribir.' }));
  }

  _buildUserAvatarDialog(page) {
    const s = this._settings;
    const posGroup = createGroup({ parent: page, title: 'Posición' });
    const positionModel = new Gtk.StringList({ strings: ['Derecha', 'Izquierda'] });
    const positionRow = new Adw.ComboRow({ title: 'Posición', subtitle: 'Posición del avatar respecto a los botones del sistema', model: positionModel, selected: s.get_int('ua-position') });
    positionRow.connect('notify::selected', () => s.set_int('ua-position', positionRow.selected));
    posGroup.add(positionRow);
    const appearGroup = createGroup({ parent: page, title: 'Apariencia' });
    appearGroup.add(createSpinButtonRow({ settings: s, bindKey: 'ua-size', title: 'Tamaño', subtitle: '43 por defecto', adjProps: { lower: 15, upper: 75, step: 2 } }));
    appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-realname', title: 'Mostrar nombre real', subtitle: 'Según la longitud, puede aumentar el ancho del panel' }));
    appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-username', title: 'Mostrar nombre de usuario' }));
    appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-hostname', title: 'Mostrar nombre del equipo' }));
    appearGroup.add(createSwitchRow({ settings: s, bindKey: 'ua-nobackground', title: 'Quitar fondo del botón', subtitle: 'Elimina el fondo predeterminado' }));
  }

  _buildOverlayMenuDialog() {
    const s = this._settings;
    createDialog({
      window: this._getWindow(),
      title: 'Overlay Mode',
      childrenRequest: (page) => {
        const group = createGroup({
          parent: page,
          title: 'Overlay Mode',
          description: 'Al activarlo, los menús de toggles con opciones se muestran superpuestos sobre los ajustes rápidos. Corrige el desbordamiento en pantallas pequeñas.',
        });
        group.add(createSpinButtonRow({
          settings: s,
          bindKey: 'qst-overlay-menu-width',
          title: 'Ancho del overlay',
          subtitle: 'Ancho en píxeles (0 = sin ajuste)',
          adjProps: { lower: 0, upper: 2048, step: 10 },
        }));
        group.add(createSpinButtonRow({
          settings: s,
          bindKey: 'qst-overlay-menu-animate-duration',
          title: 'Duración de animación',
          subtitle: 'Milisegundos (0 = sin animación)',
          adjProps: { lower: 0, upper: 4000, step: 50 },
        }));
        group.add(createComboRow({
          settings: s,
          bindKey: 'qst-overlay-menu-animate-style',
          title: 'Estilo de animación',
          subtitle: 'Cómo aparece el menú superpuesto',
          options: {
            flyout: 'Flyout (se expande desde el toggle)',
            dialog: 'Diálogo (escala desde el centro)',
          },
        }));
        group.add(createComboRow({
          settings: s,
          bindKey: 'qst-overlay-menu-overflow-anchor',
          title: 'Anclaje por desbordamiento',
          subtitle: 'Si el menú es más alto que la ventana de ajustes',
          options: {
            top: 'Arriba',
            center: 'Centro',
            bottom: 'Abajo',
          },
        }));
      },
    });
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

// ══════════════════════════════════════════════════════════════════
//  TOGGLE ORDERING
// ══════════════════════════════════════════════════════════════════

const SYSTEM_NAMES = {
  NMWiredToggle: 'Cableada', NMWirelessToggle: 'Wi-Fi', NMModemToggle: 'Red Móvil',
  NMBluetoothToggle: 'BT Tethering', NMVpnToggle: 'VPN', BluetoothToggle: 'Bluetooth',
  PowerProfilesToggle: 'Modo de Energía', NightLightToggle: 'Luz Nocturna',
  DarkModeToggle: 'Modo Oscuro', DoNotDisturbToggle: 'No Molestar',
  KeyboardBrightnessToggle: 'Teclado Retroiluminado', RfkillToggle: 'Modo Avión',
  RotationToggle: 'Auto Rotar', DndQuickToggle: 'DND', UnsafeQuickToggle: 'Modo Inseguro',
};
const SYSTEM_ICONS = {
  NMWiredToggle: 'network-wired-symbolic', NMWirelessToggle: 'network-wireless-signal-excellent-symbolic',
  NMModemToggle: 'network-cellular-symbolic', NMBluetoothToggle: 'network-cellular-symbolic',
  NMVpnToggle: 'network-vpn-symbolic', BluetoothToggle: 'bluetooth-active-symbolic',
  PowerProfilesToggle: 'power-profile-balanced-symbolic', NightLightToggle: 'night-light-symbolic',
  DarkModeToggle: 'weather-clear-night', DoNotDisturbToggle: 'notifications-disabled-symbolic',
  KeyboardBrightnessToggle: 'preferences-desktop-keyboard', RfkillToggle: 'airplane-mode-symbolic',
  RotationToggle: 'object-rotate-right', DndQuickToggle: 'emblem-system-symbolic',
  UnsafeQuickToggle: 'channel-secure-symbolic',
};

function getDisplayName(item) {
  if (item.nonOrdered) return 'Otros toggles';
  if (item.isSystem && item.constructorName)
    return SYSTEM_NAMES[item.constructorName] || item.constructorName;
  return item.friendlyName || item.constructorName || '(sin nombre)';
}
function getSubtitle(item) {
  if (item.nonOrdered) return 'Los toggles no listados aparecerán aquí';
  if (item.isSystem) return 'Toggle del sistema';
  const parts = [];
  if (item.constructorName) parts.push(`ctor: ${item.constructorName}`);
  if (item.titleRegex) parts.push(`regex: ${item.titleRegex}`);
  return parts.join(', ') || 'Toggle personalizado';
}
function getIconName(item) {
  if (item.isSystem && item.constructorName)
    return SYSTEM_ICONS[item.constructorName] || 'emblem-system-symbolic';
  if (item.icon)
    return item.icon;
  return 'preferences-other-symbolic';
}

function serializeToList(list) {
  return list.map(item => {
    const dict = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === 'cachedTitleRegex') continue;
      if (typeof value === 'boolean')
        dict[key] = GLib.Variant.new_variant(GLib.Variant.new_boolean(value));
      else if (typeof value === 'string')
        dict[key] = GLib.Variant.new_variant(GLib.Variant.new_string(value));
      else if (typeof value === 'number')
        dict[key] = GLib.Variant.new_variant(GLib.Variant.new_int32(value));
      else if (Array.isArray(value))
        dict[key] = GLib.Variant.new_variant(GLib.Variant.new_strv(value));
    }
    return dict;
  });
}
function shouldShow(item) { return true; }
function moveBlocking(_list, _moving, _movingIndex, _target, _targetIndex) { return false; }
function skip(list, _moving, _movingIndex, target, _targetIndex) { return shouldShow(target); }

function moveItem(list, item, offset) {
  const idx = list.indexOf(item);
  if (idx === -1 || offset === 0) return false;
  const sign = Math.sign(offset);
  let targetIndex = idx;
  for (let count = Math.abs(offset); count > 0;) {
    if (targetIndex <= 0 && sign === -1) break;
    if (targetIndex >= (list.length - 1) && sign === 1) break;
    if (moveBlocking(list, item, idx, list[targetIndex], targetIndex)) break;
    targetIndex += sign;
    if (skip(list, item, idx, list[targetIndex], targetIndex)) count--;
  }
  if (idx === targetIndex) return false;
  list.splice(idx, 1);
  list.splice(targetIndex, 0, item);
  return true;
}

function addMoveButtons(row, list, item, saveList, rebuild) {
  const upBtn = Gtk.Button.new_from_icon_name('go-up-symbolic');
  upBtn.has_frame = false; upBtn.valign = Gtk.Align.CENTER; upBtn.tooltip_text = 'Mover arriba';
  upBtn.connect('clicked', () => { if (moveItem(list, item, -1)) { saveList(list); rebuild(); } });
  const downBtn = Gtk.Button.new_from_icon_name('go-down-symbolic');
  downBtn.has_frame = false; downBtn.valign = Gtk.Align.CENTER; downBtn.tooltip_text = 'Mover abajo';
  downBtn.connect('clicked', () => { if (moveItem(list, item, 1)) { saveList(list); rebuild(); } });
  row.add_prefix(downBtn);
  row.add_prefix(upBtn);
}

function saveItem(item, rows) {
  item.friendlyName = rows.nameRow.get_text();
  item.icon = rows.iconEntry ? rows.iconEntry.get_text() : '';
  item.constructorName = rows.ctorRow.get_text();
  item.titleRegex = rows.regexRow.get_text();
  item.gtypeName = rows.gtypeRow.get_text();
  item.commandOn = rows.onCmdRow.get_text();
  item.commandOff = rows.offCmdRow.get_text();
  item.checkCommand = rows.checkCmdEntry ? rows.checkCmdEntry.get_text() : '';
  item.checkRegex = rows.checkRegexEntry ? rows.checkRegexEntry.get_text() : '';
  item.keybinding = rows.shortcutLabel.accelerator || '';
  item.initialState = rows.initialStateCombo.selected;
  item.runAtBoot = rows.runAtBootSwitch.active;
  item.delayTime = rows.delaySpin.value;
  item.buttonClick = rows.buttonClickCombo.selected;
  item.showIndicator = rows.showIndicatorSwitch.active;
  item.closeMenu = rows.closeMenuSwitch.active;
  item.checkExitCode = rows.checkExitCodeSwitch.active;
  item.commandSync = rows.commandSyncSwitch.active;
  item.pollInterval = rows.pollIntervalSpin.value;
}

function newItemDefaults() {
  return {
    hide: false, isSystem: false, constructorName: '',
    friendlyName: 'Toggle personalizado', titleRegex: '', gtypeName: '',
    icon: '', commandOn: '', commandOff: '',
    checkCommand: '', checkRegex: '', keybinding: '',
    initialState: 2, runAtBoot: false, delayTime: 3,
    buttonClick: 2, showIndicator: false, closeMenu: false,
    checkExitCode: false, commandSync: false, pollInterval: 10,
  };
}

function buildEditFormRows(page, item, rootWindow) {
  const rows = {};
  const appGroup = new Adw.PreferencesGroup({ title: 'Apariencia' });
  page.add(appGroup);
  rows.nameRow = new Adw.EntryRow({ title: 'Nombre' });
  rows.nameRow.set_text(item.friendlyName || '');
  appGroup.add(rows.nameRow);
  rows.iconRow = new Adw.ActionRow({ title: 'Icono', subtitle: 'Nombre del icono' });
  const iconBox = new Gtk.Box({ spacing: 14, valign: Gtk.Align.CENTER });
  rows.iconPreview = Gtk.Image.new_from_icon_name(item.icon || 'preferences-other-symbolic');
  rows.iconPreview.pixel_size = 20;
  iconBox.append(rows.iconPreview);
  rows.iconEntry = new Gtk.Entry({ text: item.icon || '', valign: Gtk.Align.CENTER });
  iconBox.append(rows.iconEntry);
  rows.iconRow.add_suffix(iconBox);
  rows.iconRow.activatable_widget = rows.iconEntry;
  appGroup.add(rows.iconRow);
  rows.iconEntry.connect('changed', () => {
    const name = rows.iconEntry.get_text().trim() || 'preferences-other-symbolic';
    rows.iconPreview.icon_name = name;
  });
  const refLink = new Gtk.LinkButton({
    uri: 'https://gitlab.gnome.org/GNOME/adwaita-icon-theme/-/tree/master/Adwaita/symbolic',
    label: 'Más iconos',
    valign: Gtk.Align.CENTER,
  });
  const refRow = new Adw.ActionRow({
    title: 'Sugerencias',
    subtitle: 'face-smile-symbolic, heart-symbolic, starred-symbolic, audio-headphones-symbolic, battery-good-symbolic, …',
  });
  refRow.add_suffix(refLink);
  appGroup.add(refRow);
  const matchGroup = new Adw.PreferencesGroup({ title: 'Reglas de coincidencia', description: 'Identifica el toggle en el sistema. Vacío si es sólo comandos.' });
  page.add(matchGroup);
  rows.ctorRow = new Adw.EntryRow({ title: 'Constructor name' });
  rows.ctorRow.set_text(item.constructorName || '');
  matchGroup.add(rows.ctorRow);
  rows.regexRow = new Adw.EntryRow({ title: 'Regex de título' });
  rows.regexRow.set_text(item.titleRegex || '');
  matchGroup.add(rows.regexRow);
  rows.gtypeRow = new Adw.EntryRow({ title: 'GType name' });
  rows.gtypeRow.set_text(item.gtypeName || '');
  matchGroup.add(rows.gtypeRow);
  const cmdGroup = new Adw.PreferencesGroup({ title: 'Comandos', description: 'Comandos a ejecutar al activar/desactivar' });
  page.add(cmdGroup);
  rows.onCmdRow = new Adw.EntryRow({ title: 'Comando ON' });
  rows.onCmdRow.set_text(item.commandOn || '');
  cmdGroup.add(rows.onCmdRow);
  rows.offCmdRow = new Adw.EntryRow({ title: 'Comando OFF' });
  rows.offCmdRow.set_text(item.commandOff || '');
  cmdGroup.add(rows.offCmdRow);
  rows.checkCmdRow = new Adw.ActionRow({ title: 'Comando de verificación', subtitle: 'Consulta el estado actual' });
  rows.checkCmdEntry = new Gtk.Entry({ text: item.checkCommand || '', valign: Gtk.Align.CENTER });
  rows.checkCmdRow.add_suffix(rows.checkCmdEntry);
  rows.checkCmdRow.activatable_widget = rows.checkCmdEntry;
  cmdGroup.add(rows.checkCmdRow);
  rows.checkRegexRow = new Adw.ActionRow({ title: 'Término de búsqueda', subtitle: 'Texto a buscar en la salida del comando' });
  rows.checkRegexEntry = new Gtk.Entry({ text: item.checkRegex || '', valign: Gtk.Align.CENTER });
  rows.checkRegexRow.add_suffix(rows.checkRegexEntry);
  rows.checkRegexRow.activatable_widget = rows.checkRegexEntry;
  cmdGroup.add(rows.checkRegexRow);
  const startupGroup = new Adw.PreferencesGroup({ title: 'Comportamiento de inicio' });
  page.add(startupGroup);
  const initialStateOptions = new Gtk.StringList();
  initialStateOptions.append('Activado'); initialStateOptions.append('Desactivado');
  initialStateOptions.append('Estado anterior'); initialStateOptions.append('Salida del comando');
  rows.initialStateCombo = new Adw.ComboRow({ title: 'Estado inicial', subtitle: 'Estado al iniciar sesión', model: initialStateOptions, selected: item.initialState ?? 2 });
  startupGroup.add(rows.initialStateCombo);
  rows.runAtBootSwitch = new Adw.SwitchRow({ title: 'Ejecutar comando al inicio', subtitle: 'Ejecuta ON/OFF al iniciar sesión', active: !!item.runAtBoot });
  startupGroup.add(rows.runAtBootSwitch);
  rows.delaySpin = new Adw.SpinRow({ title: 'Retardo (segundos)', adjustment: new Gtk.Adjustment({ lower: 0, upper: 10, step_increment: 1 }), value: item.delayTime ?? 3 });
  startupGroup.add(rows.delaySpin);
  const toggleGroup = new Adw.PreferencesGroup({ title: 'Comportamiento del toggle' });
  page.add(toggleGroup);
  const clickOptions = new Gtk.StringList();
  clickOptions.append('Siempre activado'); clickOptions.append('Siempre desactivado'); clickOptions.append('Alternar');
  rows.buttonClickCombo = new Adw.ComboRow({ title: 'Acción al hacer clic', subtitle: 'Comportamiento al presionar', model: clickOptions, selected: item.buttonClick ?? 2 });
  toggleGroup.add(rows.buttonClickCombo);
  rows.showIndicatorSwitch = new Adw.SwitchRow({ title: 'Mostrar indicador', subtitle: 'Icono en la barra superior cuando está activado', active: !!item.showIndicator });
  toggleGroup.add(rows.showIndicatorSwitch);
  rows.closeMenuSwitch = new Adw.SwitchRow({ title: 'Cerrar menú al presionar', active: !!item.closeMenu });
  toggleGroup.add(rows.closeMenuSwitch);
  rows.checkExitCodeSwitch = new Adw.SwitchRow({ title: 'Verificar código de salida', subtitle: 'Sólo alternar si el comando se ejecuta correctamente', active: !!item.checkExitCode });
  toggleGroup.add(rows.checkExitCodeSwitch);
  const syncGroup = new Adw.PreferencesGroup({ title: 'Sincronización' });
  page.add(syncGroup);
  rows.commandSyncSwitch = new Adw.SwitchRow({ title: 'Mantener sincronizado', subtitle: 'Actualiza periódicamente el estado según la salida del comando', active: !!item.commandSync });
  syncGroup.add(rows.commandSyncSwitch);
  rows.pollIntervalSpin = new Adw.SpinRow({ title: 'Frecuencia (segundos)', subtitle: 'Cada cuánto verificar el estado', adjustment: new Gtk.Adjustment({ lower: 2, upper: 900, step_increment: 1 }), value: item.pollInterval ?? 10 });
  syncGroup.add(rows.pollIntervalSpin);
  const shortcutGroup = new Adw.PreferencesGroup({ title: 'Atajo de teclado' });
  page.add(shortcutGroup);
  rows.shortcutLabel = new Gtk.ShortcutLabel({ accelerator: item.keybinding || null, disabled_text: 'Sin atajo', valign: Gtk.Align.CENTER });
  const shortcutRow = new Adw.ActionRow({ title: 'Atajo', activatable: true });
  shortcutRow.add_suffix(rows.shortcutLabel);
  shortcutGroup.add(shortcutRow);
  shortcutRow.connect('activated', () => {
    const captureWin = new Adw.Window({ modal: true, transient_for: rootWindow, width_request: 400, height_request: 250, content: new Adw.StatusPage({ title: 'Capturar atajo', description: 'Esc para cancelar, Retroceso para desactivar', icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic' }) });
    const controller = new Gtk.EventControllerKey();
    captureWin.add_controller(controller);
    controller.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      const mask = state & Gtk.accelerator_get_default_mod_mask();
      if (!mask && keyval === Gdk.KEY_Escape) { captureWin.close(); return Gdk.EVENT_STOP; }
      if (keyval === Gdk.KEY_BackSpace && !mask) { rows.shortcutLabel.accelerator = ''; captureWin.close(); return Gdk.EVENT_STOP; }
      if (!mask || !Gtk.accelerator_valid(keyval, mask)) return Gdk.EVENT_STOP;
      rows.shortcutLabel.accelerator = Gtk.accelerator_name(keyval, mask);
      captureWin.close(); return Gdk.EVENT_STOP;
    });
    captureWin.present();
  });
  return { rows, appGroup };
}

function openEditDialog(parentWindow, settings, item, onSave) {
  const isNew = !item.friendlyName || item.friendlyName === 'Toggle personalizado' || /^My item #\d+$/.test(item.friendlyName);
  createDialog({
    window: parentWindow,
    title: isNew ? 'Nuevo toggle' : item.friendlyName,
    childrenRequest: (page, dlg) => {
      const { rows, appGroup } = buildEditFormRows(page, item, parentWindow);
      const saveBtn = new Gtk.Button({ icon_name: 'document-save-symbolic', has_frame: true });
      saveBtn.tooltip_text = 'Guardar';
      saveBtn.add_css_class('flat');
      saveBtn.connect('clicked', () => {
        try {
          saveItem(item, rows);
          if (onSave) onSave(item);
          dlg.close();
        } catch (e) {
          console.error('[LIDSoL] Error saving toggle:', e);
        }
      });
      appGroup.header_suffix = saveBtn;
    },
  });
}

function getNextName(list) {
  let nth = 1;
  while (true) {
    const name = `My item #${nth}`;
    if (!list.find(item => item.friendlyName === name)) return name;
    nth++;
  }
}

function openToggleOrderDialog(parentWindow, settings) {
  let dialog = null;
  let rebuild = null;
  const getList = () => {
    try { return settings.get_value('qst-toggles-order').recursiveUnpack(); }
    catch (e) { console.warn('[LIDSoL prefs] Failed to read qst-toggles-order:', e); return []; }
  };
  const saveList = (list) => {
    settings.set_value('qst-toggles-order', new GLib.Variant('aa{sv}', serializeToList(list)));
  };
  const addNewItem = () => {
    const newItem = newItemDefaults();
    newItem.friendlyName = getNextName(getList());
    openEditDialog(parentWindow, settings, newItem, (savedItem) => {
      const list = getList(); list.push(savedItem); saveList(list); rebuild();
    });
  };
  dialog = createDialog({
    window: parentWindow,
    title: 'Ordenar y ocultar toggles',
    childrenRequest: (page, dlg) => {
      dialog = dlg;
      const group = new Adw.PreferencesGroup({ title: 'Toggles', description: 'Usa las flechas para reordenar. El switch oculta.' });
      page.add(group);
      const rows = [];
      rebuild = () => {
        for (const r of rows) group.remove(r);
        rows.length = 0;
        const headerBox = new Gtk.Box({ spacing: 4 });
        const newBtn = new Gtk.Button({ has_frame: true, valign: Gtk.Align.CENTER });
        newBtn.add_css_class('lidsol-new-item-btn');
        const s = new Gtk.CssProvider();
        s.load_from_string('.lidsol-new-item-btn { padding: 8px 8px; min-height: 0; }');
        newBtn.get_style_context().add_provider(s, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        const c = new Gtk.Box(); newBtn.child = c;
        new Gtk.Image({ icon_name: 'list-add', pixel_size: 12, margin_end: 6 }).insert_before(c, null);
        new Gtk.Label({ label: 'Nuevo Toggle' }).insert_before(c, null);
        newBtn.connect('clicked', addNewItem);
        headerBox.append(newBtn);
        const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
        resetBtn.has_frame = false; resetBtn.valign = Gtk.Align.CENTER;
        resetBtn.tooltip_text = 'Restablecer valores predeterminados';
        resetBtn.connect('clicked', () => {
          const alert = new Adw.AlertDialog({
            heading: 'Restablecer valores predeterminados',
            body: 'Se perderán todos los cambios realizados en los toggles personalizados. ¿Continuar?',
          });
          alert.add_response('cancel', 'Cancelar');
          alert.add_response('reset', 'Restablecer');
          alert.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
          alert.set_default_response('cancel');
          alert.set_close_response('cancel');
          alert.connect('response', (_dlg, response) => {
            if (response === 'reset') {
              settings.reset('qst-toggles-order');
              rebuild();
            }
          });
          alert.present(parentWindow);
        });
        headerBox.append(resetBtn);
        group.header_suffix = headerBox;
        const list = getList();
        const addRow = (item) => {
          const row = new Adw.ActionRow({ title: getDisplayName(item), subtitle: getSubtitle(item), activatable: false });
          const icon = Gtk.Image.new_from_icon_name(getIconName(item));
          icon.pixel_size = 18; icon.margin_start = 4; icon.margin_end = 4;
          row.add_prefix(icon);
          addMoveButtons(row, list, item, saveList, rebuild);
          const hideSwitch = new Gtk.Switch({ active: !item.hide, valign: Gtk.Align.CENTER });
          hideSwitch.connect('notify::active', () => { item.hide = !hideSwitch.active; saveList(list); rebuild(); });
          row.add_suffix(hideSwitch);
          if (!item.isSystem && !item.nonOrdered) {
            const editBtn = Gtk.Button.new_from_icon_name('document-edit-symbolic');
            editBtn.has_frame = false; editBtn.valign = Gtk.Align.CENTER;
            editBtn.connect('clicked', () => { openEditDialog(parentWindow, settings, item, () => { saveList(list); rebuild(); }); });
            row.add_suffix(editBtn);
            const delBtn = Gtk.Button.new_from_icon_name('user-trash-symbolic');
            delBtn.has_frame = false; delBtn.valign = Gtk.Align.CENTER; delBtn.tooltip_text = 'Eliminar toggle';
            delBtn.connect('clicked', () => { const idx = list.indexOf(item); list.splice(idx, 1); saveList(list); rebuild(); });
            row.add_suffix(delBtn);
          }
          rows.push(row);
          group.add(row);
        };
        for (const item of list) addRow(item);
      };
      rebuild();
    },
  });
}

// ══════════════════════════════════════════════════════════════════
//  SYSTEM ITEMS LAYOUT
// ══════════════════════════════════════════════════════════════════

const SYSTEM_ITEM_NAMES = {
  battery: 'Batería',
  laptopSpacer: 'Espaciador (portátil)',
  screenshot: 'Captura de pantalla',
  settings: 'Ajustes',
  desktopSpacer: 'Espaciador (escritorio)',
  lock: 'Bloqueo',
  shutdown: 'Apagado',
};

const SYSTEM_ITEM_ICONS = {
  battery: 'battery-symbolic',
  laptopSpacer: 'computer-symbolic',
  screenshot: 'camera-photo-symbolic',
  settings: 'preferences-system-symbolic',
  desktopSpacer: 'computer-symbolic',
  lock: 'system-lock-screen-symbolic',
  shutdown: 'system-shutdown-symbolic',
};

const SYSTEM_ITEM_DEFAULT_ORDER = [
  'battery', 'laptopSpacer', 'screenshot', 'settings',
  'desktopSpacer', 'lock', 'shutdown',
];

const SYSTEM_ITEM_HIDE_KEYS = {
  battery: 'qst-system-items-hide-battery',
  screenshot: 'qst-system-items-hide-screenshot',
  settings: 'qst-system-items-hide-settings',
  lock: 'qst-system-items-hide-lock',
  shutdown: 'qst-system-items-hide-shutdown',
};

function openSystemItemsDialog(parentWindow, settings) {
  let dialog = null;
  let rebuild = null;

  const getOrder = () => {
    try { return settings.get_strv('qst-system-items-order'); }
    catch (e) { return [...SYSTEM_ITEM_DEFAULT_ORDER]; }
  };
  const saveOrder = (order) => {
    settings.set_strv('qst-system-items-order', order);
  };
  const moveItem = (name, direction) => {
    const order = getOrder();
    const idx = order.indexOf(name);
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= order.length) return;
    order.splice(idx, 1);
    order.splice(target, 0, name);
    saveOrder(order);
  };

  createDialog({
    window: parentWindow,
    title: 'Ordenar elementos del sistema',
    childrenRequest: (page, dlg) => {
      dialog = dlg;

      const masterGroup = new Adw.PreferencesGroup({
        title: 'Sistema',
        description: 'Controla la visibilidad y el orden de los botones del área de sistema en el menú de ajustes rápidos.',
      });
      page.add(masterGroup);

      const hideAllSwitch = new Gtk.Switch({
        active: settings.get_boolean('qst-system-items-hide'),
        valign: Gtk.Align.CENTER,
      });
      settings.bind('qst-system-items-hide', hideAllSwitch, 'active',
        Gio.SettingsBindFlags.DEFAULT);
      const hideAllRow = new Adw.ActionRow({
        title: 'Ocultar toda el área de sistema',
        subtitle: 'Reemplaza con el botón de apagado simplificado',
        activatable_widget: hideAllSwitch,
      });
      hideAllRow.add_suffix(hideAllSwitch);
      masterGroup.add(hideAllRow);

      const orderGroup = new Adw.PreferencesGroup({
        title: 'Orden y visibilidad',
        description: 'Usa las flechas para reordenar. El switch oculta el elemento.',
      });
      page.add(orderGroup);
      const rows = [];

      rebuild = () => {
        for (const r of rows) orderGroup.remove(r);
        rows.length = 0;

        const headerBox = new Gtk.Box({ spacing: 4 });
        const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
        resetBtn.has_frame = false;
        resetBtn.valign = Gtk.Align.CENTER;
        resetBtn.tooltip_text = 'Restablecer orden predeterminado';
        resetBtn.connect('clicked', () => {
          const alert = new Adw.AlertDialog({
            heading: 'Restablecer orden predeterminado',
            body: 'Se perderán todos los cambios en el orden y visibilidad de los elementos del sistema. ¿Continuar?',
          });
          alert.add_response('cancel', 'Cancelar');
          alert.add_response('reset', 'Restablecer');
          alert.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
          alert.set_default_response('cancel');
          alert.set_close_response('cancel');
          alert.connect('response', (_dlg, response) => {
            if (response === 'reset') {
              settings.reset('qst-system-items-order');
              for (const key of Object.values(SYSTEM_ITEM_HIDE_KEYS))
                settings.reset(key);
              rebuild();
            }
          });
          alert.present(parentWindow);
        });
        headerBox.append(resetBtn);
        orderGroup.header_suffix = headerBox;

        const order = getOrder();
        const addRow = (name) => {
          const title = SYSTEM_ITEM_NAMES[name] || name;
          const isSpacer = name === 'laptopSpacer' || name === 'desktopSpacer';
          const row = new Adw.ActionRow({ title, activatable: false });

          const icon = Gtk.Image.new_from_icon_name(
            SYSTEM_ITEM_ICONS[name] || 'emblem-system-symbolic');
          icon.pixel_size = 18;
          icon.margin_start = 4;
          icon.margin_end = 4;
          row.add_prefix(icon);

          const upBtn = Gtk.Button.new_from_icon_name('go-up-symbolic');
          upBtn.has_frame = false;
          upBtn.valign = Gtk.Align.CENTER;
          upBtn.tooltip_text = 'Mover arriba';
          upBtn.connect('clicked', () => { moveItem(name, -1); rebuild(); });
          row.add_prefix(upBtn);

          const downBtn = Gtk.Button.new_from_icon_name('go-down-symbolic');
          downBtn.has_frame = false;
          downBtn.valign = Gtk.Align.CENTER;
          downBtn.tooltip_text = 'Mover abajo';
          downBtn.connect('clicked', () => { moveItem(name, 1); rebuild(); });
          row.add_prefix(downBtn);

          if (!isSpacer) {
            const hideKey = SYSTEM_ITEM_HIDE_KEYS[name];
            const hideSwitch = new Gtk.Switch({
              active: !settings.get_boolean(hideKey),
              valign: Gtk.Align.CENTER,
            });
            settings.bind(hideKey, hideSwitch, 'active',
              Gio.SettingsBindFlags.INVERT_BOOLEAN);
            row.add_suffix(hideSwitch);
          }

          rows.push(row);
          orderGroup.add(row);
        };
        for (const name of order) addRow(name);
      };
      rebuild();
    },
  });
}

// ══════════════════════════════════════════════════════════════════
//  TOP BAR ORGANIZER
// ══════════════════════════════════════════════════════════════════

const TOP_BAR_ITEM_NAMES = {
  appMenu: 'Menú de aplicación',
  dateMenu: 'Fecha y hora',
  activities: 'Actividades',
  quickSettings: 'Ajustes rápidos',
  a11y: 'Accesibilidad',
  keyboard: 'Distribución del teclado',
  screencastIndicator: 'Grabación de pantalla',
  remoteAccessIndicator: 'Acceso remoto',
  appindicatorContainer: 'Indicadores de aplicación',
};

const TOP_BAR_ITEM_ICONS = {
  appMenu: 'application-x-executable-symbolic',
  dateMenu: 'office-calendar-symbolic',
  activities: 'view-grid-symbolic',
  quickSettings: 'emblem-system-symbolic',
  a11y: 'preferences-desktop-accessibility-symbolic',
  keyboard: 'input-keyboard-symbolic',
  screencastIndicator: 'media-record-symbolic',
  remoteAccessIndicator: 'network-server-symbolic',
};

function getTopBarItemName(role) {
  return TOP_BAR_ITEM_NAMES[role] || role;
}

function getTopBarItemIcon(role) {
  return TOP_BAR_ITEM_ICONS[role] || 'pan-end-symbolic';
}

const TopBarOrganizerRow = GObject.registerClass({
  GTypeName: 'LidSolTopBarOrganizerRow',
}, class TopBarOrganizerRow extends Adw.ActionRow { });

// Visual placeholder for empty lists (DnD handled by list-level DropTarget)
const TopBarOrganizerPlaceholder = GObject.registerClass({
  GTypeName: 'LidSolTopBarOrganizerPlaceholder',
}, class TopBarOrganizerPlaceholder extends Gtk.Box {
  _init(params = {}) {
    super._init(params);
    this.set_orientation(Gtk.Orientation.VERTICAL);
    this.set_hexpand(true);
    this.set_vexpand(true);

    const label = new Gtk.Label({
      label: 'Arrastra elementos aquí',
      sensitive: false,
      opacity: 0.5,
      margin_top: 16,
      margin_bottom: 16,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
    });
    this.append(label);
  }
});

const BOX_NAMES = {
  left: 'Caja izquierda',
  center: 'Caja central',
  right: 'Caja derecha',
};

function openTopBarOrganizerDialog(parentWindow, settings) {
  const getOrder = (box) => {
    try { return settings.get_strv(`tbo-${box}-box-order`); }
    catch (e) { return []; }
  };

  function _createRow(item, settings) {
    const row = new TopBarOrganizerRow();
    row._item = item;
    row.set_title(getTopBarItemName(item));

    const icon = Gtk.Image.new_from_icon_name(getTopBarItemIcon(item));
    icon.pixel_size = 18;
    icon.margin_start = 4;
    icon.margin_end = 4;
    row.add_prefix(icon);

    const dragHandle = Gtk.Image.new_from_icon_name('list-drag-handle-symbolic');
    dragHandle.pixel_size = 14;
    dragHandle.margin_start = 4;
    dragHandle.margin_end = 6;
    dragHandle.opacity = 0.5;
    row.add_prefix(dragHandle);

    const hideList = (() => {
      try { return settings.get_strv('tbo-hide'); }
      catch (e) { return []; }
    })();
    const hideSwitch = new Gtk.Switch({
      active: !hideList.includes(item),
      valign: Gtk.Align.CENTER,
    });
    hideSwitch.connect('notify::active', () => {
      const currentHide = (() => {
        try { return settings.get_strv('tbo-hide'); }
        catch (e) { return []; }
      })();
      const currentShow = (() => {
        try { return settings.get_strv('tbo-show'); }
        catch (e) { return []; }
      })();
      if (hideSwitch.active) {
        const hideIdx = currentHide.indexOf(item);
        if (hideIdx !== -1)
          currentHide.splice(hideIdx, 1);
        if (!currentShow.includes(item))
          currentShow.push(item);
      } else {
        const showIdx = currentShow.indexOf(item);
        if (showIdx !== -1)
          currentShow.splice(showIdx, 1);
        if (!currentHide.includes(item))
          currentHide.push(item);
      }
      settings.delay();
      try {
        settings.set_strv('tbo-hide', currentHide);
        settings.set_strv('tbo-show', currentShow);
      } finally {
        settings.apply();
      }
    });
    row.add_suffix(hideSwitch);

    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
    dragSource.connect('prepare', (_src, _x, _y) => {
      const val = new GObject.Value();
      val.init(TopBarOrganizerRow.$gtype);
      val.set_object(row);
      return Gdk.ContentProvider.new_for_value(val);
    });
    dragSource.connect('drag-begin', (_src, drag) => {
      const alloc = row.get_allocation();
      const iconBox = new Gtk.ListBox();
      iconBox.set_size_request(alloc.width, alloc.height);
      const ghostRow = new Gtk.ListBoxRow();
      const ghostLabel = new Gtk.Label({
        label: row.get_title(),
        margin_start: 8,
        margin_end: 8,
        margin_top: 4,
        margin_bottom: 4,
        xalign: 0,
      });
      ghostRow.set_child(ghostLabel);
      iconBox.append(ghostRow);
      iconBox.drag_highlight_row(ghostRow);
      const dragIcon = Gtk.DragIcon.get_for_drag(drag);
      if (dragIcon) dragIcon.set_child(iconBox);
    });
    row.add_controller(dragSource);

    const dropTarget = new Gtk.DropTarget({
      actions: Gdk.DragAction.MOVE,
      formats: Gdk.ContentFormats.new_for_gtype(TopBarOrganizerRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
      return _handleDrop(value, row, settings);
    });
    row.add_controller(dropTarget);

    return row;
  }

  function _handleDrop(value, targetRow, settings) {
    if (!(value instanceof TopBarOrganizerRow))
      return false;
    if (value === targetRow)
      return false;

    const sourceList = value.get_parent();
    const targetList = targetRow.get_parent();
    if (!sourceList || !targetList)
      return false;

    const role = value._item;
    const sourceIndex = value.get_index();
    const targetBeforeRemove = targetRow.get_index();
    sourceList.remove(value);

    if (sourceList === targetList) {
      const newRow = _createRow(role, settings);
      const insertIndex = sourceIndex < targetBeforeRemove
        ? targetRow.get_index() + 1
        : targetRow.get_index();
      sourceList.insert(newRow, insertIndex);
      _saveListBoxOrder(sourceList, settings);
    } else {
      const newRow = _createRow(role, settings);
      targetList.insert(newRow, targetBeforeRemove);
      _saveBothListBoxOrders(sourceList, targetList, settings);
    }

    return true;
  }

  function _addListBoxDropTarget(listBox, settings) {
    const dropTarget = new Gtk.DropTarget({
      actions: Gdk.DragAction.MOVE,
      formats: Gdk.ContentFormats.new_for_gtype(TopBarOrganizerRow.$gtype),
    });
    dropTarget.connect('drop', (_trg, value, _x, _y) => {
      if (!(value instanceof TopBarOrganizerRow))
        return false;
      const src = value.get_parent();
      if (!src || src === listBox)
        return false;
      const role = value._item;
      src.remove(value);
      const newRow = _createRow(role, settings);
      listBox.append(newRow);
      _saveBothListBoxOrders(src, listBox, settings);
      return true;
    });
    listBox.add_controller(dropTarget);
  }

  function _saveListBoxOrder(listBox, settings) {
    const key = listBox.boxOrder;
    const items = [];
    for (const child of listBox) {
      if (child instanceof TopBarOrganizerRow)
        items.push(child._item);
    }
    settings.delay();
    try {
      settings.set_strv(key, items);
    } finally {
      settings.apply();
    }
  }

  function _saveBothListBoxOrders(listBoxA, listBoxB, settings) {
    const keyA = listBoxA.boxOrder;
    const keyB = listBoxB.boxOrder;
    const itemsA = [];
    const itemsB = [];
    for (const child of listBoxA) {
      if (child instanceof TopBarOrganizerRow)
        itemsA.push(child._item);
    }
    for (const child of listBoxB) {
      if (child instanceof TopBarOrganizerRow)
        itemsB.push(child._item);
    }
    settings.delay();
    try {
      settings.set_strv(keyA, itemsA);
      settings.set_strv(keyB, itemsB);
    } finally {
      settings.apply();
    }
  }

  function _populateListBox(listBox, box, settings) {
    listBox.boxOrder = `tbo-${box}-box-order`;
    const order = getOrder(box);
    for (const name of order) {
      const row = _createRow(name, settings);
      listBox.append(row);
    }
  }

  createDialog({
    window: parentWindow,
    title: 'Ordenar elementos de la barra superior',
    childrenRequest: (page) => {
      const group = new Adw.PreferencesGroup({
        title: 'Orden de la barra superior',
        description: 'Arrastra y suelta para reordenar los elementos entre cajas.',
      });
      page.add(group);

      const resetBtn = Gtk.Button.new_from_icon_name('view-refresh-symbolic');
      resetBtn.has_frame = false;
      resetBtn.valign = Gtk.Align.CENTER;
      resetBtn.tooltip_text = 'Restablecer valores predeterminados';
      resetBtn.connect('clicked', () => {
        const alert = new Adw.AlertDialog({
          heading: 'Restablecer orden predeterminado',
          body: 'Se perderán todos los cambios en el orden y visibilidad de la barra superior.',
        });
        alert.add_response('cancel', 'Cancelar');
        alert.add_response('reset', 'Restablecer');
        alert.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        alert.set_default_response('cancel');
        alert.set_close_response('cancel');
        alert.connect('response', (_dlg, response) => {
          if (response === 'reset') {
            settings.reset('tbo-left-box-order');
            settings.reset('tbo-center-box-order');
            settings.reset('tbo-right-box-order');
            settings.reset('tbo-hide');
            settings.reset('tbo-show');
            _rebuildAll();
          }
        });
        alert.present(parentWindow);
      });
      const headerBox = new Gtk.Box({ spacing: 4 });
      headerBox.append(resetBtn);
      group.header_suffix = headerBox;

      const listBoxes = {};

      for (const box of ['left', 'center', 'right']) {
        const label = new Gtk.Label({
          label: BOX_NAMES[box],
          halign: Gtk.Align.START,
          margin_bottom: 6,
          margin_top: box === 'left' ? 0 : 12,
        });
        group.add(label);

        const listBox = new Gtk.ListBox({
          selection_mode: Gtk.SelectionMode.NONE,
          show_separators: true,
        });
        listBox.add_css_class('boxed-list');
        listBox.set_size_request(-1, 60);
        const placeholder = new TopBarOrganizerPlaceholder();
        placeholder._targetListBox = listBox;
        placeholder._targetBoxOrder = `tbo-${box}-box-order`;
        placeholder._settings = settings;
        listBox.set_placeholder(placeholder);
        group.add(listBox);
        listBoxes[box] = listBox;

        _populateListBox(listBox, box, settings);
        _addListBoxDropTarget(listBox, settings);
      }

      function _rebuildAll() {
        for (const box of ['left', 'center', 'right']) {
          const listBox = listBoxes[box];
          while (listBox.get_first_child())
            listBox.remove(listBox.get_first_child());
          listBox.set_placeholder(null);
          const placeholder = new TopBarOrganizerPlaceholder();
          listBox.set_placeholder(placeholder);
          _populateListBox(listBox, box, settings);
        }
      }
    },
  });
}

export { CATEGORIES };
