'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
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

// NOTE: the shell's `gettext` only works once the extension's stateObj exists,
// which is set AFTER this module is imported (see extensionPrefsDialog.js).
// Translations must therefore run lazily (getters), not at module top-level.
const CATEGORIES = [
  {
    id: 'shell',
    icon: 'applications-utilities-symbolic',
    get title() { return _('Tools'); },
    get summary() { return _('Desktop tools'); },
    get description() { return _('Customizable dashboard, quick note capture, and search/launcher settings.'); },
  },
  {
    id: 'quicksettings',
    icon: 'emblem-system-symbolic',
    get title() { return _('Quick Settings'); },
    get summary() { return _('Quick settings menu tweaks'); },
    get description() { return _('User avatar and quick settings improvements.'); },
  },
  {
    id: 'widgets',
    icon: 'applications-graphics-symbolic',
    get title() { return _('Widgets'); },
    get summary() { return _('Visual desktop widgets'); },
    get description() { return _('Desktop widgets: clock, picture, indicators and media controls.'); },
  },
  {
    id: 'topbar',
    icon: 'go-top-symbolic',
    get title() { return _('Top Bar'); },
    get summary() { return _('Top bar customization'); },
    get description() { return _('Rounded corners, workspace indicator, clock format and notifications.'); },
  },
  {
    id: 'general',
    icon: 'emblem-system-symbolic',
    get title() { return _('General'); },
    get summary() { return _('General settings'); },
    get description() { return _('Media player filters and other general options.'); },
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
      description: _('Enable or disable all desktop widgets. (testing)'),
    });
    group.add(createSwitchRow({
      settings: this._settings,
      bindKey: 'background-widgets-enabled',
      title: _('Background Widgets'),
      subtitle: _('Enable desktop widgets'),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'pw-enabled',
      title: _('Picture Widget'),
      subtitle: _('Picture overlaid on the desktop'),
      onDetailed: () => this._openDialog(_('Picture Widget'), p => this._buildPictureWidgetDialog(p)),
      sensitiveBind: 'background-widgets-enabled',
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'background-clock-enabled',
      title: _('Background Clock'),
      subtitle: _('Clock overlaid on the desktop'),
      onDetailed: () => this._openDialog(_('Background Clock'), p => this._buildBackgroundClockDialog(p)),
      sensitiveBind: 'background-widgets-enabled',
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'uadm-enabled',
      title: _('User Avatar (Date Menu)'),
      subtitle: _('User avatar in the date menu, above the calendar'),
      onDetailed: () => this._openDialog(_('User Avatar (Date Menu)'), p => this._buildUserAvatarDateMenuDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dmm-enabled',
      title: _('Date Menu Media'),
      subtitle: _('Media controls in the date menu, above the calendar'),
      onDetailed: () => this._openDialog(_('Date Menu Media'), p => this._buildDateMenuMediaDialog(p)),
    }));
    page.add(group);
  }

  _addTopbarModuleGroup(page) {
    // ── General ──
    const generalGroup = new Adw.PreferencesGroup({
      title: _('General'),
      description: _('Panel organization and appearance.'),
    });
    generalGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'panel-corners-enabled',
      title: _('Panel Corners'),
      subtitle: _('Rounded corners on the panel and screen'),
      onDetailed: () => this._openDialog(_('Panel Corners'), p => this._buildPanelCornersDialog(p)),
    }));
    page.add(generalGroup);

    // ── Panel elements ──
    const elementsGroup = new Adw.PreferencesGroup({
      title: _('Panel elements'),
      description: _('Settings for each element on the top bar.'),
    });

    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'workspace-indicator-enabled',
      title: _('Workspace Indicator'),
      subtitle: _('Workspace indicator in Space Bar style'),
      onDetailed: () => this._openDialog(_('Workspace Indicator'), p => this._buildWorkspaceIndicatorDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'wb-enabled',
      title: _('Workspace Bar'),
      subtitle: _('Workspace bar with window icons (Space Bar style)'),
      onDetailed: () => this._openDialog(_('Workspace Bar'), p => this._buildWorkspaceBarDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'dm-enabled',
      title: _('Date Menu Tweaks'),
      subtitle: _('Custom panel clock format with media indicator'),
      onDetailed: () => this._openDialog(_('Date Menu Tweaks'), p => this._buildDateMenuDialog(p)),
    }));
    elementsGroup.add(createModuleRow({
      settings: this._settings,
      bindKey: 'battery-indicator-enabled',
      title: _('Battery Indicator'),
      subtitle: _('Custom circle and/or bar for the battery on the top bar'),
      onDetailed: () => this._openDialog(_('Battery Indicator'), p => this._buildBatteryIndicatorDialog(p)),
    }));
    page.add(elementsGroup);
  }

  _buildBatteryIndicatorDialog(page) {
    const s = this._settings;

    const mainGroup = new Adw.PreferencesGroup({
      title: _('Style'),
      description: _('Configure the style of the battery indicator.'),
    });
    const styleOptions = {
      'circle': _('Circle'),
      'bar': _('Bar'),
      'both': _('Both'),
    };
    mainGroup.add(createComboRow({
      settings: s, bindKey: 'bi-top-bar-style', title: _('Style'), subtitle: _('Circle, bar, or both'), options: styleOptions,
    }));
    mainGroup.add(createSwitchRow({
      settings: s, bindKey: 'bi-show-percentage',
      title: _('Show percentage'), subtitle: _('Show the percentage next to the indicator'),
    }));
    page.add(mainGroup);

    const barGroup = new Adw.PreferencesGroup({
      title: _('Bar'),
      description: _('Configure the appearance of the battery bar.'),
    });
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-width', title: _('Width'), subtitle: _('Width in pixels'),
      adjProps: { lower: 20, upper: 300, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-height', title: _('Height'), subtitle: _('Height in pixels'),
      adjProps: { lower: 4, upper: 40, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-bar-radius', title: _('Roundness'), subtitle: _('Border radius in pixels'),
      adjProps: { lower: 0, upper: 20, step: 1 },
    }));
    barGroup.add(createSpinButtonRow({
      settings: s, bindKey: 'bi-low-threshold', title: _('Low threshold'), subtitle: _('Percentage that triggers the low battery color'),
      adjProps: { lower: 0, upper: 100, step: 1 },
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-color', title: _('Normal color'), subtitle: _('Empty uses the theme color'),
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-charging-color', title: _('Charging color'), subtitle: _('Empty uses the theme color'),
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-low-color', title: _('Low battery color'), subtitle: _('Empty uses the theme color'),
    }));
    barGroup.add(createColorButtonRow({
      settings: s, bindKey: 'bi-bg-color', title: _('Background color'), subtitle: _('Empty uses the default color'),
    }));
    page.add(barGroup);
  }

  _addGeneralPage(page) {
    const s = this._settings;

    const filterGroup = createGroup({
      parent: page,
      title: _('Media player filter'),
      description: _('Control which media players appear in the widgets.'),
    });

    const filterModel = new Gtk.StringList();
    filterModel.append(_('Disabled'));
    filterModel.append(_('Blacklist (exclude listed)'));
    filterModel.append(_('Whitelist (only allow listed)'));

    const filterModeRow = new Adw.ComboRow({
      title: _('Filter mode'),
      subtitle: _('Off = allow all, Blacklist = exclude the marked ones, Whitelist = only allow the marked ones'),
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
    refreshBtn.tooltip_text = _('Refresh player list');
    headerBox.append(refreshBtn);
    filterGroup.header_suffix = headerBox;

    const switchRows = new Map();
    const playerRows = [];
    const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

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

    // Converts legacy tokens (e.g. "firefox", "io") into stable granular tokens
    // (full bus name, minus any ".instance_…" part) so the filter is per player
    // instead of per substring. Tokens that match no live player are kept as-is
    // (the service still matches them later).
    const migrateFilterTokens = (list, stableNames) => {
      const final = [];
      const pushUnique = (t) => {
        if (!final.includes(t))
          final.push(t);
      };
      for (const token of list) {
        if (token.startsWith(MPRIS_PREFIX)) {
          pushUnique(stableToken(token));
          continue;
        }
        const matches = stableNames.filter(s =>
          s.toLowerCase().includes(token.toLowerCase())
        );
        if (matches.length === 0)
          pushUnique(token);
        else
          for (const s of matches)
            pushUnique(s);
      }
      return final;
    };

    const busSuffix = (name) =>
      name.startsWith(MPRIS_PREFIX) ? name.slice(MPRIS_PREFIX.length) : name;

    // Category for grouping players in the UI: the first segment of the bus
    // suffix ("io.bassi.Amberol" → "io", "GSConnect.motog505GMetrolist" →
    // "GSConnect"). Instance-based players already collapse to their stable
    // token beforehand, so "firefox" stays a single-player category.
    const categoryOf = (name) => busSuffix(name).split('.')[0];

    // Stable filter token for a player: instance-based bus names
    // (e.g. "org.mpris.MediaPlayer2.firefox.instance_1_110") change per process,
    // so strip the ".instance_…" part. The service matches by substring, so the
    // stable token keeps covering every instance.
    const stableToken = (name) => {
      const suffix = name.slice(MPRIS_PREFIX.length);
      const idx = suffix.indexOf('.instance_');
      return idx >= 0 ? MPRIS_PREFIX + suffix.slice(0, idx) : name;
    };

    const fetchPlayerIdentity = (connection, busName, onResult) => {
      connection.call(
        busName, '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties', 'Get',
        new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2', 'Identity']),
        null, Gio.DBusCallFlags.NONE, -1, null,
        (conn, res) => {
          let identity = null;
          try {
            const rr = conn.call_finish(res);
            const variant = rr.deep_unpack()[0];
            if (typeof variant?.deepUnpack() === 'string')
              identity = variant.deepUnpack();
          } catch (e) { /* player may have quit between list and fetch */ }
          onResult(identity);
        }
      );
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
            const busNames = names
              .filter(n => n.startsWith(MPRIS_PREFIX))
              .sort();
            const stableNames = [...new Set(busNames.map(stableToken))];

            // First live bus per stable token (for Identity fetch and display).
            const liveBusFor = new Map();
            for (const b of busNames) {
              const t = stableToken(b);
              if (!liveBusFor.has(t))
                liveBusFor.set(t, b);
            }

            const filterActive = s.get_int('player-filter-mode') !== 0;

            // Persist migrated tokens so the stored filter becomes granular
            // (one stable token per player) instead of substring matches.
            const migrated = migrateFilterTokens(getFilterList(), stableNames);
            if (migrated.join(', ') !== s.get_string('player-filter-list'))
              s.set_string('player-filter-list', migrated.join(', '));

            const detected = new Set(stableNames);
            const configured = migrated.filter(name => !detected.has(name));
            const all = [...stableNames, ...configured];

            if (all.length === 0) {
              const emptyRow = new Adw.ActionRow({
                title: _('No players detected'),
                activatable: false,
              });
              emptyRow.set_opacity(0.5);
              filterGroup.add(emptyRow);
              playerRows.push(emptyRow);
              return;
            }

            // Group players by category (first segment of the bus suffix, so
            // "io.bassi.Amberol" and "io.github.nate_xyz.Resonance" both end
            // up under "io"). Multi-player categories get an expander row with
            // a bulk switch (a macro over the individual tokens) plus one
            // switch per player; single-player categories stay as plain rows.
            const groups = new Map();
            for (const name of all) {
              const cat = categoryOf(name);
              if (!groups.has(cat))
                groups.set(cat, []);
              groups.get(cat).push({
                name,
                isDetected: detected.has(name),
                liveBus: liveBusFor.get(name),
              });
            }

            // Guards the programmatic switch sync below: setting `active`
            // fires notify::active, which must not trigger the handlers.
            let syncing = false;
            const syncGroupSwitch = (catSw, items) => {
              syncing = true;
              catSw.active = items.every(it => isPlayerEnabled(it.name));
              syncing = false;
            };

            for (const [cat, catItems] of [...groups.entries()].sort((a, b) =>
              a[0].localeCompare(b[0]))) {
              catItems.sort((a, b) => a.name.localeCompare(b.name));

              // Category with a single player: plain row with its own switch
              // (a category token would be identical to the player token).
              if (catItems.length === 1) {
                const { name: itemName, isDetected, liveBus } = catItems[0];
                const sw = new Gtk.Switch({
                  active: isPlayerEnabled(itemName),
                  valign: Gtk.Align.CENTER,
                  sensitive: filterActive,
                });
                sw.connect('notify::active', () => {
                  togglePlayer(itemName, sw.active);
                });

                const row = new Adw.ActionRow({
                  title: busSuffix(itemName),
                  subtitle: isDetected && liveBus
                    ? busSuffix(liveBus)
                    : _('Not detected'),
                  activatable: false,
                });
                row.tooltip_text = itemName;
                row.add_suffix(sw);

                if (!isDetected)
                  row.set_opacity(0.5);

                switchRows.set(`player:${itemName}`, { row, sw });
                filterGroup.add(row);
                playerRows.push(row);

                if (isDetected && liveBus) {
                  fetchPlayerIdentity(connection, liveBus, identity => {
                    if (identity)
                      row.title = identity;
                  });
                }
                continue;
              }

              // Category with several players: expander with a bulk switch
              // (macro over the individual tokens) and one row per player.
              const catSw = new Gtk.Switch({
                active: catItems.every(it => isPlayerEnabled(it.name)),
                valign: Gtk.Align.CENTER,
                sensitive: filterActive,
              });
              catSw.connect('notify::active', () => {
                if (syncing)
                  return;
                const list = getFilterList();
                for (const it of catItems) {
                  const idx = list.indexOf(it.name);
                  if (catSw.active && idx === -1)
                    list.push(it.name);
                  else if (!catSw.active && idx !== -1)
                    list.splice(idx, 1);
                }
                saveFilterList(list);
                syncing = true;
                for (const it of catItems) {
                  const entry = switchRows.get(`player:${it.name}`);
                  if (entry)
                    entry.sw.active = isPlayerEnabled(it.name);
                }
                syncing = false;
              });

              const group = new Adw.ExpanderRow({
                title: cat,
                subtitle: _('%d players').format(catItems.length),
              });
              group.add_suffix(catSw);

              for (const { name: itemName, isDetected, liveBus } of catItems) {
                const sw = new Gtk.Switch({
                  active: isPlayerEnabled(itemName),
                  valign: Gtk.Align.CENTER,
                  sensitive: filterActive,
                });
                sw.connect('notify::active', () => {
                  if (syncing)
                    return;
                  togglePlayer(itemName, sw.active);
                  syncGroupSwitch(catSw, catItems);
                });

                const row = new Adw.ActionRow({
                  title: busSuffix(itemName),
                  subtitle: isDetected && liveBus
                    ? busSuffix(liveBus)
                    : _('Not detected'),
                  activatable: false,
                });
                row.tooltip_text = itemName;
                row.add_suffix(sw);

                if (!isDetected)
                  row.set_opacity(0.5);

                switchRows.set(`player:${itemName}`, { row, sw });
                group.add_row(row);

                if (isDetected && liveBus) {
                  fetchPlayerIdentity(connection, liveBus, identity => {
                    if (identity)
                      row.title = identity;
                  });
                }
              }

              switchRows.set(`group:${cat}`, { row: group, sw: catSw });
              filterGroup.add(group);
              playerRows.push(group);
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
      title: _('Dashboard'),
      subtitle: _('Panel with general widgets'),
      onDetailed: () => this._openDialog(_('Dashboard'), p => this._buildDashboardDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'qt-enabled',
      title: _('Quick Text'),
      subtitle: _('Quick note capture with keyboard shortcut'),
      onDetailed: () => this._openDialog(_('Quick Text'), p => this._buildQuickTextDialog(p)),
    }));
    group.add(createModuleRow({
      settings: this._settings,
      bindKey: 'launcher-enabled',
      title: _('Launcher'),
      subtitle: _('Shortcut to open the Overview search (search mode)'),
      onDetailed: () => this._openDialog(_('Launcher'), p => this._buildLauncherDialog(p)),
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
    const panelGroup = createGroup({ parent: page, title: _('Panel Corners'), description: _('Rounded corners on the bottom of the panel') });
    this._addEnableSubSwitch(panelGroup, s, 'panel-corners', _('Enable Panel Corners'));
    panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-radius', title: _('Radius'), subtitle: _('Recommended: 12px'), adjProps: { lower: 0, upper: 25 } }));
    panelGroup.add(createColorButtonRow({ settings: s, bindKey: 'panel-corner-background-color', title: _('Color'), subtitle: _('Recommended: black') }));
    panelGroup.add(createSpinButtonRow({ settings: s, bindKey: 'panel-corner-opacity', title: _('Opacity'), adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
    const screenGroup = createGroup({ parent: page, title: _('Screen Corners'), description: _('Rounded corners around the screen') });
    this._addEnableSubSwitch(screenGroup, s, 'screen-corners', _('Enable Screen Corners'));
    screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-radius', title: _('Radius'), subtitle: _('Recommended: 12px'), adjProps: { lower: 0, upper: 25 } }));
    screenGroup.add(createColorButtonRow({ settings: s, bindKey: 'screen-corner-background-color', title: _('Color') }));
    screenGroup.add(createSpinButtonRow({ settings: s, bindKey: 'screen-corner-opacity', title: _('Opacity'), adjProps: { lower: 0, upper: 1, step: 0.1, digits: 2 } }));
    const advGroup = createGroup({ parent: page, title: _('Advanced options') });
    advGroup.add(createSwitchRow({ settings: s, bindKey: 'force-extension-values', title: _('Force extension values'), subtitle: _('Overrides the current theme preferences') }));
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

    const pathGroup = createGroup({ parent: page, title: _('Picture'), description: _('Folder with pictures to show on the desktop. A random picture is chosen.') });
    const folderRow = new Adw.ActionRow({ title: _('Pictures folder'), subtitle: s.get_string('pw-image-path') || _('No folder selected') });
    const folderBtn = new Gtk.Button({ label: _('Browse'), valign: Gtk.Align.CENTER });
    folderBtn.connect('clicked', () => {
      const dialog = new Gtk.FileChooserDialog({
        title: _('Select pictures folder'),
        transient_for: page.get_root(),
        modal: true,
        action: Gtk.FileChooserAction.SELECT_FOLDER,
      });
      dialog.add_button('_Cancel', Gtk.ResponseType.CANCEL);
      dialog.add_button('_Open', Gtk.ResponseType.OK);
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

    const sizeGroup = createGroup({ parent: page, title: _('Size') });
    sizeGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-size', title: _('Base size'), subtitle: _('Combined with the aspect ratio'), adjProps: { lower: 10, upper: 2000, step: 10 } }));
    sizeGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-aspect-ratio', title: _('Aspect ratio'), subtitle: _('Width / Height (1.0 = square)'), adjProps: { lower: 0.1, upper: 10, step: 0.1, digits: 2 } }));

    const posGroup = createGroup({ parent: page, title: _('Position') });
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-position-x', title: _('Position X'), subtitle: _('Pixels from the left edge'), adjProps: { lower: 0, upper: 10000, step: 5 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-position-y', title: _('Position Y'), subtitle: _('Pixels from the top edge'), adjProps: { lower: 0, upper: 10000, step: 5 } }));

    const appearGroup = createGroup({ parent: page, title: _('Appearance') });
    appearGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-corner-radius', title: _('Corner radius'), subtitle: _('Percentage (0 = no rounded corners)'), adjProps: { lower: 0, upper: 100, step: 5 } }));

    const advGroup = createGroup({ parent: page, title: _('Advanced') });
    advGroup.add(createSpinButtonRow({ settings: s, bindKey: 'pw-refresh-interval', title: _('Rotation interval'), subtitle: _('Seconds (0 = no automatic change)'), adjProps: { lower: 0, upper: 86400, step: 10 } }));
  }

  _buildBackgroundClockDialog(page) {
    const s = this._settings;
    const posGroup = createGroup({ parent: page, title: _('Position') });
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-position', title: _('Position'), subtitle: _('0=top-left … 8=bottom-right'), adjProps: { lower: 0, upper: 8 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-x-offset', title: _('Horizontal offset'), adjProps: { lower: -500, upper: 500 } }));
    posGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-y-offset', title: _('Vertical offset'), adjProps: { lower: -500, upper: 500 } }));
    const clockGroup = createGroup({ parent: page, title: _('Clock') });
    this._addEnableSubSwitch(clockGroup, s, 'background-clock-enable-clock', _('Show clock'));
    clockGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-clock-format', title: _('Format'), subtitle: _('%H:%M (24h) or %I:%M %p (12h)') }));
    clockGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-clock-size', title: _('Size'), subtitle: _('Font size in points'), adjProps: { lower: 8, upper: 200, step: 2 } }));
    clockGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-clock-color', title: _('Color') }));
    this._addFontToggleRow(clockGroup, s, 'background-clock-clock-custom-font', 'background-clock-clock-font', _('Custom font'));
    const dateGroup = createGroup({ parent: page, title: _('Date') });
    this._addEnableSubSwitch(dateGroup, s, 'background-clock-enable-date', _('Show date'));
    dateGroup.add(createEntryRow({ settings: s, bindKey: 'background-clock-date-format', title: _('Format'), subtitle: _('%A, %d de %B') }));
    dateGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-date-size', title: _('Size'), adjProps: { lower: 8, upper: 200, step: 2 } }));
    dateGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-date-color', title: _('Color') }));
    this._addFontToggleRow(dateGroup, s, 'background-clock-date-custom-font', 'background-clock-date-font', _('Custom font'));
    const bgGroup = createGroup({ parent: page, title: _('Container'), description: _('Clock background style') });
    bgGroup.add(createColorButtonRow({ settings: s, bindKey: 'background-clock-bg-color', title: _('Background color'), subtitle: _('Use alpha for a semi-transparent background'), useAlpha: true }));
    bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-padding', title: _('Padding'), adjProps: { lower: 0, upper: 100, step: 2 } }));
    bgGroup.add(createSpinButtonRow({ settings: s, bindKey: 'background-clock-bg-border-radius', title: _('Border radius'), adjProps: { lower: 0, upper: 50 } }));
  }

  _buildQuickTextDialog(page) {
    const s = this._settings;
    const group = createGroup({ parent: page, title: _('Quick Text'), description: _('Quick note capture with keyboard shortcut') });
    const hotkeyRow = new Adw.ActionRow({ title: _('Keyboard shortcut'), subtitle: _('Key combination to open the notes dialog') });
    const hotkeyLabel = new Gtk.ShortcutLabel({
      accelerator: s.get_strv('qt-hotkey')[0] ?? null,
      valign: Gtk.Align.CENTER,
    });
    const hotkeyBtn = new Gtk.Button({ label: _('Set shortcut'), valign: Gtk.Align.CENTER });
    hotkeyBtn.connect('clicked', () => {
      const dialog = new Gtk.Dialog({
        title: _('Set shortcut'),
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
      box.append(new Gtk.Label({ label: _('Enter a key combination:'), marginBottom: 12 }));
      box.append(new Gtk.Label({
        label: _('Esc to cancel, Backspace to disable'),
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
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-multiline', title: _('Single-line input'), subtitle: _('If enabled, Enter saves the note directly') }));
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-hideacted', title: _('Hide processed notes'), subtitle: _('Hides notes marked as processed in the actions window') }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-filepath', title: _('Notes file'), subtitle: _('Absolute path to the text file') }));
    group.add(createEntryRow({ settings: s, bindKey: 'qt-prepend', title: _('Prefix'), subtitle: _('Text before each note (empty = current date)') }));
    group.add(createSwitchRow({ settings: s, bindKey: 'qt-linebreak', title: _('Line break'), subtitle: _('Adds a line break after the prefix.\nIf disabled, the prefix and the note go on the same line.') }));
    const appendRow = createEntryRow({ settings: s, bindKey: 'qt-append', title: _('Separator'), subtitle: _('Text that separates notes in the file') });
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
      title: _('Separator'),
      subtitle: _('Adds a separator between notes. If empty, leaves an extra line'),
    }));
    group.add(appendRow);
  }

  _buildDashboardDialog(page) {
    const s = this._settings;

    const _alignModel = new Gtk.StringList({ strings: [_('Fill'), _('Start'), _('Center'), _('End')] });


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
      expander.add_row(_makeExpandRow(_('Background'), `${prefix}-background`));
      if (extraRows) extraRows(expander);
      return expander;
    }

    // ── Dash group ──
    const dashGroup = new Adw.PreferencesGroup({ title: _('Dash') });

    const shortcutRow = new Adw.ActionRow({ title: _('Shortcut Hotkey') });
    const shortcutLabel = new Gtk.ShortcutLabel({
      accelerator: s.get_strv('dashboard-shortcut')[0] ?? null,
      valign: Gtk.Align.CENTER,
    });
    const shortcutBtn = new Gtk.Button({ label: _('Set Hotkey'), valign: Gtk.Align.CENTER });
    shortcutBtn.connect('clicked', () => {
      const dialog = new Gtk.Dialog({
        title: _('Set Hotkey'),
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
      box.append(new Gtk.Label({ label: _('Press a key combination:'), marginBottom: 12 }));
      box.append(new Gtk.Label({
        label: _('Esc to cancel, Backspace to disable'),
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

    dashGroup.add(_makeAlignRow(_('X Align'), 'dashboard-x-align'));
    dashGroup.add(_makeAlignRow(_('Y Align'), 'dashboard-y-align'));
    dashGroup.add(_makeSpinRow(_('X Offset'), 'dashboard-x-offset', -1000, 1000, 10));
    dashGroup.add(_makeSpinRow(_('Y Offset'), 'dashboard-y-offset', -1000, 1000, 10));
    dashGroup.add(_makeExpandRow(_('Darken Background'), 'dashboard-darken'));
    dashGroup.add(_makeExpandRow(_('Transparent Container'), 'dashboard-container-transparent'));
    dashGroup.add(_makeSpinRow(_('Container Scale (%)'), 'dashboard-dialog-scale', 50, 150, 5));
    page.add(dashGroup);

    // ── Grid group ──
    const gridGroup = new Adw.PreferencesGroup({ title: _('Grid Layout') });
    gridGroup.add(_makeSpinRow(_('Spacing'), 'dashboard-grid-spacing', 0, 60, 1));
    gridGroup.add(_makeSpinRow(_('Columns'), 'dashboard-grid-columns', 1, 6, 1));

    const resetLayoutRow = new Adw.ActionRow({
      title: _('Reset Layout'),
      subtitle: _('Restore the default grid layout'),
    });
    const resetLayoutBtn = new Gtk.Button({ label: _('Reset'), valign: Gtk.Align.CENTER });
    resetLayoutBtn.connect('clicked', () => {
      s.reset('dashboard-layout-json');
    });
    resetLayoutRow.add_suffix(resetLayoutBtn);
    gridGroup.add(resetLayoutRow);
    page.add(gridGroup);

    // ── Widgets group ──
    const widgetsGroup = new Adw.PreferencesGroup({ title: _('Widgets') });
    page.add(widgetsGroup);

    widgetsGroup.add(_makeWidgetExpander('user', _('User'), exp => {
      exp.add_row(_makeSpinRow(_('Icon Roundness'), 'dashboard-user-icon-roundness', 1, 99, 1));
      exp.add_row(_makeSpinRow(_('Icon Width'), 'dashboard-user-icon-width', 10, 150, 2));
      exp.add_row(_makeSpinRow(_('Icon Height'), 'dashboard-user-icon-height', 10, 150, 2));
      exp.add_row(_makeSpinRow(_('Text Spacing'), 'dashboard-user-text-spacing', 0, 80, 1));
      exp.add_row(_makeExpandRow(_('Vertical'), 'dashboard-user-vertical'));
      exp.add_row(_makeExpandRow(_('Show User Name'), 'dashboard-user-real-name'));
    }));

    widgetsGroup.add(_makeWidgetExpander('levels', _('System Levels'), exp => {
      exp.add_row(_makeSpinRow(_('Width'), 'dashboard-levels-fixed-width', 300, 530, 5));
      exp.add_row(_makeExpandRow(_('Show Battery'), 'dashboard-levels-show-battery'));
      exp.add_row(_makeExpandRow(_('Show Storage'), 'dashboard-levels-show-storage'));
      exp.add_row(_makeExpandRow(_('Show CPU'), 'dashboard-levels-show-cpu'));
      exp.add_row(_makeExpandRow(_('Show RAM'), 'dashboard-levels-show-ram'));
      exp.add_row(_makeExpandRow(_('Show Temperature'), 'dashboard-levels-show-temp'));

      const commandEntry = new Gtk.Entry({
        text: s.get_string('dashboard-levels-command'),
        valign: Gtk.Align.CENTER,
      });
      const cf = new Gtk.EventControllerFocus();
      cf.connect('leave', () => s.set_string('dashboard-levels-command', commandEntry.get_buffer().text));
      commandEntry.add_controller(cf);
      const commandRow = new Adw.ActionRow({ title: _('Command'), activatable_widget: commandEntry });
      commandRow.add_suffix(commandEntry);
      exp.add_row(commandRow);
    }));

    widgetsGroup.add(_makeWidgetExpander('media', _('Media Player'), exp => {
      const preferEntry = new Gtk.Entry({ text: s.get_string('dashboard-media-prefer'), valign: Gtk.Align.CENTER });
      const pf = new Gtk.EventControllerFocus();
      pf.connect('leave', () => s.set_string('dashboard-media-prefer', preferEntry.get_buffer().text));
      preferEntry.add_controller(pf);
      const preferRow = new Adw.ActionRow({ title: _('Prefer'), activatable_widget: preferEntry });
      preferRow.add_suffix(preferEntry);
      exp.add_row(preferRow);

      const styleModel = new Gtk.StringList({ strings: [_('Normal Vertical'), _('Normal Horizontal'), _('Full')] });
      const styleRow = new Adw.ComboRow({ title: _('Style'), model: styleModel, selected: s.get_int('dashboard-media-style') });
      styleRow.connect('notify::selected', () => s.set_int('dashboard-media-style', styleRow.selected));
      exp.add_row(styleRow);

      exp.add_row(_makeSpinRow(_('Cover Width'), 'dashboard-media-cover-width', 100, 800, 5));
      exp.add_row(_makeSpinRow(_('Cover Height'), 'dashboard-media-cover-height', 100, 800, 5));
      exp.add_row(_makeSpinRow(_('Cover Roundness'), 'dashboard-media-cover-roundness', 0, 48, 1));
      exp.add_row(_makeExpandRow(_('Fade'), 'dashboard-media-fade'));
      exp.add_row(_makeExpandRow(_('Show Text'), 'dashboard-media-show-text'));

      exp.add_row(_makeExpandRow(_('Show Loop and Shuffle'), 'dashboard-media-show-loop-shuffle'));
    }));

    widgetsGroup.add(_makeWidgetExpander('clock', _('Clock'), exp => {
      exp.add_row(_makeExpandRow(_('Vertical'), 'dashboard-clock-vertical'));
      exp.add_row(_makeSpinRow(_('Time Size'), 'dashboard-clock-clock-size', 8, 200, 2));
      exp.add_row(_makeSpinRow(_('Date Size'), 'dashboard-clock-date-size', 8, 100, 1));
      exp.add_row(_makeSpinRow(_('Spacing'), 'dashboard-clock-spacing', 0, 50, 1));
    }));

    widgetsGroup.add(_makeWidgetExpander('apps', _('App Launcher'), exp => {
      exp.add_row(_makeSpinRow(_('Rows'), 'dashboard-apps-rows', 1, 6, 1));
      exp.add_row(_makeSpinRow(_('Columns'), 'dashboard-apps-cols', 1, 6, 1));
      exp.add_row(_makeSpinRow(_('Icon Size'), 'dashboard-apps-icon-size', 4, 100, 2));
    }));

    widgetsGroup.add(_makeWidgetExpander('system', _('Settings & System'), exp => {
      const layoutModel = new Gtk.StringList({ strings: [_('Stacked'), _('Side by Side')] });
      const layoutRow = new Adw.ComboRow({ title: _('Layout'), subtitle: _('Stacked: two rows (current behavior).\nSide by Side: single row.'), model: layoutModel, selected: s.get_int('dashboard-system-layout') });
      layoutRow.connect('notify::selected', () => s.set_int('dashboard-system-layout', layoutRow.selected));
      exp.add_row(layoutRow);
      exp.add_row(_makeSpinRow(_('Icon Size'), 'dashboard-system-icon-size', 4, 100, 2));
    }));
  }

  _buildUserAvatarDateMenuDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: _('User Avatar (Date Menu)'), description: _('Shows the avatar and user name in the date menu, above the calendar.') });
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-enabled', title: _('Enable avatar in date menu') }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-show-realname', title: _('Show real name') }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'uadm-show-username', title: _('Show user name') }));
  }

  _buildDateMenuMediaDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: _('Date Menu Media'), description: _('Media control widget in the date menu, above the calendar.') });
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-enabled', title: _('Enable media widget') }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'nm-enabled', title: _('Hide native media indicators'), subtitle: _('Hides the native media controls from notifications, inside the date menu') }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-auto-switch', title: _('Automatically switch to the last playing media'), subtitle: _('Always show the active media, even over the manual selection') }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-art', title: _('Show album art') }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-art-size', title: _('Art size'), adjProps: { lower: 31, upper: 110, step: 1 } }));
    mainGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-album-roundness', title: _('Art roundness'), subtitle: _('Border roundness of the album art (1-99 pixels)'), adjProps: { lower: 1, upper: 99, step: 1 } }));
    mainGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-compact', title: _('Compact mode'), subtitle: _('Reduces the widget spacing') }));

    const controlsGroup = createGroup({ parent: page, title: _('Controls'), description: _('Visibility and appearance of the media control buttons.') });
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-prev', title: _('Show previous button') }));
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-pause', title: _('Show pause/play button') }));
    controlsGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-show-next', title: _('Show next button') }));
    controlsGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-control-opacity', title: _('Controls opacity'), adjProps: { lower: 0, upper: 255, step: 5 } }));

    const progressGroup = createGroup({ parent: page, title: _('Progress bar'), description: _('Progress bar settings with elapsed time.') });
    progressGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-progress-enabled', title: _('Show progress bar') }));
    const styleModel = new Gtk.StringList({ strings: ['slim', 'default'] });
    const styleRow = new Adw.ComboRow({ title: _('Style'), subtitle: _('Progress bar style'), model: styleModel, selected: s.get_string('dmm-progress-style') === 'default' ? 1 : 0 });
    styleRow.connect('notify::selected', () => {
      s.set_string('dmm-progress-style', styleRow.selected === 1 ? 'default' : 'slim');
    });
    progressGroup.add(styleRow);
    progressGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-slider-handle-radius', title: _('Handle radius'), subtitle: _('0 = hide handle'), adjProps: { lower: 0, upper: 20, step: 1 } }));
    progressGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-slider-bar-height', title: _('Bar height'), adjProps: { lower: 2, upper: 20, step: 1 } }));
    progressGroup.add(createEntryRow({ settings: s, bindKey: 'dmm-slider-active-color', title: _('Active color'), subtitle: _('CSS color or empty to use the theme accent') }));
    progressGroup.add(createEntryRow({ settings: s, bindKey: 'dmm-slider-background-color', title: _('Background color'), subtitle: _('CSS color of the inactive part') }));

    const gradientGroup = createGroup({ parent: page, title: _('Gradient from art'), description: _('Extracts the dominant color from the album art and applies it as a gradient background.') });
    gradientGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-gradient-enabled', title: _('Enable gradient') }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-start-opaque', title: _('Start opacity'), adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-start-mix', title: _('Start mix'), subtitle: _('How much of the extracted color is mixed at the start (0-1000)'), adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-end-opaque', title: _('End opacity'), adjProps: { lower: 0, upper: 1000, step: 50 } }));
    gradientGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-gradient-end-mix', title: _('End mix'), subtitle: _('How much of the extracted color is mixed at the end (0-1000)'), adjProps: { lower: 0, upper: 1000, step: 50 } }));

    const roundGroup = createGroup({ parent: page, title: _('Rounded clip'), description: _('Clips the corners of the media widget.') });
    roundGroup.add(createSwitchRow({ settings: s, bindKey: 'dmm-round-clip-enabled', title: _('Enable rounded clip') }));
    roundGroup.add(createSpinButtonRow({ settings: s, bindKey: 'dmm-round-clip-radius', title: _('Corner radius'), adjProps: { lower: 0, upper: 48, step: 1 } }));
  }

  _buildLauncherDialog(page) {
    const s = this._settings;
    const mainGroup = createGroup({ parent: page, title: _('Launcher'), description: _('Opens the native Overview search (search mode) with a keyboard shortcut.') });
    mainGroup.add(createKeyboardShortcutRow({ settings: s, bindKey: 'launcher-hotkey', title: _('Keyboard shortcut'), subtitle: _('Key combination to open the Overview search (search mode)') }));
    const overviewGroup = createGroup({ parent: page, title: _('Overview'), description: _('Settings related to the overview') });
    overviewGroup.add(createSwitchRow({ settings: s, bindKey: 'launcher-hide-search', title: _('Hide search bar'), subtitle: _('Hides the "Type to search" field in the Overview. It appears when you start typing.') }));

    const cmdGroup = createGroup({ parent: page, title: _('Commands'), description: _('Commands executable from the search by typing ":name"') });
    const addBtn = new Gtk.Button({ label: _('Add') });
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
      const editBtn = new Gtk.Button({ icon_name: 'document-edit-symbolic', css_classes: ['flat'], valign: Gtk.Align.CENTER, tooltip_text: _('Edit') });
      editBtn.connect('clicked', () => this._addLauncherCommandDialog(s, listBox, index));
      box.append(editBtn);
      const delBtn = new Gtk.Button({ icon_name: 'user-trash-symbolic', css_classes: ['flat', 'error'], valign: Gtk.Align.CENTER, tooltip_text: _('Delete') });
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
      heading: isEdit ? _('Edit command') : _('Add command'),
      body: _('Typing ":$name" in the search will run the command.'),
      modal: true,
      transient_for: this._getWindow(),
    });

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 8 });
    const nameEntry = new Gtk.Entry({ placeholder_text: _('Name (without ":")'), text: existing ? existing.name : '' });
    const cmdEntry = new Gtk.Entry({ placeholder_text: _('Bash command (e.g. notify-send "Hello")'), text: existing ? existing.command : '' });

    const iconRow = new Adw.ActionRow({ title: _('Icon'), subtitle: _('Symbolic icon name (empty = default)') });
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
      label: _('More icons'),
      valign: Gtk.Align.CENTER,
    });
    const iconRefRow = new Adw.ActionRow({
      title: _('Suggestions'),
      subtitle: _('utilities-terminal-symbolic, system-search-symbolic, starred-symbolic, audio-headphones-symbolic, …'),
    });
    iconRefRow.add_suffix(iconRefLink);

    content.append(nameEntry);
    content.append(cmdEntry);
    content.append(iconRow);
    content.append(iconRefRow);
    dialog.set_extra_child(content);

    const saveResponse = 'save';
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response(saveResponse, isEdit ? _('Save') : _('Add'));
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

    // ── Formats ──────────────────────────────────────────────────
    const formatGroup = createGroup({
      parent: page,
      title: _('Formats'),
      description: _('Customize the clock format on the panel.'),
    });
    formatGroup.add(createEntryRow({
      settings: s,
      bindKey: 'dm-format',
      title: _('Date and time format'),
      subtitle: _('E.g. %B %d, %I:%M:%S %p'),
    }));

    const completeFormatRow = createEntryRow({
      settings: s,
      bindKey: 'dm-complete-format',
      title: _('Date menu + Media'),
      subtitle: _('Format for the Multimedia + Clock mode\n(max 10 characters)'),
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
      title: _('Swap order'),
      subtitle: _('Shows the media information first and then the clock (full view only)'),
    });
    const updateSwapSensitive = () => {
      swapRow.sensitive = s.get_boolean('dm-show-media') && s.get_int('dm-media-layout') === 2;
    };
    s.connect('changed::dm-show-media', updateSwapSensitive);
    s.connect('changed::dm-media-layout', updateSwapSensitive);
    updateSwapSensitive();
    formatGroup.add(swapRow);

    // ── Media ────────────────────────────────────────────────────
    const mediaGroup = createGroup({
      parent: page,
      title: _('Media'),
      description: _('Control how media playback information is shown in the panel.'),
    });

    function bindMaster(row) {
      s.bind('dm-show-media', row, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    }

    const mediaSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-media',
      title: _('Media module'),
      subtitle: _('Shows the current track information in the panel during playback'),
    });
    mediaGroup.add(mediaSwitch);

    const layoutRow = this._createLayoutRow(s);
    bindMaster(layoutRow);
    mediaGroup.add(layoutRow);

    const playingOnlyRow = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-media-playing-only',
      title: _('Only show during playback'),
      subtitle: _('If inactive, media information is shown even when the media is paused'),
    });
    bindMaster(playingOnlyRow);
    mediaGroup.add(playingOnlyRow);

    // — Text lengths —
    const titleLenRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-title-max-length',
      title: _('Title length'),
      subtitle: _('Maximum characters for the track title (5-30)'),
      adjProps: { lower: 5, upper: 30 },
    });
    bindMaster(titleLenRow);
    mediaGroup.add(titleLenRow);

    const artistLenRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-artist-max-length',
      title: _('Artist length'),
      subtitle: _('Maximum characters for the artist name (5-30)'),
      adjProps: { lower: 5, upper: 30 },
    });
    bindMaster(artistLenRow);
    mediaGroup.add(artistLenRow);

    // — Album art —
    const artSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-show-art',
      title: _('Show album art'),
      subtitle: _('Shows the album art next to the track information'),
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
      title: _('Art cache size'),
      subtitle: _('Maximum disk storage limit (MB). Old covers are removed automatically.'),
      adjProps: { lower: 1, upper: 500, step: 5 },
    });
    const updateArtCacheSensitive = () => {
      artCacheRow.sensitive = s.get_boolean('dm-show-media') && s.get_boolean('dm-show-art');
    };
    s.connect('changed::dm-show-media', updateArtCacheSensitive);
    s.connect('changed::dm-show-art', updateArtCacheSensitive);
    updateArtCacheSensitive();
    mediaGroup.add(artCacheRow);

    // — Visualizer —
    const visEnabledSwitch = createSwitchRow({
      settings: s,
      bindKey: 'dm-visualizer-enabled',
      title: _('Enable visualizer'),
      subtitle: _('Shows the audio visualizer during playback'),
    });
    bindMaster(visEnabledSwitch);
    mediaGroup.add(visEnabledSwitch);

    const visStyleRow = this._createVisualizerStyleRow(s);
    const visPosRow = this._createVisPositionRow(s);
    const barsRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-visualizer-bars',
      title: _('Bars'),
      subtitle: _('Number of visualizer bars'),
      adjProps: { lower: 2, upper: 16 },
    });
    const heightRow = createSpinButtonRow({
      settings: s,
      bindKey: 'dm-visualizer-height',
      title: _('Height'),
      subtitle: _('Visualizer height in pixels'),
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
      '0': _('Media view'),
      '1': _('Clock view'),
      '2': _('Clock + Media'),
    };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: _('Layout'),
      subtitle: _('Media (text only), Clock (clock+art+visualizer), Full (text+clock)'),
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
    const options = { '1': _('Wave'), '2': _('Beat'), '3': _('Cava') };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: _('Visualizer style'),
      subtitle: _('Wave (sine), Beat (pulse), Cava (FFT, requires cava)'),
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
    const options = { '0': _('Left'), '1': _('Right') };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: _('Art position'),
      subtitle: _('Places the album art to the left or right of the text'),
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
    const options = { '0': _('Left'), '1': _('Right') };
    for (const id in options)
      model.append(new DropDownChoice({ id, title: options[id] }));

    const row = new Adw.ComboRow({
      title: _('Visualizer position'),
      subtitle: _('Places the visualizer to the left or right of the text'),
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
    group.add(createEntryRow({ settings, bindKey: fontKey, title: _('Font'), subtitle: _('Font name (e.g. Monospace)') }));
  }
}

export { CATEGORIES };