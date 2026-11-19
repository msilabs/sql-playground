// Challenge: JSON ঠিক আছে, প্রতিটা সমাধান নিজের যাচাই পাস করে, ভুল উত্তর ধরা পড়ে।
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, engineWith, Challenge, Db } from './helpers.mjs';

const { checkChallenge, compareRows, challengeLog, doneFromStep, LEVELS, CHALLENGE_DATASET } = Challenge;
const { query } = Db;
const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'data/challenges');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const challenges = files.map((f) => ({ file: f, id: f.replace(/^\d+-/, '').replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const fresh = (c, log = []) => engineWith(CHALLENGE_DATASET, challengeLog(c, log));

describe('challenges', () => {
    it('প্রতিটা ফাইলে দরকারি সব ঘর, আর id আলাদা', () => {
        assert.equal(new Set(challenges.map((c) => c.id)).size, challenges.length);
        challenges.forEach((c, i) => {
            assert.ok(c.file.startsWith(String(i + 1).padStart(2, '0') + '-'), `${c.file}: ক্রমের নম্বর`);
            for (const key of ['title', 'level', 'learn', 'task', 'hint', 'solution', 'check']) assert.ok(c[key], `${c.file}: ${key} নেই`);
            assert.ok(LEVELS.includes(c.level), `${c.file}: level`);
            assert.ok(['rows', 'ordered', 'state'].includes(c.check), `${c.file}: check`);
            if (c.check === 'state') assert.ok(c.verify, `${c.file}: state-এ verify লাগে`);
            assert.ok(existsSync(join(root, 'data/learn', c.learn + '.md')), `${c.file}: পাঠ ${c.learn} নেই`);
        });
    });

    for (const c of challenges) {
        it(`${c.id}: সমাধান নিজের যাচাই পাস করে`, async () => {
            const engine = await fresh(c);
            if (c.check === 'state') {
                expect(await checkChallenge(engine, c, null, false), 'শুরুতেই পূর্ণ').toEqual({ status: 'skip' });
                const run = await engine.run(c.solution);
                expect(run.error).toBeUndefined();
                expect(await checkChallenge(engine, c, null, true)).toEqual({ status: 'pass' });
            } else {
                const result = await query(engine, c.solution);
                expect(result.total).toBeGreaterThan(0);
                expect(await checkChallenge(engine, c, result, false)).toEqual({ status: 'pass' });
            }
        });
    }

    it('ভুল উত্তর ধরা পড়ে', async () => {
        const c = challenges.find((x) => x.id === 'over-1000');
        const engine = await fresh(c);
        const wrong = await query(engine, 'SELECT name, price FROM products WHERE price > 500');
        expect((await checkChallenge(engine, c, wrong, false)).status).toBe('fail');
        const fewer = await query(engine, 'SELECT name FROM products WHERE price > 1000');
        expect(await checkChallenge(engine, c, fewer, false)).toMatchObject({ status: 'fail', reason: 'columns' });
    });

    it('ordered কাজে ক্রম ধরে, rows কাজে ধরে না', async () => {
        const engine = await engineWith('dokan');
        const asc = await query(engine, 'SELECT name, price FROM products ORDER BY price ASC');
        const desc = await query(engine, 'SELECT name, price FROM products ORDER BY price DESC');
        expect(compareRows(asc, desc, false)).toEqual({ status: 'pass' });
        expect(compareRows(asc, desc, true)).toMatchObject({ status: 'fail', reason: 'order' });
    });

    it('DB বদলানো কাজে ভুল UPDATE ধরা পড়ে, setup আগে থেকেই বসে', async () => {
        const c = challenges.find((x) => x.id === 'update-gamchha');
        const engine = await fresh(c, ['UPDATE products SET price = 220']);
        expect(await checkChallenge(engine, c, null, true)).toMatchObject({ status: 'fail', reason: 'state' });
    });

    it('আগের ভার্সনের অগ্রগতি (step) থেকে শেষ হওয়া challenge', () => {
        const ids = challenges.map((c) => c.id);
        expect(doneFromStep(0, ids)).toEqual([]);
        expect(doneFromStep(3, ids)).toEqual(ids.slice(0, 3));
        expect(doneFromStep(999, ids)).toEqual(ids);
        expect(doneFromStep(-1, ids)).toEqual([]);
        expect(doneFromStep('x', ids)).toEqual([]);
    });
});
