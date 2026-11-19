// DOM: Playground (home পেজ)। editor, ফল আর table-এর তালিকা জোড়া দেয়, আর session browser-এ সেভ রাখে।
// পাঠের বাক্সের মতোই দুই বোতাম: "রান করুন" সরাসরি ফল দেখায়; "ধাপে ধাপে" ফলের কার্ডে দেখায় SQLite
// বাস্তবে কী করে (পাশের ট্যাবে যুক্তির ক্রম আর JOIN), নিজে এগোয়, শেষ ধাপে পুরো ফল।
// শেয়ার লিংকে (#d=…&q=…) query এলে editor-এ বসায়।
(function () {
    if (typeof document === 'undefined') return;
    var root = document.getElementById('playground');
    if (!root) return;

    var ui = window.SqlText.ui;
    var V = window.SqlView;
    var el = V.el;
    var Db = window.SqlDb;
    var Ds = window.SqlDatasets;
    var S = window.SqlSession;
    var Storage = window.SqlStorage;
    var Share = window.SqlShare;
    var W = window.SqlWorkspace;

    var engine = new window.SqlClient.WorkerEngine();
    var schema = Db.EMPTY_SCHEMA;
    var status = 'loading';
    var runId = 0;
    var nextSteps = false;
    var STEP_MS = 2200;
    var TRACE_MS = 1300;
    var MIN_LOADER_MS = 400;
    var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };

    var saved = Storage.loadSession();
    if (saved.status === 'corrupt') Storage.clearSession();
    var session = saved.status === 'ok' ? saved.session : S.freshSession();
    var shared = Share.decodeShare(window.location.hash);
    if (shared) {
        session = Object.assign({}, S.switchDataset(session, shared.dataset), { editor: shared.query });
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // ---- editor-এর কার্ড
    var editorCard = root.querySelector('.pg-editor');
    editorCard.textContent = '';
    var bar = el('div', 'toolbar');
    var runBtn = el('button', 'btn primary', '▶ ' + ui.tryRun);
    runBtn.type = 'button';
    var stepsBtn = el('button', 'btn steps-btn', '▶ ' + ui.tryRunSteps);
    stepsBtn.type = 'button';
    bar.appendChild(runBtn);
    bar.appendChild(stepsBtn);
    bar.appendChild(el('span', 'spacer'));
    var historySelect = el('select');
    historySelect.setAttribute('aria-label', ui.history);
    var undoBtn = el('button', 'btn small', ui.undo);
    undoBtn.type = 'button';
    undoBtn.setAttribute('aria-label', ui.undoLabel);
    var shareBtn = el('button', 'btn small', ui.share);
    shareBtn.type = 'button';
    shareBtn.title = ui.shareLabel;
    var resetBtn = el('button', 'btn small danger', ui.reset);
    resetBtn.type = 'button';
    bar.appendChild(undoBtn);
    bar.appendChild(shareBtn);
    bar.appendChild(resetBtn);
    editorCard.appendChild(bar);

    var editor = window.SqlEditor.mount(editorCard, {
        value: session.editor,
        schema: function () { return schema; },
        onChange: function (text) {
            update(function (s) { return Object.assign({}, s, { editor: text }); });
            renderSchema();
        },
        onRun: function (text) {
            var steps = nextSteps;
            nextSteps = false;
            return run(text, steps ? 'steps' : 'run');
        }
    });
    var foot = el('div', 'ed-foot');
    foot.appendChild(historySelect);
    foot.appendChild(el('span', 'tip', ui.runTip));
    editorCard.appendChild(foot);
    var statusLine = el('p', 'loading', ui.loadingDb);
    var notice = el('p', 'notice');
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    var saveWarn = el('p', 'notice warn', '⚠ ' + ui.saveFailed);
    saveWarn.hidden = true;
    editorCard.appendChild(statusLine);
    editorCard.appendChild(notice);
    editorCard.appendChild(saveWarn);

    // ফলের কার্ড: ধাপ দেখালে ফলটা শেষ ধাপের ভেতরে চলে যায়
    var resultCard = root.querySelector('.pg-result');
    var stepSlot = el('div', 'pg-steps');
    stepSlot.hidden = true;
    resultCard.appendChild(stepSlot);
    var resultSlot = el('div');
    resultCard.appendChild(resultSlot);
    var loader = el('p', 'try-loading', ui.running);
    loader.setAttribute('role', 'status');
    loader.hidden = true;
    resultCard.appendChild(loader);
    var results = V.resultPanel(resultSlot);
    var schemaView = window.SqlSchemaView.mount(root.querySelector('.pg-schema'), {
        onInsert: function (text) { editor.insert(text); },
        onView: function (table) {
            var sql = 'SELECT * FROM ' + (/^[a-z_][a-z0-9_]*$/i.test(table) ? table : '"' + table + '"') + ' LIMIT 50;';
            setEditor(sql);
            run(sql, 'run');
        },
        onDataset: function (id) {
            if (id === session.dataset) return;
            rebuild(update(function (s) { return S.switchDataset(s, id); }), null);
            editor.set(session.editor);
        }
    });

    // ---- অবস্থা
    var noticeTimer = null;
    function say(text) {
        clearTimeout(noticeTimer);
        notice.textContent = text || '';
        notice.hidden = !text;
        if (text) noticeTimer = setTimeout(function () { notice.hidden = true; }, 6000);
    }

    function update(fn) {
        session = fn(session);
        saveWarn.hidden = Storage.saveSession(session);
        renderControls();
        return session;
    }

    function setEditor(text) {
        editor.set(text);
        update(function (s) { return Object.assign({}, s, { editor: text }); });
    }

    function setStatus(next) {
        status = next;
        statusLine.hidden = next !== 'loading' && next !== 'failed';
        statusLine.className = next === 'failed' ? 'notice warn' : 'loading';
        statusLine.textContent = next === 'failed' ? ui.loadFailed : ui.loadingDb;
        renderControls();
        renderSchema();
    }

    function renderControls() {
        var busy = status !== 'ready';
        var log = S.currentLog(session);
        var lastChange = log[log.length - 1];
        runBtn.disabled = busy;
        stepsBtn.disabled = busy;
        undoBtn.disabled = busy || !lastChange;
        undoBtn.title = lastChange ? ui.undoTitle(lastChange) : ui.undoNone;
        resetBtn.disabled = busy;
        historySelect.textContent = '';
        historySelect.appendChild(el('option', '', session.history.length ? ui.history : ui.historyEmpty)).value = '';
        [...session.history].reverse().forEach(function (h) {
            var o = el('option', '', h.replace(/\s+/g, ' ').slice(0, 70));
            o.value = h;
            historySelect.appendChild(o);
        });
    }

    function renderSchema() {
        schemaView.render(schema, { dataset: session.dataset, editorText: session.editor, disabled: status !== 'ready' });
    }

    async function loadDb() {
        setStatus('loading');
        try {
            await engine.load(session.dataset, S.currentLog(session));
            schema = await Db.loadSchema(engine);
            setStatus('ready');
        } catch (e) {
            setStatus('failed');
        }
    }

    function showLoader(on) {
        loader.hidden = !on;
        results.busy(on);
        if (on) {
            stepSlot.hidden = true;
            resultSlot.hidden = true;
        } else resultSlot.hidden = false;
    }

    function showPlain() {
        stepSlot.textContent = '';
        stepSlot.hidden = true;
        resultCard.insertBefore(resultSlot, loader);
    }

    function showSteps(data) {
        stepSlot.textContent = '';
        stepSlot.hidden = false;
        resultSlot.remove();
        stepSlot.appendChild(window.SqlInsight.analysisView(data, {
            autoplay: STEP_MS,
            traceAutoplay: TRACE_MS,
            final: { label: ui.finalStep, render: function (container) { container.appendChild(resultSlot); } }
        }));
    }

    // mode: 'run' (সরাসরি ফল) বা 'steps' (ধাপে ধাপে)
    async function run(text, mode) {
        if (status !== 'ready' || !text.trim()) return;
        var id = ++runId;
        var started = Date.now();
        setStatus('running');
        say('');
        showPlain();
        showLoader(true);
        var done = await W.execute(engine, text, schema);
        results.show(done.output);
        if (!done.ok) {
            await wait(MIN_LOADER_MS - (Date.now() - started));
            showLoader(false);
            showPlain();
            await loadDb();
            return;
        }
        update(function (s) { return S.applyRun(s, text, done.result); });
        schema = done.schema;
        var data = null;
        if (mode === 'steps' && !done.result.error) {
            try {
                data = await W.analyze(engine, done.result);
            } catch (e) {
                if (e instanceof Db.TimeoutError) await loadDb();
            }
        }
        await wait(MIN_LOADER_MS - (Date.now() - started));
        if (runId !== id) return;
        if (status === 'running') setStatus('ready');
        showLoader(false);
        var drawable = data && ((data.trace && data.trace.ok) || (data.stages.ok && data.stages.stages.length));
        if (drawable) showSteps(data);
        else showPlain();
    }

    async function rebuild(next, message) {
        runId++;
        showPlain();
        results.clear();
        await loadDb();
        say(message);
    }

    // ---- বোতাম
    runBtn.addEventListener('click', function () { editor.run(); });
    stepsBtn.addEventListener('click', function () {
        nextSteps = true;
        editor.run();
    });
    historySelect.addEventListener('change', function () {
        if (historySelect.value) setEditor(historySelect.value);
        historySelect.value = '';
        editor.focus();
    });
    undoBtn.addEventListener('click', function () {
        var log = S.currentLog(session);
        var lastSql = log[log.length - 1];
        if (!lastSql) return;
        rebuild(update(S.undoLast), ui.undone(lastSql));
    });
    resetBtn.addEventListener('click', function () {
        if (!window.confirm(ui.resetTitle + '\n\n' + ui.resetBody)) return;
        rebuild(update(S.resetDataset), ui.resetDone);
    });
    shareBtn.addEventListener('click', async function () {
        var url = window.location.origin + window.location.pathname + Share.encodeShare(editor.value(), session.dataset);
        try {
            await navigator.clipboard.writeText(url);
            say(ui.shareCopied);
        } catch (e) {
            say(ui.shareFailed);
        }
    });

    // একই tab-এ নতুন শেয়ার লিংক খুললে শুধু # বদলায়, পেজ নতুন করে লোড হয় না
    window.addEventListener('hashchange', function () {
        if (Share.decodeShare(window.location.hash)) window.location.reload();
    });

    renderControls();
    renderSchema();
    if (shared) {
        Storage.saveSession(session);
        say(ui.sharedLoaded);
    }
    loadDb();
})();
