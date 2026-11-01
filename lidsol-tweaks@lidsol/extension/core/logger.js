'use strict';

export class Logger {
    static log(...args) {
        log(`[LIDSoL Widgets]`, ...args);
    }

    static error(...args) {
        logError(`[LIDSoL Widgets]`, ...args);
    }
}
