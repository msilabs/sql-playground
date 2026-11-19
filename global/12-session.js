/**
 * Playground-এর অবস্থা (pure, React ছাড়া)।
 *
 * DB-র পুরো অবস্থা সেভ করা হয় না। রাখা হয় dataset আর তার ওপর চালানো DB-বদলানো statement-এর
 * তালিকা (`logs`)। রিলোডে dataset বসিয়ে statement-গুলো আবার চালালে একই DB ফিরে আসে।
 * undo মানে তালিকার শেষটা বাদ দিয়ে আবার চালানো।
 */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./10-datasets.js') : root.SqlDatasets;
    var DATASETS = M0.DATASETS, DEFAULT_DATASET = M0.DEFAULT_DATASET, datasetById = M0.datasetById;
    var M1 = isNode ? require('./02-tokenize.js') : root.SqlTokenize;
    var isReadOnly = M1.isReadOnly;

    const MAX_HISTORY = 30;
    /** এর বেশি বদল জমলে আর সেভ হয় না (রিসেট করলে আবার হয়) */
    const MAX_LOG = 400;
    const emptyLogs = () => Object.fromEntries(DATASETS.map((d) => [d.id, []]));
    function freshSession(dataset = DEFAULT_DATASET) {
        return { dataset, logs: emptyLogs(), editor: datasetById(dataset).starter, history: [], step: 0 };
    }
    const currentLog = (s) => s.logs[s.dataset] ?? [];
    /** এবার যে statement-গুলো DB বদলেছে (সফলগুলো) */
    const mutationsOf = (result) => result.statements.filter((st) => !isReadOnly(st.sql)).map((st) => st.sql);
    function applyRun(s, text, result) {
        const mutations = mutationsOf(result);
        const trimmed = text.trim();
        const history = trimmed ? [...s.history.filter((h) => h !== trimmed), trimmed].slice(-MAX_HISTORY) : s.history;
        return {
            ...s,
            history,
            logs: mutations.length ? { ...s.logs, [s.dataset]: [...currentLog(s), ...mutations] } : s.logs,
        };
    }
    function undoLast(s) {
        const log = currentLog(s);
        if (log.length === 0)
            return s;
        return { ...s, logs: { ...s.logs, [s.dataset]: log.slice(0, -1) } };
    }
    function resetDataset(s) {
        return { ...s, logs: { ...s.logs, [s.dataset]: [] } };
    }
    function switchDataset(s, dataset) {
        if (dataset === s.dataset)
            return s;
        return { ...s, dataset, editor: datasetById(dataset).starter };
    }

    var api = { MAX_HISTORY: MAX_HISTORY, MAX_LOG: MAX_LOG, freshSession: freshSession, currentLog: currentLog, mutationsOf: mutationsOf, applyRun: applyRun, undoLast: undoLast, resetDataset: resetDataset, switchDataset: switchDataset };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlSession = api;
})(typeof self !== 'undefined' ? self : this);
