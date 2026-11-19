// পাঠ: front matter ঠিক আছে, ভেতরের লিংক ভাঙা নয়, আর প্রতিটা SQL বাক্স সত্যিই চলে।
// `-- ভুল হবে` লেখা বাক্স ইচ্ছা করে ভুল দেখায়, সেগুলোয় ভুল আসতেই হবে।
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { engineWith } from './helpers.mjs';

const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'data/learn');

function parse(file) {
    const text = readFileSync(join(dir, file), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    assert.ok(m, `${file}: front matter নেই`);
    const meta = {};
    for (const line of m[1].split('\n')) {
        const i = line.indexOf(':');
        meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    const blocks = [...m[2].matchAll(/```(sql|sql-school)\n([\s\S]*?)```/g)].map((b) => ({ dataset: b[1] === 'sql' ? 'dokan' : 'school', sql: b[2] }));
    const links = [...m[2].matchAll(/\]\((\/[^)]*)\)/g)].map((l) => l[1]);
    return { file, slug: file.replace(/\.md$/, ''), meta, body: m[2], blocks, links };
}

export const lessons = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map(parse);
const slugs = new Set(lessons.map((l) => l.slug));

describe('learn', () => {
    it('প্রতিটা পাঠে title, summary আর আলাদা order (১ থেকে পরপর)', () => {
        for (const l of lessons) {
            assert.ok(l.meta.title, `${l.file}: title নেই`);
            assert.ok(l.meta.summary, `${l.file}: summary নেই`);
        }
        const orders = lessons.map((l) => Number(l.meta.order)).sort((a, b) => a - b);
        assert.deepEqual(orders, lessons.map((_, i) => i + 1));
    });

    it('ভেতরের লিংক আছে এমন পেজেই যায়', () => {
        for (const l of lessons) {
            for (const link of l.links) {
                const ok = link === '/' || link === '/learn/' || link === '/challenge/' || (link.startsWith('/learn/') && slugs.has(link.split('/')[2]));
                assert.ok(ok, `${l.file}: ভাঙা লিংক ${link}`);
                if (link.startsWith('/')) assert.ok(link.endsWith('/'), `${l.file}: লিংকের শেষে / লাগবে: ${link}`);
            }
        }
    });

    it('প্রতিটা পাঠে অন্তত একটা চালানো যায় এমন বাক্স', () => {
        for (const l of lessons) assert.ok(l.blocks.length > 0, `${l.file}: কোনো sql বাক্স নেই`);
    });

    for (const l of lessons) {
        it(`${l.slug}: সব SQL বাক্স চলে`, async () => {
            for (const b of l.blocks) {
                const engine = await engineWith(b.dataset);
                const result = await engine.run(b.sql);
                if (b.sql.includes('-- ভুল হবে')) assert.ok(result.error, `${l.file}: ভুল আসার কথা ছিল:\n${b.sql}`);
                else assert.equal(result.error, undefined, `${l.file}:\n${b.sql}\n→ ${result.error?.message}`);
            }
        });
    }
});
