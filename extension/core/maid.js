'use strict';

const TaskType = {
    Connect: 0,
    Function: 1,
    Dispose: 2,
    RunDispose: 3,
    Destroy: 4,
    Patch: 5,
    Hide: 6,
};

const Priority = {
    High: 2000,
    Default: 0,
    Low: -2000,
};

export default class Maid {
    constructor() {
        this._records = null;
    }

    _getRecords() {
        if (!this._records)
            this._records = [];
        return this._records;
    }

    connectJob(signalObject, signalName, handleFunc, priority = 0) {
        if (!signalObject) return;
        const id = signalObject.connect(signalName, handleFunc);
        this._getRecords().push([TaskType.Connect, priority, signalObject, id]);
        return id;
    }

    functionJob(func, priority = 0) {
        this._getRecords().push([TaskType.Function, priority, func]);
    }

    disposeJob(object, priority = 0) {
        if (!object) return;
        this._getRecords().push([TaskType.Dispose, priority, object]);
        return object;
    }

    runDisposeJob(object, priority = 0) {
        if (!object) return;
        this._getRecords().push([TaskType.RunDispose, priority, object]);
        return object;
    }

    destroyJob(object, priority = 0) {
        if (!object) return;
        this._getRecords().push([TaskType.Destroy, priority, object]);
        return object;
    }

    patchJob(patchObject, patchName, handleFunc, priority = 0) {
        if (!patchObject) return;
        const original = patchObject[patchName];
        patchObject[patchName] = handleFunc;
        this._getRecords().push([TaskType.Patch, priority, patchObject, patchName, original]);
    }

    hideJob(patchObject, undo = null, priority = 0) {
        if (!patchObject) return;
        const original = patchObject.visible;
        const connection = patchObject.connect('show', () => {
            patchObject.hide();
        });
        patchObject.hide();
        this._getRecords().push([TaskType.Hide, priority, patchObject, connection, original, undo]);
    }

    clear() {
        if (!this._records) return;
        const sorted = [...this._records].sort((a, b) => b[1] - a[1]);
        for (const record of sorted) {
            const type = record[0];
            switch (type) {
                case TaskType.Connect:
                    record[2].disconnect(record[3]);
                    break;
                case TaskType.Function:
                    record[2]();
                    break;
                case TaskType.Dispose:
                    record[2]?.dispose?.();
                    break;
                case TaskType.RunDispose:
                    record[2]?.run_dispose?.();
                    break;
                case TaskType.Destroy:
                    record[2]?.destroy?.();
                    break;
                case TaskType.Patch:
                    record[2][record[3]] = record[4];
                    break;
                case TaskType.Hide: {
                    const obj = record[2];
                    const conn = record[3];
                    const origVisible = record[4];
                    const undoFn = record[5];
                    try { obj.disconnect(conn); } catch (e) {}
                    if (undoFn) {
                        const result = undoFn(origVisible, obj);
                        if (result) obj.show();
                    } else if (origVisible) {
                        obj.show();
                    }
                    break;
                }
            }
        }
        this._records = null;
    }

    destroy() {
        this.clear();
        this._records = null;
    }
}

export { TaskType, Priority };
