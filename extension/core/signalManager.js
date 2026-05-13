'use strict';

import GObject from 'gi://GObject';

export class SignalManager {
    constructor() {
        this._buffer = [];
    }

    connect(actor, signals, handler) {
        if (signals instanceof Array) {
            signals.forEach(signal => {
                const id = actor.connect(signal, handler);
                this._processConnection(actor, id);
            });
        } else {
            const id = actor.connect(signals, handler);
            this._processConnection(actor, id);
        }
    }

    _processConnection(actor, id) {
        const info = {
            actor: actor,
            id: id
        };

        if (
            actor.connect &&
            (
                !(actor instanceof GObject.Object) ||
                GObject.signal_lookup('destroy', actor)
            )
        ) {
            const destroyId = actor.connect('destroy', () => {
                actor.disconnect(id);
                actor.disconnect(destroyId);

                const index = this._buffer.indexOf(info);
                if (index >= 0) {
                    this._buffer.splice(index, 1);
                }
            });
            info.destroyId = destroyId;
        }

        this._buffer.push(info);
    }

    disconnectAllFor(actor) {
        const actorConnections = this._buffer.filter(
            info => info.actor === actor
        );

        actorConnections.forEach(connection => {
            try {
                connection.actor.disconnect(connection.id);
                if (connection.destroyId !== undefined)
                    connection.actor.disconnect(connection.destroyId);
            } catch (e) {
                console.warn(`[LIDSoL] error removing connection: ${e}; continuing`);
            }

            const index = this._buffer.indexOf(connection);
            if (index >= 0) {
                this._buffer.splice(index, 1);
            }
        });
    }

    disconnectAll() {
        this._buffer.forEach(connection => {
            try {
                connection.actor.disconnect(connection.id);
                if (connection.destroyId !== undefined)
                    connection.actor.disconnect(connection.destroyId);
            } catch (e) {
                console.warn(`[LIDSoL] error removing connection: ${e}; continuing`);
            }
        });

        this._buffer = [];
    }

    destroy() {
        this.disconnectAll();
    }
}
