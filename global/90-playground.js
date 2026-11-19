// DOM: Playground (home পেজ)। editor, ফল, "কীভাবে চলে" আর table-এর তালিকা জোড়া দেয়,
// আর session browser-এ সেভ রাখে। শেয়ার লিংকে (#d=…&q=…) query এলে editor-এ বসায়।
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
    var runBtn = el('button', 'btn primary', '▶ ' + ui.run);
    runBtn.type = 'button';
    bar.appendChild(runBtn);
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
        onRun: run
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

    var results = V.resultPanel(root.querySelector('.pg-result'));
    var insight = window.SqlInsight.mount(root.querySelector('.pg-insight'));
    var schemaView = window.SqlSchemaView.mount(root.querySelector('.pg-schema'), {
        onInsert: function (text) { editor.insert(text); },
        onView: function (table) {
            var sql = 'SELECT * FROM ' + (/^[a-z_][a-z0-9_]*$/i.test(table) ? table : '"' + table + '"') + ' LIMIT 50;';
            setEditor(sql);
            run(sql);
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
        runBtn.textContent = '▶ ' + (status === 'running' ? ui.running : ui.run);
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

    async function run(text) {
        if (status !== 'ready' || !text.trim()) return;
        var id = ++runId;
        setStatus('running');
        say('');
        results.busy(true);
        var done = await W.execute(engine, text, schema);
        results.busy(false);
        results.show(done.output);
        if (!done.ok) {
            insight.idle();
            await loadDb();
            return;
        }
        update(function (s) { return S.applyRun(s, text, done.result); });
        schema = done.schema;
        setStatus('ready');
        if (done.result.error) {
            insight.idle();
            return;
        }
        insight.loading();
        try {
            var data = await W.analyze(engine, done.result);
            if (runId === id) {
                if (data) insight.show(data);
                else insight.idle();
            }
        } catch (e) {
            if (runId === id) insight.idle();
            if (e instanceof Db.TimeoutError) await loadDb();
        }
    }

    async function rebuild(next, message) {
        runId++;
        results.clear();
        insight.idle();
        await loadDb();
        say(message);
    }

    // ---- বোতাম
    runBtn.addEventListener('click', function () { editor.run(); });
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
