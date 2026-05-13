'use strict';

export class SignalManager {
    constructor() {
        this._signals = new Map();
    }

    destroy() {
        this._signals.clear();
    }
}
