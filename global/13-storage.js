/**
 * ব্রাউজারের localStorage-এ সেশন রাখা। প্রাইভেট উইন্ডো, ব্লক করা বা ভরা স্টোরেজে localStorage
 * exception দিতে পারে, তাই প্রতিটা read/write try/catch-এ মোড়ানো।
 */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./10-datasets.js') : root.SqlDatasets;
    var DATASETS = M0.DATASETS, isDatasetId = M0.isDatasetId;
    var M1 = isNode ? require('./12-session.js') : root.SqlSession;
    var MAX_HISTORY = M1.MAX_HISTORY, MAX_LOG = M1.MAX_LOG, freshSession = M1.freshSession;

    const KEY = "msilabs-sql-playground:v1";
    const isStringArray = (x) => Array.isArray(x) && x.every((v) => typeof v === "string");
    function parseSaved(raw) {
        if (!raw)
            return { status: "empty" };
        try {
            const d = JSON.parse(raw);
            if (typeof d !== "object" || d === null)
                return { status: "corrupt" };
            const data = d;
            if (data.v !== 1 || !isDatasetId(data.dataset) || typeof data.editor !== "string")
                return { status: "corrupt" };
            if (!isStringArray(data.history) || typeof data.logs !== "object" || data.logs === null)
                return { status: "corrupt" };
            const savedLogs = data.logs;
            const base = freshSession(data.dataset);
            const logs = { ...base.logs };
            for (const ds of DATASETS) {
                const log = savedLogs[ds.id];
                if (log === undefined)
                    continue;
                if (!isStringArray(log))
                    return { status: "corrupt" };
                logs[ds.id] = log;
            }
            const step = typeof data.step === "number" && Number.isInteger(data.step) && data.step >= 0 ? data.step : 0;
            return {
                status: "ok",
                session: { dataset: data.dataset, logs, editor: data.editor, history: data.history.slice(-MAX_HISTORY), step },
            };
        }
        catch {
            return { status: "corrupt" };
        }
    }
    function serialize(s) {
        return JSON.stringify({ v: 1, dataset: s.dataset, logs: s.logs, editor: s.editor, history: s.history, step: s.step });
    }
    function loadSession() {
        try {
            return parseSaved(localStorage.getItem(KEY));
        }
        catch {
            return { status: "empty" };
        }
    }
    /** সেভ হলে true। বদলের তালিকা খুব লম্বা হলে বা স্টোরেজ না চললে false। */
    function saveSession(s) {
        if (Object.values(s.logs).some((log) => log.length > MAX_LOG))
            return false;
        try {
            localStorage.setItem(KEY, serialize(s));
            return true;
        }
        catch {
            return false;
        }
    }
    function clearSession() {
        try {
            localStorage.removeItem(KEY);
        }
        catch {
            // কিছু করার নেই
        }
    }

    var api = { parseSaved: parseSaved, serialize: serialize, loadSession: loadSession, saveSession: saveSession, clearSession: clearSession };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlStorage = api;
})(typeof self !== 'undefined' ? self : this);
