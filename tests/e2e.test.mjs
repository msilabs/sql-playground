// আসল Chrome-এ পুরো সাইট চালিয়ে দেখা (Playwright ছাড়া, Chrome-এর DevTools protocol আর Node-এর নিজের WebSocket দিয়ে)।
// Chrome না পেলে skip হয়। CI-র ubuntu-latest-এ google-chrome থাকে।
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .filter(Boolean).find((p) => existsSync(p));
const skip = CHROME ? false : 'Chrome পাওয়া যায়নি';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.xml': 'application/xml', '.txt': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, chrome, profile, ws, nextId = 0, url;
const pending = new Map();
let problems = [];

async function send(method, params = {}) {
    const id = ++nextId;
    const reply = new Promise((resolve) => pending.set(id, resolve));
    ws.send(JSON.stringify({ id, method, params }));
    return reply;
}

async function js(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('page script failed: ' + r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
}

async function waitFor(expression, what) {
    for (let i = 0; i < 100; i++) {
        if (await js(expression)) return;
        await sleep(100);
    }
    assert.fail('timeout: ' + what);
}

// আগের test-এর সেভ যাতে না ঢোকে: একবার খুলে localStorage মুছে আবার খোলা
async function open(path = '', width = 1280, height = 900, setup = '') {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url });
    await waitFor("document.readyState === 'complete'", 'first load');
    await js('localStorage.clear(); ' + setup);
    // about:blank হয়ে যাওয়া, যাতে শুধু # বদলালেও পুরো পেজ নতুন করে লোড হয়
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: url + path });
    await waitFor("document.readyState === 'complete'", 'page load');
    problems = [];
}

// editor-এ লিখে চালানো (textarea-র input event দিয়ে, যাতে রং আর অবস্থা বদলায়)
const type = (box, sql) => js(`(() => { const t = document.querySelector(${JSON.stringify(box + ' textarea')}); t.value = ${JSON.stringify(sql)}; t.dispatchEvent(new Event('input')); })()`);
const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
const text = (selector) => js(`(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ''`);
const ready = (button) => waitFor(`(() => { const b = document.querySelector(${JSON.stringify(button)}); return b && !b.disabled; })()`, 'ready: ' + button);

