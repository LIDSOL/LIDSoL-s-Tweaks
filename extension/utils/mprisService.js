'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

const MPRIS_PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';

// #region Player

var MprisPlayer = GObject.registerClass({
    Properties: {
        'can-play': GObject.ParamSpec.boolean(
            'can-play', null, null,
            GObject.ParamFlags.READWRITE,
            false
        ),
        'can-seek': GObject.ParamSpec.boolean(
            'can-seek', null, null,
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
    Signals: {
        changed: {},
    },
}, class MprisPlayer extends GObject.Object {
    _init(busName) {
        super._init();
        this._busName = busName;
        this._playerProxy = null;
        this._mprisProxy = null;
        this._propertiesProxy = null;

        this._trackId = null;
        this._length = null;
        this._trackArtists = null;
        this._trackTitle = null;
        this._trackCoverUrl = null;
        this._app = null;
        this._lastPlayingTime = 0;

        this._createProxies();
    }

    _createProxies() {
        const playerIface = this._loadIface('org.mpris.MediaPlayer2.Player');
        const mprisIface = this._loadIface('org.mpris.MediaPlayer2');
        const propertiesIface = this._loadIface('org.freedesktop.DBus.Properties');

        const playerPromise = Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.NONE,
            playerIface,
            this._busName,
            '/org/mpris/MediaPlayer2',
            playerIface.name,
            null
        ).then(proxy => {
            this._playerProxy = proxy;
        }).catch(e => {
            console.error(`[MprisService] Player proxy error for ${this._busName}:`, e);
        });

        const mprisPromise = Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.NONE,
            mprisIface,
            this._busName,
            '/org/mpris/MediaPlayer2',
            mprisIface.name,
            null
        ).then(proxy => {
            this._mprisProxy = proxy;
        }).catch(e => {
            console.error(`[MprisService] MPRIS proxy error for ${this._busName}:`, e);
        });

        const propertiesPromise = Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.NONE,
            propertiesIface,
            this._busName,
            '/org/mpris/MediaPlayer2',
            propertiesIface.name,
            null
        ).then(proxy => {
            this._propertiesProxy = proxy;
        }).catch(e => {
            console.error(`[MprisService] Properties proxy error for ${this._busName}:`, e);
        });

        Promise.all([playerPromise, mprisPromise, propertiesPromise])
            .then(() => this._ready())
            .catch(e => {
                console.error(`[MprisService] Proxy init failed for ${this._busName}:`, e);
            });
    }

    _loadIface(name) {
        const xml = this._getIfaceXml(name);
        return Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0];
    }

    _getIfaceXml(name) {
        switch (name) {
        case 'org.mpris.MediaPlayer2.Player':
            return `<node>
                <interface name="org.mpris.MediaPlayer2.Player">
                    <property name="Metadata" type="a{sv}" access="read" />
                    <property name="PlaybackStatus" type="s" access="read" />
                    <property name="CanGoNext" type="b" access="read" />
                    <property name="CanGoPrevious" type="b" access="read" />
                    <property name="CanPlay" type="b" access="read" />
                    <property name="CanPause" type="b" access="read" />
                    <property name="CanSeek" type="b" access="read" />
                    <property name="CanControl" type="b" access="read" />
                    <property name="Position" type="x" access="read" />
                    <method name="PlayPause" />
                    <method name="Next" />
                    <method name="Previous" />
                    <method name="Play" />
                    <method name="Pause" />
                    <method name="Stop" />
                    <method name="SetPosition">
                        <arg type="s" name="TrackId" direction="in" />
                        <arg type="x" name="Position" direction="in" />
                    </method>
                </interface>
            </node>`;
        case 'org.mpris.MediaPlayer2':
            return `<node>
                <interface name="org.mpris.MediaPlayer2">
                    <property name="Identity" type="s" access="read" />
                    <property name="DesktopEntry" type="s" access="read" />
                    <property name="CanRaise" type="b" access="read" />
                    <method name="Raise" />
                </interface>
            </node>`;
        case 'org.freedesktop.DBus.Properties':
            return `<node>
                <interface name="org.freedesktop.DBus.Properties">
                    <method name="Get">
                        <arg type="s" name="interface_name" direction="in" />
                        <arg type="s" name="property_name" direction="in" />
                        <arg type="v" name="value" direction="out" />
                    </method>
                    <method name="Set">
                        <arg type="s" name="interface_name" direction="in" />
                        <arg type="s" name="property_name" direction="in" />
                        <arg type="v" name="value" direction="in" />
                    </method>
                    <method name="GetAll">
                        <arg type="s" name="interface_name" direction="in" />
                        <arg type="a{sv}" name="properties" direction="out" />
                    </method>
                    <signal name="PropertiesChanged">
                        <arg type="s" name="interface_name" />
                        <arg type="a{sv}" name="changed_properties" />
                        <arg type="as" name="invalidated_properties" />
                    </signal>
                </interface>
            </node>`;
        default:
            throw new Error(`Unknown interface: ${name}`);
        }
    }

    // #region State Getters

    get busName() {
        return this._busName;
    }
    get trackId() {
        return this._trackId;
    }
    get length() {
        return this._length;
    }
    get trackArtists() {
        return this._trackArtists;
    }
    get trackTitle() {
        return this._trackTitle;
    }
    get trackCoverUrl() {
        return this._trackCoverUrl;
    }
    get app() {
        return this._app;
    }
    get canGoNext() {
        return this._playerProxy?.CanGoNext ?? false;
    }
    get canGoPrevious() {
        return this._playerProxy?.CanGoPrevious ?? false;
    }
    get playbackStatus() {
        return this._playerProxy?.PlaybackStatus ?? 'Stopped';
    }
    // canPlay and canSeek are GObject properties (see Properties registration above).
    // JS getters are intentionally omitted to avoid conflict with the GObject property system.
    // Setting them via `this.canPlay = value` fires `notify::can-play` which MprisService
    // uses to emit player-added/player-removed.

    // QST compatibility aliases
    get status() {
        return this.playbackStatus;
    }
    get coverArt() {
        return this._trackCoverUrl || '';
    }
    get title() {
        return this._trackTitle || '';
    }
    get artist() {
        return this._trackArtists?.join(', ') || '';
    }

    // #endregion

    // #region Position

    get position() {
        if (!this._propertiesProxy)
            return Promise.resolve(null);
        return this._propertiesProxy.GetAsync(
            'org.mpris.MediaPlayer2.Player',
            'Position'
        ).then(result => {
            return result[0].get_int64();
        }).catch(() => null);
    }

    set position(value) {
        if (!this._playerProxy)
            return;
        this._playerProxy.SetPositionAsync(
            this._trackId,
            Math.min(this._length || Infinity, Math.max(1, value))
        ).catch(() => {});
    }

    // #endregion

    // #region Metadata Parsing

    _parseMetadata(metadata) {
        if (!metadata) {
            this._trackId = null;
            this._length = null;
            this._trackArtists = null;
            this._trackTitle = null;
            this._trackCoverUrl = null;
            return;
        }

        this._trackId = metadata['mpris:trackid']?.get_string()[0] ?? null;

        this._length = metadata['mpris:length']?.deepUnpack() ?? null;

        this._trackArtists = metadata['xesam:artist']?.deepUnpack();
        if (typeof this._trackArtists === 'string')
            this._trackArtists = [this._trackArtists];
        else if (!Array.isArray(this._trackArtists)
            || !this._trackArtists.every(a => typeof a === 'string'))
            this._trackArtists = ['Unknown artist'];

        this._trackTitle = metadata['xesam:title']?.deepUnpack();
        if (typeof this._trackTitle !== 'string')
            this._trackTitle = 'Unknown title';

        this._trackCoverUrl = metadata['mpris:artUrl']?.deepUnpack();
        if (typeof this._trackCoverUrl !== 'string')
            this._trackCoverUrl = null;

        if (this._mprisProxy?.DesktopEntry)
            this._app = Shell.AppSystem.get_default().lookup_app(
                this._mprisProxy.DesktopEntry + '.desktop'
            );
        else
            this._app = null;

        this.canPlay = !!this._playerProxy?.CanPlay;
        this.canSeek = !!this._playerProxy?.CanSeek;
    }

    _update() {
        try {
            const metadata = this._playerProxy?.Metadata;
            this._parseMetadata(metadata);
        } catch (e) {
            console.error(`[MprisService] _update error for ${this._busName}:`, e);
        }
        if (this.playbackStatus === 'Playing')
            this._lastPlayingTime = Date.now();
        this.emit('changed');
    }

    get lastPlayingTime() {
        return this._lastPlayingTime;
    }

    // #endregion

    // #region Playback Control

    play() {
        this._playerProxy?.PlayAsync().catch(() => {});
    }
    pause() {
        this._playerProxy?.PauseAsync().catch(() => {});
    }
    next() {
        this._playerProxy?.NextAsync().catch(() => {});
    }
    prev() {
        this._playerProxy?.PreviousAsync().catch(() => {});
    }
    playPause() {
        this._playerProxy?.PlayPauseAsync().catch(() => {});
    }
    raise() {
        if (this._app) {
            this._app.activate();
        } else if (this._mprisProxy?.CanRaise) {
            this._mprisProxy.RaiseAsync().catch(() => {});
        }
    }
    isPlaying() {
        return this.playbackStatus === 'Playing';
    }

    // #endregion

    // #region Proxy Lifecycle

    _ready() {
        this._mprisProxy.connectObject('notify::g-name-owner', () => {
            if (!this._mprisProxy.g_name_owner)
                this._close();
        }, this);

        if (!this._mprisProxy.g_name_owner) {
            this._close();
            const service = MprisService._instance;
            if (service)
                service._removePlayer(this._busName);
            return;
        }

        this._playerProxy.connectObject(
            'g-properties-changed',
            () => this._update(),
            this
        );

        this._update();
    }

    _close() {
        if (this._mprisProxy)
            this._mprisProxy.disconnectObject(this);
        if (this._playerProxy)
            this._playerProxy.disconnectObject(this);
        this._mprisProxy = null;
        this._playerProxy = null;
        this._propertiesProxy = null;
    }

    destroy() {
        this._close();
    }

    // #endregion
});

