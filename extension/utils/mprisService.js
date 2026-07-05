'use strict';

export class MprisService {
    static _instance = null;

    static getDefault() {
        if (!MprisService._instance)
            MprisService._instance = new MprisService();
        return MprisService._instance;
    }

    constructor() {
        this._players = [];
        this._signalHandlers = [];
    }

    get players() {
        return this._players;
    }

    connectObject(...args) {
        const obj = args[args.length - 1];
        for (let i = 0; i < args.length - 1; i += 2) {
            const signal = args[i];
            const handler = typeof args[i + 1] === 'function' ? args[i + 1].bind(obj) : args[i + 1];
            this._signalHandlers.push({ signal, handler, context: obj });
        }
        return obj;
    }

    disconnectObject(obj) {
        this._signalHandlers = this._signalHandlers.filter(h => h.context !== obj);
    }

    destroy() {
        this._players = [];
        this._signalHandlers = [];
        MprisService._instance = null;
    }
}
