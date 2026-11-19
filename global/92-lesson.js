// DOM: পাঠের ভেতরের SQL বাক্স।
//   ```sql          চালানো যায় এমন বাক্স, "অনলাইন দোকান" ডেটায় (পেজ খুললে একবার নিজে চলে)
//   ```sql-school   একই, "স্কুল" ডেটায়
//   ```syntax       শুধু রঙিন কোড (গঠন দেখানোর জন্য), চালানো যায় না
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
            onRun: run
        });
        open.href = base + Share.encodeShare(initial, dataset);

        var bar = el('div', 'toolbar');
        var runBtn = el('button', 'btn small primary', '▶ ' + ui.run);
        runBtn.type = 'button';
        var resetBtn = el('button', 'btn small', ui.tryReset);
        resetBtn.type = 'button';
        resetBtn.title = ui.tryResetTitle;
        bar.appendChild(runBtn);
        bar.appendChild(resetBtn);
        bar.appendChild(el('kbd', '', ui.runShortcut));
        box.appendChild(bar);
        var resultSlot = el('div');
        box.appendChild(resultSlot);
        var results = V.resultPanel(resultSlot, { title: false, emptyText: ui.loadingDb, maxHeight: '20rem' });

        function busy(on) {
            runBtn.disabled = on;
            resetBtn.disabled = on;
            results.busy(on);
        }

        function run(text) {
            if (!text.trim()) return;
            busy(true);
            return enqueue(async function () {
                try {
                    await engine.load(dataset, log);
                    schema = await schemaOf(dataset);
                    var done = await W.execute(engine, text, schema);
                    results.show(done.output);
                    if (done.ok) log = log.concat(S.mutationsOf(done.result));
                } catch (e) {
                    results.show({ statements: [], error: { sql: '', message: '', friendly: { title: ui.loadFailed } } });
                } finally {
                    busy(false);
                }
            });
        }

        runBtn.addEventListener('click', function () { editor.run(); });
        resetBtn.addEventListener('click', function () {
            log = [];
            editor.set(initial);
            open.href = base + Share.encodeShare(initial, dataset);
            run(initial);
        });

        return function () { return run(initial); };
    }

    blocks.forEach(function (code) {
        var start = mountBox(code);
        start();
    });
})();
