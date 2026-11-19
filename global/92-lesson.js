// DOM: পাঠের ভেতরের SQL বাক্স।
//   ```sql          চালানো যায় এমন বাক্স, "অনলাইন দোকান" ডেটায় (পেজ খুললে একবার নিজে চলে)
//   ```sql-school   একই, "স্কুল" ডেটায়
//   ```syntax       শুধু রঙিন কোড (গঠন দেখানোর জন্য), চালানো যায় না
// দুই বোতাম: "রান করুন" সরাসরি ফল দেখায়; "ধাপে ধাপে" দেখায় SQLite বাস্তবে row ধরে ধরে কী করে
// (পাশের ট্যাবে যুক্তির ক্রম: FROM → WHERE → …), একটা একটা করে নিজে চলে, শেষে পুরো ফল। দুটোতেই অল্প সময় loader থাকে, যাতে বোঝা যায় নতুন করে চলেছে।
// প্রতিটা বাক্সের নিজের DB: চালানোর আগে dataset আর ওই বাক্সের আগের বদলগুলো বসে, তাই এক বাক্সের
// UPDATE আরেক বাক্সে পড়ে না। worker একটাই, কাজগুলো লাইন ধরে একটার পর একটা চলে।
(function () {
    if (typeof document === 'undefined') return;
    var body = document.getElementById('lessonBody');
    if (!body) return;

    var ui = window.SqlText.ui;
    var V = window.SqlView;
    var el = V.el;
    var Db = window.SqlDb;
    var S = window.SqlSession;
    var W = window.SqlWorkspace;
    var Share = window.SqlShare;
    var tokenize = window.SqlTokenize.tokenize;
    var base = document.documentElement.dataset.base || '/';
    var STEP_MS = 2200;
    var TRACE_MS = 1300;
    var MIN_LOADER_MS = 400;
    var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };

    body.querySelectorAll('pre > code.language-syntax').forEach(function (code) {
        var text = code.textContent;
        code.textContent = '';
        tokenize(text).forEach(function (t, i, all) {
            var fn = t.type === 'ident' && all[i + 1] && all[i + 1].text === '(';
            if (t.type === 'ws' || (t.type === 'ident' && !fn) || t.type === 'quoted') code.appendChild(document.createTextNode(t.text));
            else code.appendChild(el('span', 'tok-' + (fn ? 'function' : t.type), t.text));
        });
    });

    var blocks = body.querySelectorAll('pre > code.language-sql, pre > code.language-sql-school');
    if (!blocks.length) return;

    var engine = new window.SqlClient.WorkerEngine();
    var schemas = {};
    var queue = Promise.resolve();
    // কাজ লাইনে দাঁড় করায়; একটা ভাঙলেও পরেরগুলো চলে
    var enqueue = function (job) {
        var next = queue.then(job, job);
        queue = next.catch(function () {});
        return next;
    };

    async function schemaOf(dataset) {
        if (!schemas[dataset]) schemas[dataset] = await Db.loadSchema(engine);
        return schemas[dataset];
    }

    function mountBox(code) {
        var dataset = code.classList.contains('language-sql-school') ? 'school' : 'dokan';
        var initial = code.textContent.replace(/\n+$/, '');
        var log = [];
        var schema = Db.EMPTY_SCHEMA;

        var box = el('div', 'try');
        var head = el('div', 'try-head');
        head.appendChild(el('span', 'try-label', ui.tryLabel));
        head.appendChild(el('span', 'try-note', dataset === 'school' ? ui.tryNoteSchool : ui.tryNote));
        var open = el('a', '', ui.openInPlayground);
        open.href = base;
        head.appendChild(open);
        box.appendChild(head);
        code.parentNode.replaceWith(box);

        var editor = window.SqlEditor.mount(box, {
            value: initial,
            compact: true,
            schema: function () { return schema; },
            onChange: function (text) { open.href = base + Share.encodeShare(text, dataset); },
            onRun: function (text) {
                var steps = nextSteps;
                nextSteps = false;
                return run(text, steps ? 'steps' : 'run');
            }
        });
        open.href = base + Share.encodeShare(initial, dataset);

        var bar = el('div', 'toolbar');
        var nextSteps = false;
        var running = false;
        var runBtn = el('button', 'btn small primary', '▶ ' + ui.tryRun);
        runBtn.type = 'button';
        var stepsBtn = el('button', 'btn small steps-btn', '▶ ' + ui.tryRunSteps);
        stepsBtn.type = 'button';
        var resetBtn = el('button', 'btn small', ui.tryReset);
        resetBtn.type = 'button';
        resetBtn.title = ui.tryResetTitle;
        bar.appendChild(runBtn);
        bar.appendChild(stepsBtn);
        bar.appendChild(resetBtn);
        bar.appendChild(el('kbd', '', ui.runShortcut));
        box.appendChild(bar);
        var stepSlot = el('div');
        stepSlot.hidden = true;
        box.appendChild(stepSlot);
        var resultSlot = el('div');
        box.appendChild(resultSlot);
        var loader = el('p', 'try-loading', ui.running);
        loader.setAttribute('role', 'status');
        loader.hidden = true;
        box.appendChild(loader);
        var results = V.resultPanel(resultSlot, { title: false, emptyText: ui.loadingDb, maxHeight: '20rem' });

        function busy(on, showLoader) {
            running = on;
            runBtn.disabled = on;
            stepsBtn.disabled = on;
            resetBtn.disabled = on;
            results.busy(on);
            loader.hidden = !(on && showLoader);
            if (on && showLoader) {
                stepSlot.hidden = true;
                resultSlot.hidden = true;
            }
            if (!on) resultSlot.hidden = false;
        }

        // ফল বাক্সের নিচে; ধাপ দেখালে ফলটা শেষ ধাপের ভেতরে চলে যায়
        function showPlain() {
            stepSlot.textContent = '';
            stepSlot.hidden = true;
            box.appendChild(resultSlot);
        }

        async function stagesOf(done) {
            if (!done.ok || done.result.error) return null;
            try {
                var data = await W.analyze(engine, done.result);
                if (!data) return null;
                var logical = data.stages.ok && data.stages.stages.length;
                return logical || (data.trace && data.trace.ok) ? data : null;
            } catch (e) {
                return null;
            }
        }

        // mode: 'start' (পেজ খোলার সময়, loader ছাড়া), 'run' (সরাসরি ফল), 'steps' (ধাপে ধাপে)
        async function run(text, mode) {
            if (running || !text.trim()) return;
            var user = mode !== 'start';
            var started = Date.now();
            busy(true, user);
            var stages = null;
            var failed = false;
            await enqueue(async function () {
                try {
                    await engine.load(dataset, log);
                    schema = await schemaOf(dataset);
                    var done = await W.execute(engine, text, schema);
                    results.show(done.output);
                    if (done.ok) log = log.concat(S.mutationsOf(done.result));
                    if (mode === 'steps') stages = await stagesOf(done);
                } catch (e) {
                    failed = true;
                }
            });
            if (user) await wait(MIN_LOADER_MS - (Date.now() - started));
            if (failed) results.show({ statements: [], error: { sql: '', message: '', friendly: { title: ui.loadFailed } } });
            busy(false);
            if (!stages) return showPlain();
            stepSlot.textContent = '';
            stepSlot.hidden = false;
            resultSlot.remove();
            stepSlot.appendChild(window.SqlInsight.analysisView(stages, {
                autoplay: STEP_MS,
                traceAutoplay: TRACE_MS,
                final: { label: ui.finalStep, render: function (container) { container.appendChild(resultSlot); } }
            }));
        }

        runBtn.addEventListener('click', function () { editor.run(); });
        stepsBtn.addEventListener('click', function () {
            nextSteps = true;
            editor.run();
        });
        resetBtn.addEventListener('click', function () {
            log = [];
            editor.set(initial);
            open.href = base + Share.encodeShare(initial, dataset);
            run(initial, 'run');
        });

        return function () { return run(initial, 'start'); };
    }

    blocks.forEach(function (code) {
        var start = mountBox(code);
        start();
    });
})();