// #endregion

// #region Source (Player Manager)

var MprisService = GObject.registerClass({
    Signals: {
        'player-added': { param_types: [GObject.TYPE_OBJECT] },
        'player-removed': { param_types: [GObject.TYPE_OBJECT] },
    },
}, class MprisService extends GObject.Object {
    static _instance = null;

    static getDefault() {
        if (!MprisService._instance) {
            MprisService._instance = new MprisService();
            MprisService._instance.start();
        }
        return MprisService._instance;
    }

    constructor() {
        super();
        this._players = new Map();
        this._proxy = null;
        this._started = false;
    }

    start() {
        if (this._started)
            return;
        this._started = true;

        const dbusIface = this._loadDBusIface();
        try {
            this._proxy = Gio.DBusProxy.new_sync(
                Gio.DBus.session,
                Gio.DBusProxyFlags.NONE,
                dbusIface,
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                null
            );

            this._discoverExisting();

            this._proxy.connectSignal(
                'NameOwnerChanged',
                (proxy, sender, [name, oldOwner, newOwner]) => {
                    this._onNameOwnerChanged(name, oldOwner, newOwner);
                }
            );
        } catch (e) {
            console.error('[MprisService] Failed to create DBus proxy:', e);
        }
    }

    _loadDBusIface() {
        const xml = `<node>
            <interface name="org.freedesktop.DBus">
                <method name="ListNames">
                    <arg type="as" name="names" direction="out" />
                </method>
                <signal name="NameOwnerChanged">
                    <arg type="s" name="name" />
                    <arg type="s" name="old_owner" />
                    <arg type="s" name="new_owner" />
                </signal>
            </interface>
        </node>`;
        return Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0];
    }

    _discoverExisting() {
        try {
            const result = this._proxy.ListNamesSync();
            const names = result[0];
            for (const name of names) {
                if (name.startsWith(MPRIS_PLAYER_PREFIX))
                    this._addPlayer(name);
            }
        } catch (e) {
            console.error('[MprisService] Failed to discover players:', e);
        }
    }

    _onNameOwnerChanged(name, oldOwner, newOwner) {
        if (!name.startsWith(MPRIS_PLAYER_PREFIX))
            return;

        if (oldOwner && oldOwner !== '') {
            const player = this._players.get(name);
            if (player) {
                this._players.delete(name);
                player.disconnectObject(this);
                this.emit('player-removed', player);
            }
        }

        if (newOwner && newOwner !== '')
            this._addPlayer(name);
    }

    _addPlayer(busName) {
        if (this._players.has(busName))
            return;

        const player = new MprisPlayer(busName);
        this._players.set(busName, player);

        player.connectObject('notify::can-play', () => {
            this.emit(
                player.canPlay ? 'player-added' : 'player-removed',
                player
            );
        }, this);
    }

    _removePlayer(busName) {
        const player = this._players.get(busName);
        if (!player)
            return;

        this._players.delete(busName);
        player.disconnectObject(this);
        player.destroy();
        this.emit('player-removed', player);
    }

    getActivePlayer() {
        const players = this.players;
        if (players.length === 0) return null;

        const scored = players.map(p => {
            let score = 0;
            const status = p.playbackStatus;
            const hasTitle = !!p.trackTitle && p.trackTitle !== 'Unknown title';

            if (status === 'Playing' && hasTitle) score = 500;
            else if (status === 'Paused' && hasTitle) score = 100;

            return { player: p, score };
        });

        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.player.lastPlayingTime - a.player.lastPlayingTime;
        });

        if (scored[0].player.playbackStatus !== 'Playing') {
            const playing = scored.find(s =>
                s.player.playbackStatus === 'Playing' && s.score > 0
            );
            if (playing) return playing.player;
        }

        return scored[0].score > 0 ? scored[0].player : null;
    }

    get players() {
        return [...this._players.values()].filter(p => p.canPlay);
    }

    destroy() {
        for (const [name, player] of this._players) {
            player.disconnectObject(this);
            player.destroy();
        }
        this._players.clear();
        if (this._proxy) {
            this._proxy.run_dispose();
            this._proxy = null;
        }
        MprisService._instance = null;
        this._started = false;
    }
});

export { MprisPlayer, MprisService };

// #endregion