before(async () => {
    if (skip) return;
    execFileSync('node', ['alo', 'build'], { cwd: root });
    server = createServer((req, res) => {
        const path = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
        const file = join(root, 'dist', path);
        if (!file.startsWith(join(root, 'dist')) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
        res.end(readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}/`;

    profile = mkdtempSync(join(tmpdir(), 'sqlpg-e2e-'));
    const port = 9500 + Math.floor(Math.random() * 400);
    chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
    let targets;
    for (let i = 0; i < 100 && !targets; i++) {
        try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(150); }
    }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') problems.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push(msg.params.args.map((a) => a.value).join(' '));
    };
    await send('Runtime.enable');
    await send('Page.enable');
    // বাইরের ফন্ট আর GitHub API ছাড়াই চলুক, নেটওয়ার্ক ধীর হলেও test যেন না আটকায়
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*api.github.com*'] });
});

after(async () => {
    if (ws) ws.close();
    if (chrome) {
        await new Promise((resolve) => { chrome.once('exit', resolve); chrome.kill(); setTimeout(resolve, 3000); });
    }
    if (server) server.close();
    try { if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* অস্থায়ী ফোল্ডার, না মুছলেও চলে */ }
});

test('e2e: header-এ তিনটা লিংক, hero থেকে Learn আর Challenge', { skip }, async () => {
    await open();
    assert.deepEqual(await js("[...document.querySelectorAll('.site-header .nav a')].map((a) => a.textContent.trim())"), ['Playground', 'Learn', 'Challenge']);
    assert.equal(await js("document.querySelector('.site-header .nav a.on').textContent.trim()"), 'Playground');
    assert.deepEqual(await js("[...document.querySelectorAll('.hero-actions a')].map((a) => a.getAttribute('href'))"), ['/learn/', '/challenge/']);
});

test('e2e: Playground-এ query চলে, ফল, ব্যাখ্যা আর ধাপ আসে, ভুলের বাংলা বার্তা আসে', { skip }, async () => {
    await open();
    await ready('.pg-editor .btn.primary');
    await click('.pg-editor .btn.primary');
    await waitFor("document.querySelectorAll('.pg-result .tbl tbody tr').length > 0", 'result rows');
    assert.match(await text('.pg-result .explain'), /WHERE/);
    // প্রথমে বাস্তবে যেভাবে চলে, পাশের ট্যাবে যুক্তির ক্রম
    await waitFor("!!document.querySelector('.pg-insight .trace-viewer .trace-body tr.st-current')", 'trace');
    assert.deepEqual(await js("[...document.querySelectorAll('.pg-insight .tabs button')].map((b) => b.textContent)"), ['বাস্তবে যেভাবে চলে', 'যুক্তির ক্রম', 'JOIN']);
    assert.match(await js("[...document.querySelectorAll('.pg-insight .steps button')].map((b) => b.textContent).join(' ')"), /পড়া ও ছাঁকা/);
    await js("document.querySelectorAll('.pg-insight .tabs button')[1].click()");
    await waitFor("document.querySelectorAll('.pg-insight .steps button').length === 4", 'stages');
    assert.deepEqual(await js("[...document.querySelectorAll('.pg-insight .steps button')].map((b) => b.textContent)"), ['১. FROM', '২. WHERE', '৩. SELECT', '৪. ORDER BY']);
    await type('.pg-editor', 'SELECT nam FROM products');
    await click('.pg-editor .btn.primary');
    await waitFor("!!document.querySelector('.pg-result .err')", 'error box');
    assert.match(await text('.pg-result .err-title'), /column নেই/);
    assert.match(await text('.pg-result .err-hint'), /name/);
    assert.deepEqual(problems, []);
});

test('e2e: Playground-এ JOIN-এর ছবি, Undo, রিলোডের পরেও বদল থাকে', { skip }, async () => {
    await open();
    await ready('.pg-editor .btn.primary');
    await type('.pg-editor', 'SELECT c.name, d.name FROM customers c LEFT JOIN districts d ON d.id = c.district_id');
    await click('.pg-editor .btn.primary');
    await waitFor("[...document.querySelectorAll('.pg-insight .tabs button')].length === 3", 'insight tabs');
    await waitFor("document.querySelectorAll('.pg-insight .trace-sec-title').length >= 3", 'join trace');
    assert.match(await js("[...document.querySelectorAll('.pg-insight .trace-sec-title')].map((e) => e.textContent).join(' | ')"), /বাইরের লুপ: customers.*ভেতরের লুপ: districts/);
    await js("document.querySelectorAll('.pg-insight .tabs button')[2].click()");
    await waitFor("document.querySelectorAll('.pg-insight .jv path').length > 0", 'join lines');

    await type('.pg-editor', "DELETE FROM order_items WHERE id = 1");
    await click('.pg-editor .btn.primary');
    await waitFor("/১টা row বদলেছে/.test(document.querySelector('.pg-result').textContent)", 'delete done');
    await send('Page.reload');
    await ready('.pg-editor .btn.primary');
    await waitFor("/১৫৮টা row/.test(document.querySelector('.pg-schema').textContent)", 'change kept after reload');
    await click('.pg-editor .btn.small');
    await waitFor("/১৫৯টা row/.test(document.querySelector('.pg-schema').textContent)", 'undo');
    assert.deepEqual(problems, []);
});

test('e2e: শেয়ার লিংকের query editor-এ বসে, স্কুলের ডেটায় যায়', { skip }, async () => {
    await open('#d=school&q=' + Buffer.from('SELECT * FROM subjects;').toString('base64url'));
    await ready('.pg-editor .btn.primary');
    assert.equal(await js("document.querySelector('.pg-editor textarea').value"), 'SELECT * FROM subjects;');
    assert.match(await text('.pg-schema'), /students/);
    assert.equal(await js('location.hash'), '');
});

test('e2e: পাঠের SQL বাক্স নিজে চলে, বদলে চালানো যায়, মূল query-তে ফেরে', { skip }, async () => {
    await open('learn/update/');
    await waitFor("document.querySelectorAll('#lessonBody .try').length >= 4 && [...document.querySelectorAll('#lessonBody .try')].every((t) => t.querySelector('.res-tabs, .tbl, .res-ok, .err'))", 'all boxes ran');
    assert.equal(await js("document.querySelector('.site-header .nav a.on').textContent.trim()"), 'Learn');
    const box = "#lessonBody .try:nth-of-type(1)";
    assert.equal(await js(`document.querySelectorAll('${box} .res-tabs button').length`), 2);
    // দ্বিতীয় বাক্সের "সব দাম ১০০" প্রথম বাক্সে পড়ে না
    assert.match(await js(`document.querySelector('${box} .tbl').textContent`), /40/);
    await js(`(() => { const t = document.querySelector('${box} textarea'); t.value = "SELECT count(*) FROM products WHERE price = 100"; t.dispatchEvent(new Event('input')); document.querySelector('${box} .steps-btn').click(); })()`);
    // ধাপে ধাপে: প্রথমে বাস্তবে যেভাবে চলে (row ধরে ধরে), নিজে এগোয়, শেষ ধাপে পুরো ফল
    await waitFor(`document.querySelector('${box} .analysis-tabs button.on')?.textContent === 'বাস্তবে যেভাবে চলে'`, 'trace shown');
    assert.deepEqual(await js(`[...document.querySelectorAll('${box} .trace-viewer .steps button')].map((b) => b.textContent)`), ['১. পড়া ও ছাঁকা', '২. ফলে পাঠানো', '✓ ফল']);
    assert.equal(await js(`document.querySelector('${box} details.sources').open`), false);
    assert.match(await js(`document.querySelector('${box} details.sources summary').textContent`), /products/);
    assert.equal(await js(`document.querySelectorAll('${box} .trace-body tr.st-current').length`), 1);
    await waitFor(`/^ধাপ ২ /.test(document.querySelector('${box} .trace-viewer .step-nav span span').textContent)`, 'autoplay advances');
    await js(`document.querySelector('${box} .trace-viewer .step-nav .btn.primary').click()`);
    assert.match(await js(`document.querySelector('${box} .trace-viewer .step-nav span span').textContent`), /^ধাপ ৩ /);
    assert.equal(await js(`document.querySelector('${box} .trace-viewer .step-play').textContent`), '▶ চালিয়ে যান');
    await js(`document.querySelector('${box} .trace-viewer .steps li:last-child button').click()`);
    assert.equal(await js(`document.querySelector('${box} .trace-body .explain') !== null`), true);
    assert.equal(await js(`document.querySelector('${box} .trace-body .tbl td.num')?.textContent`), '0');
    // পাশের ট্যাবে যুক্তির ক্রম
    await js(`document.querySelectorAll('${box} .analysis-tabs button')[1].click()`);
    assert.deepEqual(await js(`[...document.querySelectorAll('${box} .stage-viewer .steps button')].map((b) => b.textContent)`), ['১. FROM', '২. WHERE', '৩. SELECT', '✓ ফল']);
    // সরাসরি রান: অল্প সময় loader, তারপর ধাপ ছাড়া শুধু ফল
    await js(`document.querySelector('${box} .toolbar .btn.primary').click()`);
    assert.equal(await js(`document.querySelector('${box} .try-loading').hidden`), false);
    await waitFor(`document.querySelector('${box} .try-loading').hidden && !document.querySelector('${box} .toolbar .btn.primary').disabled`, 'instant run done');
    assert.equal(await js(`document.querySelector('${box} .steps')`), null);
    assert.equal(await js(`document.querySelector('${box} .tbl td.num')?.textContent`), '0');
    assert.match(await js(`document.querySelector('${box} .try-head a').getAttribute('href')`), /#d=dokan&q=/);
    assert.deepEqual(problems, []);
});

test('e2e: challenge যাচাই করে, পরেরটা খোলে, রিলোডেও মনে থাকে', { skip }, async () => {
    await open('challenge/');
    await ready('#chEditor .btn.primary');
    assert.equal(await js("document.querySelectorAll('#chList .side-item').length"), 28);
    assert.equal(await js("document.querySelectorAll('#chList .side-item[disabled]').length"), 27);
    await type('#chEditor', 'SELECT name FROM products');
    await click('#chEditor .btn.primary');
    await waitFor("/column/.test(document.getElementById('chFeedback').textContent)", 'fail feedback');
    await type('#chEditor', 'SELECT * FROM products');
    await click('#chEditor .btn.primary');
    await waitFor("document.getElementById('chFeedback').classList.contains('pass')", 'pass');
    assert.equal(await js("document.getElementById('chNext').hidden"), false);
    await send('Page.reload');
    await ready('#chEditor .btn.primary');
    assert.equal(await text('#chTitle'), 'শুধু নাম আর দাম');
    assert.equal(await text('#progressText'), '১ / ২৮টা শেষ');
    assert.deepEqual(problems, []);
});

test('e2e: DB বদলানো challenge নিজের setup-সহ চলে', { skip }, async () => {
    const ids = JSON.parse(execFileSync('node', ['-e', "console.log(JSON.stringify(require('fs').readdirSync('data/challenges').sort().map((f) => f.replace(/^\\d+-/, '').replace(/\\.json$/, ''))))"], { cwd: root }).toString());
    await open('challenge/', 1280, 900, `localStorage.setItem('msilabs-sql-playground:challenges', JSON.stringify({ done: ${JSON.stringify(ids.slice(0, 23))} }))`);
    await ready('#chEditor .btn.primary');
    assert.equal(await text('#chTitle'), 'গামছার দাম বাড়ান');
    await type('#chEditor', 'UPDATE products SET price = 220');
    await click('#chEditor .btn.primary');
    await waitFor("document.getElementById('chFeedback').classList.contains('fail')", 'wrong update caught');
    await click('#chEditor .btn.small:last-child');
    await ready('#chEditor .btn.primary');
    await type('#chEditor', "UPDATE products SET price = 220 WHERE name = 'গামছা'");
    await click('#chEditor .btn.primary');
    await waitFor("document.getElementById('chFeedback').classList.contains('pass')", 'pass');
    assert.deepEqual(problems, []);
});

test('e2e: আগের ভার্সনের মিশনের অগ্রগতি challenge-এ আসে', { skip }, async () => {
    const old = { v: 1, dataset: 'dokan', editor: '', history: [], logs: { dokan: [], school: [] }, step: 5 };
    await open('challenge/', 1280, 900, `localStorage.setItem('msilabs-sql-playground:v1', ${JSON.stringify(JSON.stringify(old))})`);
    await ready('#chEditor .btn.primary');
    assert.equal(await text('#progressText'), '৫ / ২৮টা শেষ');
    assert.equal(await text('#chNo'), '৬');
});

test('e2e: ফোনের মাপে কিছু পাশে scroll হয় না', { skip }, async () => {
    for (const path of ['', 'learn/', 'learn/inner-join/', 'challenge/']) {
        await open(path, 390, 800);
        await sleep(400);
        assert.ok(await js('document.documentElement.scrollWidth <= 390'), `${path || '/'} পাশে scroll হয়`);
    }
    // ধাপে ধাপে খুললেও চওড়া table বাক্সের ভেতরে থাকে (৩ table-এর JOIN, অনেক column), ডেস্কটপ আর ফোন দুই মাপেই
    for (const width of [1280, 390]) {
        await open('learn/null-functions/', width, 900);
        await waitFor("[...document.querySelectorAll('#lessonBody .try')].some((t) => t.querySelector('textarea').value.includes('LEFT JOIN order_items') && t.querySelector('.tbl'))", 'join box ran');
        await js("[...document.querySelectorAll('#lessonBody .try')].find((t) => t.querySelector('textarea').value.includes('LEFT JOIN order_items')).querySelector('.steps-btn').click()");
        await waitFor("!!document.querySelector('#lessonBody .stage-viewer .tbl')", 'steps shown');
        assert.ok(await js(`document.documentElement.scrollWidth <= ${width}`), `ধাপে ধাপে খুললে ${width}px-এ পাশে scroll হয়`);
    }
});
