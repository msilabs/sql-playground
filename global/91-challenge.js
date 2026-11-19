// DOM: Challenge পেজ। বাঁয়ে তালিকা (শেষ হলে পরেরটা খোলে), ডানে কাজ, editor, ফল আর table।
// প্রতিটা challenge নিজের নতুন DB-তে চলে (dataset + challenge-এর setup + নিজের বদল), তাই
// একটার বদল আরেকটায় পড়ে না। অগ্রগতি শুধু শেষ হওয়া challenge-এর id, browser-এ সেভ থাকে।
(function () {
    if (typeof document === 'undefined') return;
    var app = document.getElementById('challengeApp');
    if (!app) return;

    var ui = window.SqlText.ui;
    var bn = window.SqlBn.bn;
    var V = window.SqlView;
    var el = V.el;
    var Db = window.SqlDb;
    var S = window.SqlSession;
    var C = window.SqlChallenge;
    var W = window.SqlWorkspace;
    var Storage = window.SqlStorage;

    var list = JSON.parse(app.dataset.json);
    var ids = list.map(function (c) { return c.id; });
    var KEY = 'msilabs-sql-playground:challenges';
    var base = document.documentElement.dataset.base || '/';
    var $ = function (id) { return document.getElementById(id); };

    var progress = { done: [] };
    try {
        var raw = localStorage.getItem(KEY);
        var saved = raw ? JSON.parse(raw) : null;
        if (saved && Array.isArray(saved.done)) progress.done = saved.done.filter(function (id) { return ids.indexOf(id) !== -1; });
        else {
            // আগের ভার্সনের মিশনের অগ্রগতি থাকলে সেখান থেকে
            var old = Storage.loadSession();
            if (old.status === 'ok') progress.done = C.doneFromStep(old.session.step, ids);
        }
    } catch (e) { /* private window বা ভাঙা সেভ: নতুন করে শুরু */ }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* সেভ না হলেও পেজ চলে */ }
    }

    function isDone(i) { return progress.done.indexOf(list[i].id) !== -1; }
    function isOpen(i) { return i === 0 || isDone(i) || isDone(i - 1); }
    function firstUndone() {
        for (var i = 0; i < list.length; i++) if (!isDone(i)) return i;
        return list.length - 1;
    }

    var engine = new window.SqlClient.WorkerEngine();
    var schema = Db.EMPTY_SCHEMA;
    var status = 'loading';
    var current = 0;
    var log = [];
    var drafts = {};

    // ---- editor-এর কার্ড
    var editorCard = $('chEditor');
    var bar = el('div', 'toolbar');
    var runBtn = el('button', 'btn primary', '▶ ' + ui.run);
    runBtn.type = 'button';
    bar.appendChild(runBtn);
    bar.appendChild(el('kbd', '', ui.runShortcut));
    bar.appendChild(el('span', 'spacer'));
    var undoBtn = el('button', 'btn small', ui.undo);
    undoBtn.type = 'button';
    undoBtn.setAttribute('aria-label', ui.undoLabel);
    var resetBtn = el('button', 'btn small', ui.freshDb);
    resetBtn.type = 'button';
    resetBtn.title = ui.freshDbTitle;
    bar.appendChild(undoBtn);
    bar.appendChild(resetBtn);
    editorCard.appendChild(bar);
    var editor = window.SqlEditor.mount(editorCard, {
        value: '',
        placeholder: ui.challengePlaceholder,
        schema: function () { return schema; },
        onChange: function (text) {
            drafts[current] = text;
            renderSchema();
        },
        onRun: function (text) { run(text, true); }
    });
    var statusLine = el('p', 'loading', ui.loadingDb);
    var notice = el('p', 'notice');
    notice.hidden = true;
    editorCard.appendChild(statusLine);
    editorCard.appendChild(notice);

    var results = V.resultPanel($('chResult'));
    var schemaView = window.SqlSchemaView.mount($('chSchema'), {
        onInsert: function (text) { editor.insert(text); },
        onView: function (table) { run('SELECT * FROM ' + table + ' LIMIT 50;', false); }
    });

    function setStatus(next) {
        status = next;
        statusLine.hidden = next !== 'loading' && next !== 'failed';
        statusLine.className = next === 'failed' ? 'notice warn' : 'loading';
        statusLine.textContent = next === 'failed' ? ui.loadFailed : ui.loadingDb;
        var busy = next !== 'ready';
        runBtn.disabled = busy;
        runBtn.textContent = '▶ ' + (next === 'running' ? ui.running : ui.run);
        undoBtn.disabled = busy || log.length === 0;
        undoBtn.title = log.length ? ui.undoTitle(log[log.length - 1]) : ui.undoNone;
        resetBtn.disabled = busy;
        renderSchema();
    }

    function renderSchema() {
        schemaView.render(schema, { dataset: C.CHALLENGE_DATASET, editorText: editor.value(), disabled: status !== 'ready' });
    }

    function say(text) {
        notice.textContent = text || '';
        notice.hidden = !text;
    }

    async function loadDb() {
        setStatus('loading');
        try {
            await engine.load(C.CHALLENGE_DATASET, C.challengeLog(list[current], log));
            schema = await Db.loadSchema(engine);
            setStatus('ready');
        } catch (e) {
            setStatus('failed');
        }
    }

    // ---- তালিকা
    function renderList() {
        var box = $('chList');
        box.textContent = '';
        list.forEach(function (c, i) {
            var b = el('button', 'side-item' + (i === current ? ' cur' : '') + (isDone(i) ? ' done' : ''));
            b.type = 'button';
            b.dataset.i = i;
            b.disabled = !isOpen(i);
            b.appendChild(el('span', 'st', isDone(i) ? '✓' : isOpen(i) ? bn(i + 1) : '🔒'));
            b.appendChild(el('span', 'nm', c.title));
            b.appendChild(el('span', 'lvl', c.level));
            if (i === current) b.setAttribute('aria-current', 'true');
            box.appendChild(b);
        });
        var done = list.filter(function (c, i) { return isDone(i); }).length;
        $('progressBar').style.width = (done / list.length * 100) + '%';
        $('progressText').textContent = ui.challengeProgress(done, list.length);
    }

    function feedback(kind, text, sample) {
        var box = $('chFeedback');
        box.textContent = '';
        box.hidden = !kind;
        if (!kind) return;
        box.className = 'ch-feedback ' + kind;
        V.rich(box, text);
        if (sample) box.appendChild(el('span', 'sample', ui.sampleMissing + ' ' + sample.map(function (v) { return v === null ? 'NULL' : String(v); }).join(' | ')));
    }

    function failText(outcome) {
        if (outcome.reason === 'columns') return ui.failColumns(outcome.actualColumns, outcome.expectedColumns);
        if (outcome.reason === 'order') return ui.failOrder;
        if (outcome.reason === 'state') return ui.failState;
        return ui.failRows(outcome.extra, outcome.missing);
    }

    function load(i) {
        current = i;
        var c = list[i];
        log = [];
        $('chNo').textContent = bn(i + 1);
        $('chTitle').textContent = c.title;
        $('chLevel').textContent = c.level;
        var task = $('chTask');
        task.textContent = '';
        V.rich(task, c.task);
        var learn = $('chLearn');
        learn.hidden = !c.learnTitle;
        if (c.learnTitle) {
            learn.href = base + 'learn/' + c.learn + '/';
            learn.textContent = ui.challengeLesson(c.learnTitle);
        }
        $('chHintBox').hidden = true;
        $('chSolutionBox').hidden = true;
        $('chNext').hidden = !(isDone(i) && i < list.length - 1);
        feedback(isDone(i) ? 'pass' : null, ui.challengeDoneBefore);
        editor.set(drafts[i] || '');
        results.clear();
        say('');
        renderList();
        loadDb();
    }

    async function check(text, done) {
        var c = list[current];
        if (done.result.error && !(done.changedDb && c.check === 'state')) return;
        var outcome;
        try {
            outcome = await C.checkChallenge(engine, c, W.lastWithRows(done.result), done.changedDb);
        } catch (e) {
            // ব্যবহারকারী table মুছে ফেললে সমাধানও চলবে না; তখন চুপ থাকি
            return;
        }
        if (outcome.status === 'pass') {
            var first = !isDone(current);
            if (first) {
                progress.done.push(c.id);
                save();
            }
            var last = current === list.length - 1;
            feedback('pass', last ? ui.allChallengesDone : ui.challengePassed);
            $('chNext').hidden = last;
            renderList();
        } else if (outcome.status === 'fail') feedback('fail', failText(outcome), outcome.sampleMissing);
    }

    async function run(text, shouldCheck) {
        if (status !== 'ready' || !text.trim()) return;
        setStatus('running');
        say('');
        results.busy(true);
        var done = await W.execute(engine, text, schema);
        results.busy(false);
        results.show(done.output);
        if (!done.ok) {
            await loadDb();
            return;
        }
        log = log.concat(S.mutationsOf(done.result));
        schema = done.schema;
        setStatus('ready');
        if (shouldCheck) await check(text, done);
    }

    // ---- বোতাম
    runBtn.addEventListener('click', function () { editor.run(); });
    undoBtn.addEventListener('click', function () {
        var lastSql = log[log.length - 1];
        if (!lastSql) return;
        log = log.slice(0, -1);
        results.clear();
        loadDb().then(function () { say(ui.undone(lastSql)); });
    });
    resetBtn.addEventListener('click', function () {
        log = [];
        results.clear();
        loadDb().then(function () { say(ui.resetDone); });
    });
    $('chList').addEventListener('click', function (e) {
        var b = e.target.closest('[data-i]');
        if (b && !b.disabled) {
            load(Number(b.dataset.i));
            editor.focus();
        }
    });
    $('chHint').addEventListener('click', function () {
        var box = $('chHintBox');
        box.textContent = '💡 ';
        V.rich(box, list[current].hint);
        box.hidden = false;
    });
    $('chSolution').addEventListener('click', function () {
        var box = $('chSolutionBox');
        box.textContent = '';
        box.appendChild(el('b', '', ui.oneAnswer));
        box.appendChild(el('pre', '', list[current].solution));
        var use = el('button', 'btn small', ui.useSolution);
        use.type = 'button';
        use.addEventListener('click', function () {
            editor.set(list[current].solution);
            drafts[current] = list[current].solution;
            editor.focus();
        });
        box.appendChild(use);
        box.hidden = false;
    });
    $('chNext').addEventListener('click', function () {
        load(Math.min(list.length - 1, current + 1));
        editor.focus();
    });
    $('chReset').addEventListener('click', function () {
        if (!window.confirm(ui.challengeResetConfirm)) return;
        progress = { done: [] };
        save();
        load(0);
    });

    if (progress.done.length) save();
    load(firstUndone());
})();
