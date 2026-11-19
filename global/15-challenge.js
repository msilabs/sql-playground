/**
 * Challenge যাচাই। challenge-গুলো থাকে data/challenges/*.json-এ, সব চলে "অনলাইন দোকান" dataset-এ।
 *
 * কাজ পূর্ণ হয় ফল মিলিয়ে, হুবহু query মিলিয়ে নয়: `solution` এখনকার DB-তে চালিয়ে যে ফল আসে,
 * ব্যবহারকারীর শেষ SELECT-এর ফল তার সাথে মিললেই হলো (column-এর নাম নয়, শুধু মান)।
 * DB বদলানোর কাজে (`state`) `verify` query ১ ফেরত দিলে কাজ শেষ।
 */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./04-db.js') : root.SqlDb;
    var query = M0.query;

    const CHALLENGE_DATASET = "dokan";
    const LEVELS = ["সহজ", "মাঝারি", "কঠিন"];

    /** challenge-এর DB: dataset, তার ওপর `setup`, তারপর ব্যবহারকারীর নিজের বদল */
    const challengeLog = (challenge, log) => [...(challenge.setup ?? []), ...log];

    /**
     * আগের ভার্সনে অগ্রগতি ছিল একটা সংখ্যা (পরপর কয়টা কাজ শেষ)। challenge-এর ক্রম সেই কাজগুলোর
     * ক্রমেই, তাই প্রথম `step`টা challenge শেষ ধরা হয়।
     */
    function doneFromStep(step, ids) {
        return Number.isInteger(step) && step > 0 ? ids.slice(0, step) : [];
    }

    const cellKey = (v) => v === null ? "∅" : typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : typeof v === "string" ? `s:${v}` : "blob";
    const rowKey = (row) => JSON.stringify(row.map(cellKey));
    /** দুই ফলের তুলনা (column-এর নাম নয়, শুধু মান) */
    function compareRows(actual, expected, ordered) {
        if (actual.columns.length !== expected.columns.length) {
            return {
                status: "fail",
                reason: "columns",
                expectedColumns: expected.columns.length,
                actualColumns: actual.columns.length,
                extra: 0,
                missing: 0,
            };
        }
        const a = actual.rows.map(rowKey);
        const e = expected.rows.map(rowKey);
        const counts = new Map();
        for (const k of e)
            counts.set(k, (counts.get(k) ?? 0) + 1);
        let extra = 0;
        for (const k of a) {
            const n = counts.get(k) ?? 0;
            if (n > 0)
                counts.set(k, n - 1);
            else
                extra++;
        }
        const missingKeys = [...counts.entries()].filter(([, n]) => n > 0);
        const missing = missingKeys.reduce((s, [, n]) => s + n, 0);
        if (extra > 0 || missing > 0 || actual.total !== expected.total) {
            const sampleIndex = missingKeys.length ? e.indexOf(missingKeys[0][0]) : -1;
            return {
                status: "fail",
                reason: "rows",
                extra,
                missing,
                sampleMissing: sampleIndex >= 0 ? expected.rows[sampleIndex] : undefined,
            };
        }
        if (ordered && a.some((k, i) => k !== e[i]))
            return { status: "fail", reason: "order", extra: 0, missing: 0 };
        return { status: "pass" };
    }
    /**
     * এখনকার কাজ পূর্ণ হলো কি না। `lastRows`: এবারের চালানোয় শেষ যে statement row দিয়েছে
     * (SELECT); না থাকলে null।
     */
    async function checkChallenge(engine, task, lastRows, changedDb) {
        if (task.check === "state") {
            const r = await query(engine, task.verify);
            if (r.rows[0]?.[0] === 1)
                return { status: "pass" };
            return changedDb ? { status: "fail", reason: "state", extra: 0, missing: 0 } : { status: "skip" };
        }
        if (!lastRows)
            return { status: "skip" };
        const expected = await query(engine, task.solution);
        return compareRows(lastRows, expected, task.check === "ordered");
    }

    var api = { CHALLENGE_DATASET: CHALLENGE_DATASET, LEVELS: LEVELS, challengeLog: challengeLog, doneFromStep: doneFromStep, compareRows: compareRows, checkChallenge: checkChallenge };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlChallenge = api;
})(typeof self !== 'undefined' ? self : this);
