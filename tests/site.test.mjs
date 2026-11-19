// সাইটের কাঠামো: site.json, OG ছবি, engine ফাইল DOM ছাড়া লোড হয়, worker-এর ফাইলগুলো আছে।
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;

describe('site', () => {
    it('site.json-এ layout-এর দরকারি সব ঘর', () => {
        const site = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
        for (const key of ['name', 'tagline', 'description', 'lang', 'url', 'repo']) assert.ok(site[key], `data/site.json-এ "${key}" নেই`);
        assert.equal(site.repo, 'https://github.com/msilabs/sql-playground');
        assert.ok(site.description.length <= 200, 'description খুব লম্বা, search-এ কাটা পড়বে');
    });

    it('OG ছবি PNG, ১২৮০×৬৪০, ১ MB-এর নিচে', () => {
        const png = readFileSync(join(root, 'public/og.png'));
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), 1280);
        assert.equal(png.readUInt32BE(20), 640);
        assert.ok(png.length < 1_000_000);
    });

    it('global/-এর engine ফাইল (8x/9x ছাড়া) window বা document ছাড়া Node-এ লোড হয়', () => {
        const files = readdirSync(join(root, 'global')).filter((f) => f.endsWith('.js') && !/^[89]\d-/.test(f));
        assert.ok(files.length > 10);
        for (const f of files) assert.doesNotThrow(() => require(join(root, 'global', f)), f);
    });

    it('DOM ফাইলগুলো Node-এ লোড হলে চুপচাপ কিছু করে না', () => {
        const files = readdirSync(join(root, 'global')).filter((f) => /^[89]\d-.*\.js$/.test(f));
        for (const f of files) assert.doesNotThrow(() => require(join(root, 'global', f)), f);
    });

    it('worker যে ফাইলগুলো importScripts করে, সেগুলো public/sql-এ আছে', () => {
        const worker = readFileSync(join(root, 'public/sql/engine.worker.js'), 'utf8');
        const names = [...worker.match(/importScripts\(([^)]*)\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(names, ['sql-wasm.js', 'runner.js', 'datasets.js']);
        for (const n of names) assert.ok(existsSync(join(root, 'public/sql', n)), `public/sql/${n} নেই (npm install আর copy-wasm চালান)`);
    });
});
