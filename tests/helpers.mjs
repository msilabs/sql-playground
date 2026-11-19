// টেস্টের সাহায্য: global/-এর engine ফাইল, worker ছাড়া সরাসরি sql.js-এ চলা Engine, আর ছোট একটা expect।
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

export const { bn } = require('../global/01-bn.js');
export const Tokenize = require('../global/02-tokenize.js');
export const Split = require('../global/03-split.js');
export const Db = require('../global/04-db.js');
export const Join = require('../global/05-join.js');
export const Stages = require('../global/06-stages.js');
export const Explain = require('../global/07-explain.js');
export const Errors = require('../global/08-errors.js');
export const Complete = require('../global/09-complete.js');
export const Datasets = require('../global/10-datasets.js');
export const Text = require('../global/11-text.js');
export const Session = require('../global/12-session.js');
export const Storage = require('../global/13-storage.js');
export const Share = require('../global/14-share.js');
export const Challenge = require('../global/15-challenge.js');
export const Trace = require('../global/16-trace.js');

const runner = require('../public/sql/runner.js');
const datasetSql = require('../public/sql/datasets.js');
const SQL = await initSqlJs();

// ব্রাউজারের WorkerEngine-এর মতোই: load(datasetId, log), run(sql, options)
export class NodeEngine {
    db = null;

    async load(dataset, log) {
        if (typeof datasetSql[dataset] !== 'string') throw new Error('unknown dataset: ' + dataset);
        this.db?.close();
        this.db = runner.loadDatabase(SQL, datasetSql[dataset], log).db;
    }

    async run(sql, options = {}) {
        if (!this.db) throw new Error('database not loaded');
        return runner.runScript(this.db, sql, options.maxRows ?? Db.USER_MAX_ROWS, options.countLimit ?? Db.COUNT_LIMIT);
    }
}

export async function engineWith(dataset = 'dokan', log = []) {
    const engine = new NodeEngine();
    await engine.load(dataset, log);
    return engine;
}

// vitest-এর expect-এর যতটুকু টেস্টে লাগে
const partial = (actual, expected) => {
    if (expected === null || typeof expected !== 'object') return actual === expected;
    if (actual === null || typeof actual !== 'object') return false;
    return Object.keys(expected).every((k) => partial(actual[k], expected[k]));
};

export function expect(actual, message) {
    const matchers = {
        toBe: (e) => assert.equal(actual, e, message),
        toEqual: (e) => assert.deepEqual(actual, e, message),
        toMatchObject: (e) => assert.ok(partial(actual, e), message ?? `${JSON.stringify(actual)} does not match ${JSON.stringify(e)}`),
        toBeNull: () => assert.equal(actual, null, message),
        toBeUndefined: () => assert.equal(actual, undefined, message),
        toBeDefined: () => assert.notEqual(actual, undefined, message),
        toBeTruthy: () => assert.ok(actual, message),
        toBeGreaterThan: (e) => assert.ok(actual > e, message ?? `${actual} > ${e}`),
        toBeLessThan: (e) => assert.ok(actual < e, message ?? `${actual} < ${e}`),
        toBeLessThanOrEqual: (e) => assert.ok(actual <= e, message ?? `${actual} <= ${e}`),
        toHaveLength: (n) => assert.equal(actual.length, n, message),
        toContain: (e) => assert.ok(actual.includes(e), message ?? `${JSON.stringify(actual)} should contain ${JSON.stringify(e)}`),
    };
    matchers.not = {
        toBeNull: () => assert.notEqual(actual, null, message),
        toContain: (e) => assert.ok(!actual.includes(e), message ?? `${JSON.stringify(actual)} should not contain ${JSON.stringify(e)}`),
    };
    return matchers;
}
