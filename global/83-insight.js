// DOM: query কীভাবে চলে। ট্যাব: বাস্তবে যেভাবে চলে (row ধরে ধরে), যুক্তির ক্রম (প্রতিটা ধাপের table)
// আর JOIN (দুই table পাশাপাশি, কোন row কোনটার সাথে মিলল তা লাইন টেনে)। পাঠের বাক্স আর Playground দুজনেই ব্যবহার করে।
(function () {
    if (typeof document === 'undefined') return;
    var bn = window.SqlBn.bn;
    var ui = window.SqlText.ui;
    var V = window.SqlView;
    var el = V.el;
    var displayColumns = window.SqlJoin.displayColumns;

    function orderRow(label, items, arrows) {
        var row = el('div', 'order-row');
        row.appendChild(el('span', '', label));
        items.forEach(function (item, i) {
            row.appendChild(el('code', '', item));
            if (i < items.length - 1) row.appendChild(el('i', '', arrows ? '→' : '·'));
        });
        return row;
    }

    // SQL চলার আগে যে table-গুলো থেকে পড়া হবে, শুরুতে বন্ধ থাকে
    function sourcesView(sources) {
        var box = el('details', 'sources');
        var summary = el('summary');
        summary.appendChild(el('span', 'sources-label', ui.sourcesTitle));
        sources.forEach(function (src) {
            var chip = el('code', '', src.name);
            chip.appendChild(el('small', '', ' · ' + ui.rowCount(src.total)));
            summary.appendChild(chip);
        });
        box.appendChild(summary);
        var inner = el('div', 'sources-body');
        inner.appendChild(el('p', 'res-meta', ui.sourcesHint));
        sources.forEach(function (src) {
            var title = el('p', 'sources-name', src.name);
            if (src.view) title.appendChild(el('span', 'badge', ui.viewBadge));
            inner.appendChild(title);
            inner.appendChild(V.table({ columns: src.columns, rows: src.rows, pk: src.pk, maxHeight: '16rem', label: src.name }));
            if (src.rows.length < src.total) inner.appendChild(el('p', 'res-meta', ui.joinShown(src.rows.length, src.total)));
        });
        box.appendChild(inner);
        return box;
    }

    // opts.autoplay: এত ms পরপর নিজে পরের ধাপে যায় (কেউ বোতাম চাপলে থামে)
    // opts.final: { label, render(container) } শেষে একটা বাড়তি ধাপ, যেমন পুরো ফল
    function stageViewer(result, opts) {
        opts = opts || {};
        var root = el('div', 'stage-viewer');
        if (!result.ok) {
            root.appendChild(el('p', 'insight-empty', result.message));
            return root;
        }
        var stages = result.stages;
        var final = opts.final || null;
        var total = stages.length + (final ? 1 : 0);
        var index = 0;
        var timer = null;
        if (!opts.noSources && result.sources && result.sources.length) root.appendChild(sourcesView(result.sources));
        var order = el('div', 'order-box');
        order.appendChild(orderRow(ui.writtenOrder, result.written, false));
        var runLabels = stages.map(function (s) { return s.label; }).filter(function (l, i, all) { return l !== all[i - 1]; });
        order.appendChild(orderRow(ui.runOrder, runLabels, true));
        order.appendChild(el('p', 'order-note', ui.logicalNote));
        root.appendChild(order);

        var steps = el('ol', 'steps');
        steps.setAttribute('aria-label', ui.runOrder);
        var labels = stages.map(function (s) { return { text: s.label + (s.sub ? ' · ' + s.sub : ''), bad: Boolean(s.error) }; });
        if (final) labels.push({ text: final.label, bad: false });
        var buttons = labels.map(function (s, i) {
            var li = el('li');
            var b = el('button', s.bad ? 'bad' : '', (final && i === stages.length ? '✓ ' : bn(i + 1) + '. ') + s.text);
            b.type = 'button';
            b.addEventListener('click', function () { stop(); go(i); });
            li.appendChild(b);
            steps.appendChild(li);
            return b;
        });
        root.appendChild(steps);

        var nav = el('div', 'step-nav');
        var prev = el('button', 'btn small', ui.prev);
        prev.type = 'button';
        var where = el('span', '');
        where.setAttribute('aria-live', 'polite');
        var next = el('button', 'btn small primary', ui.next);
        next.type = 'button';
        prev.addEventListener('click', function () { stop(); go(index - 1); });
        next.addEventListener('click', function () { stop(); go(index + 1); });
        nav.appendChild(prev);
        var middle = el('span', 'step-mid');
        middle.appendChild(where);
        var playBtn = null;
        if (opts.autoplay) {
            playBtn = el('button', 'btn small step-play');
            playBtn.type = 'button';
            playBtn.addEventListener('click', function () {
                if (timer) stop();
                else play(index >= total - 1 ? 0 : index + 1);
            });
            middle.appendChild(playBtn);
            root.style.setProperty('--step-ms', opts.autoplay + 'ms');
        }
        nav.appendChild(middle);
        nav.appendChild(next);
        root.appendChild(nav);

        var body = el('div');
        root.appendChild(body);

        function renderPlay() {
            if (!playBtn) return;
            playBtn.textContent = timer ? ui.pauseSteps : index >= total - 1 ? ui.replaySteps : ui.playSteps;
            buttons.forEach(function (b, j) { b.classList.toggle('playing', Boolean(timer) && j === index); });
        }

        function stop() {
            clearTimeout(timer);
            timer = null;
            renderPlay();
        }

        function tick() {
            timer = setTimeout(function () {
                timer = null;
                if (!root.isConnected) return renderPlay();
                go(index + 1);
                if (index < total - 1) tick();
                renderPlay();
            }, opts.autoplay);
        }

        function play(from) {
            clearTimeout(timer);
            go(from);
            if (index < total - 1) tick();
            renderPlay();
        }

        function go(i) {
            index = Math.max(0, Math.min(total - 1, i));
            buttons.forEach(function (b, j) {
                b.classList.toggle('on', j === index);
                b.classList.toggle('past', j < index);
                if (j === index) b.setAttribute('aria-current', 'step');
                else b.removeAttribute('aria-current');
            });
            prev.disabled = index === 0;
            next.disabled = index >= total - 1;
            where.textContent = ui.stepOf(index + 1, total);
            var fresh = el('div', 'stage-body');
            body.replaceWith(fresh);
            body = fresh;
            renderPlay();
            if (final && index === stages.length) {
                final.render(body);
                return;
            }
            var stage = stages[index];
            body.appendChild(el('p', 'stage-title', stage.title));
            body.appendChild(el('code', 'clause', stage.clause));
            body.appendChild(V.rich(el('p', 'stage-note'), stage.note));
            if (stage.error) {
                var err = el('p', 'notice warn', ui.stageFailed + ' ');
                err.appendChild(el('code', '', stage.error));
                body.appendChild(err);
                return;
            }
            body.appendChild(V.table({ columns: stage.columns, rows: stage.rows, marks: stage.marks, groups: stage.groups, states: stage.states, maxHeight: '24rem', label: stage.label }));
            if (stage.rows.length < stage.total) body.appendChild(el('p', 'res-meta', ui.shownRows(stage.rows.length)));
        }
        if (total) {
            if (opts.autoplay) play(0);
            else go(0);
        }
        return root;
    }

    // বাস্তবে যেভাবে চলে: প্রতিটা frame-এ table (কোন row পড়ছে), জমার বাক্স আর এ পর্যন্ত ফল।
    // opts: autoplay (ms), final ({ label, render }), sources
    function traceViewer(trace, opts) {
        opts = opts || {};
        var root = el('div', 'trace-viewer');
        if (opts.sources && opts.sources.length) root.appendChild(sourcesView(opts.sources));
        var frames = trace.frames;
        var final = opts.final || null;
        var total = frames.length + (final ? 1 : 0);
        var index = 0;
        var timer = null;

        var phases = trace.phases.slice();
        if (final) phases.push('final');
        var firstOf = {};
        frames.forEach(function (f, i) { if (firstOf[f.phase] === undefined) firstOf[f.phase] = i; });
        firstOf.final = frames.length;
        var chips = el('ol', 'steps');
        var chipButtons = phases.map(function (p, i) {
            var li = el('li');
            var name = p === 'read' && trace.tables.length > 1 ? ui.tracePhaseJoinRead : ui.tracePhase[p];
            var b = el('button', '', p === 'final' ? '✓ ' + final.label : bn(i + 1) + '. ' + name);
            b.type = 'button';
            b.addEventListener('click', function () { stop(); go(firstOf[p]); });
            li.appendChild(b);
            chips.appendChild(li);
            return b;
        });
        root.appendChild(chips);

        var nav = el('div', 'step-nav');
        var prev = el('button', 'btn small', ui.prev);
        prev.type = 'button';
        var next = el('button', 'btn small primary', ui.next);
        next.type = 'button';
        var where = el('span', '');
        where.setAttribute('aria-live', 'polite');
        var middle = el('span', 'step-mid');
        middle.appendChild(where);
        var playBtn = null;
        if (opts.autoplay) {
            playBtn = el('button', 'btn small step-play');
            playBtn.type = 'button';
            playBtn.addEventListener('click', function () {
                if (timer) stop();
                else play(index >= total - 1 ? 0 : index + 1);
            });
            middle.appendChild(playBtn);
            root.style.setProperty('--step-ms', opts.autoplay + 'ms');
        }
        prev.addEventListener('click', function () { stop(); go(index - 1); });
        next.addEventListener('click', function () { stop(); go(index + 1); });
        nav.appendChild(prev);
        nav.appendChild(middle);
        nav.appendChild(next);
        root.appendChild(nav);

        var slider = el('input', 'trace-slider');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(total - 1);
        slider.setAttribute('aria-label', ui.traceSlider);
        slider.addEventListener('input', function () { stop(); go(Number(slider.value)); });
        root.appendChild(slider);

        var body = el('div', 'trace-body');
        root.appendChild(body);
        root.appendChild(el('p', 'res-meta trace-foot', ui.traceBasis));

        function renderPlay() {
            if (!playBtn) return;
            playBtn.textContent = timer ? ui.pauseSteps : index >= total - 1 ? ui.replaySteps : ui.playSteps;
        }
        function stop() {
            clearTimeout(timer);
            timer = null;
            renderPlay();
        }
        function tick() {
            timer = setTimeout(function () {
                timer = null;
                if (!root.isConnected) return renderPlay();
                go(index + 1);
                if (index < total - 1) tick();
                renderPlay();
            }, opts.autoplay);
        }
        function play(from) {
            clearTimeout(timer);
            go(from);
            if (index < total - 1) tick();
            renderPlay();
        }

        function section(title, node) {
            var sec = el('div', 'trace-sec');
            sec.appendChild(el('p', 'trace-sec-title', title));
            sec.appendChild(node);
            return sec;
        }

        function go(i) {
            index = Math.max(0, Math.min(total - 1, i));
            var phase = index >= frames.length ? 'final' : frames[index].phase;
            var at = phases.indexOf(phase);
            chipButtons.forEach(function (b, j) {
                b.classList.toggle('on', j === at);
                b.classList.toggle('past', j < at);
            });
            prev.disabled = index === 0;
            next.disabled = index >= total - 1;
            slider.value = String(index);
            where.textContent = ui.stepOf(index + 1, total);
            renderPlay();
            body.textContent = '';
            if (final && index === frames.length) {
                final.render(body);
                return;
            }
            var f = frames[index];
            body.appendChild(V.rich(el('p', 'trace-note'), f.note));
            if (f.acc) {
                var acc = el('div', 'trace-acc');
                acc.appendChild(el('span', '', ui.traceAcc));
                f.acc.forEach(function (a) { acc.appendChild(el('code', '', a)); });
                body.appendChild(acc);
            }
            var grid = el('div', 'trace-grid');
            var srcTables = trace.tables.map(function (t, k) {
                var tbl = V.table({ columns: t.columns, rows: t.rows, states: f.src[k], cur: f.cur[k], pk: t.pk, maxHeight: t.role === 'only' ? '17rem' : '14rem', label: t.name });
                var title = t.role === 'outer' ? ui.traceOuter(t.name, t.alias) : t.role === 'inner' ? ui.traceInner(t.name, t.alias) : ui.traceTable(t.name);
                grid.appendChild(section(title, tbl));
                return tbl;
            });
            if (f.box) {
                grid.appendChild(section(ui.traceBox(f.box.rows.length), f.box.rows.length
                    ? V.table({ columns: f.box.columns, rows: f.box.rows, states: f.box.states, maxHeight: '14rem', label: ui.traceBox(f.box.rows.length) })
                    : el('p', 'res-empty', ui.traceBoxEmpty)));
            }
            grid.appendChild(section(ui.traceOut(f.outCount), f.outCount
                ? V.table({ columns: trace.outColumns, rows: trace.outRows.slice(0, f.outCount), maxHeight: '14rem', label: ui.resultTitle })
                : el('p', 'res-empty', ui.traceOutEmpty)));
            body.appendChild(grid);
            // চলতি row-টা table-এর মাঝখানে আনা (পেজ নিজে scroll না করে)
            srcTables.forEach(function (tbl) {
                var row = tbl.querySelector('tr.st-current');
                if (row) tbl.scrollTop = row.offsetTop - tbl.clientHeight / 2;
            });
        }

        if (total) {
            if (opts.autoplay) play(0);
            else go(0);
        }
        return root;
    }

    // "বাস্তবে যেভাবে চলে", "যুক্তির ক্রম" আর (JOIN থাকলে) "JOIN" ট্যাব, উপরে query-র table-গুলো।
    // data: { stages, trace, join, hasJoin }; opts: autoplay, traceAutoplay, final
    function analysisView(data, opts) {
        opts = opts || {};
        var root = el('div', 'analysis');
        var sources = data.stages && data.stages.sources;
        if (sources && sources.length) root.appendChild(sourcesView(sources));
        var tabs = el('div', 'tabs analysis-tabs');
        tabs.setAttribute('role', 'tablist');
        var body = el('div');
        body.setAttribute('role', 'tabpanel');
        root.appendChild(tabs);
        root.appendChild(body);
        var views = {};
        var first = true;
        var buttons = {};
        var traceOk = data.trace && data.trace.ok;

        function build(tab) {
            var auto = first;
            first = false;
            if (tab === 'real') {
                if (!traceOk) return el('p', 'insight-empty', ui.traceUnavailable(data.trace ? data.trace.message : ''));
                return traceViewer(data.trace, { autoplay: auto ? opts.traceAutoplay : 0, final: opts.final });
            }
            if (tab === 'join') return data.join ? joinViewer(data.join) : el('p', 'insight-empty', ui.joinUnavailable);
            return stageViewer(data.stages, { autoplay: auto ? opts.autoplay : 0, final: opts.final, noSources: true });
        }
        function show(tab) {
            if (!views[tab]) views[tab] = build(tab);
            Object.keys(buttons).forEach(function (k) {
                buttons[k].classList.toggle('on', k === tab);
                buttons[k].setAttribute('aria-selected', String(k === tab));
            });
            body.textContent = '';
            body.appendChild(views[tab]);
        }
        var list = [['real', ui.realTab], ['logical', ui.logicalTab]];
        if (data.hasJoin) list.push(['join', ui.joinTab]);
        list.forEach(function (t) {
            var b = el('button', '', t[1]);
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.addEventListener('click', function () { show(t[0]); });
            buttons[t[0]] = b;
            tabs.appendChild(b);
        });
        show(traceOk ? 'real' : 'logical');
        return root;
    }

    var HEAD_H = 30;
    var COLS_H = 24;
    var ROW_H = 30;
    var GAP_W = 76;
    var MAX_LINES = 400;
    var SVG = 'http://www.w3.org/2000/svg';

    function joinViewer(view) {
        var join = view.join;
        var left = view.left;
        var right = view.right;
        var root = el('div');
        var condition = join.on ? 'ON ' + join.on : join.using ? 'USING (' + join.using.join(', ') + ')' : '';
        root.appendChild(el('code', 'clause', (join.natural ? 'NATURAL ' : '') + join.type + ' JOIN ' + condition));
        root.appendChild(el('p', 'stage-note', ui.joinSummary(view.pairTotal)));

        var leftIndex = new Map(left.rows.map(function (r, i) { return [r.rid, i]; }));
        var rightIndex = new Map(right.rows.map(function (r, i) { return [r.rid, i]; }));
        var matched = { left: new Set(), right: new Set() };
        var nulls = { left: new Set(), right: new Set() };
        var lines = [];
        view.pairs.forEach(function (pair) {
            var l = pair[0];
            var r = pair[1];
            if (l !== null && r !== null) {
                matched.left.add(l);
                matched.right.add(r);
                if (leftIndex.has(l) && rightIndex.has(r)) lines.push({ l: leftIndex.get(l), r: rightIndex.get(r), lrid: l, rrid: r });
            } else if (l !== null) nulls.left.add(l);
            else if (r !== null) nulls.right.add(r);
        });
        var tooMany = join.type === 'CROSS' || lines.length > MAX_LINES;
        root.appendChild(el('p', 'res-meta', tooMany ? ui.crossTooMany : ui.joinHover));

        var rowEls = { left: new Map(), right: new Map() };
        var paths = [];

        function side(name, data) {
            var cols = displayColumns(data, join);
            var box = el('div', 'jv-side');
            var title = el('div', 'jv-name', data.name);
            if (data.alias !== data.name) title.appendChild(el('small', '', '(' + data.alias + ')'));
            box.appendChild(title);
            var colRow = el('div', 'jv-cols');
            cols.forEach(function (c) { colRow.appendChild(el('span', '', data.columns[c])); });
            box.appendChild(colRow);
            data.rows.forEach(function (row) {
                var state = matched[name].has(row.rid) ? 'matched' : nulls[name].has(row.rid) ? 'null' : 'none';
                var b = el('button', 'jv-row' + (state === 'matched' ? '' : ' ' + state));
                b.type = 'button';
                if (state === 'null') b.title = ui.joinNull;
                if (state === 'none') b.title = ui.joinNoMatch;
                cols.forEach(function (c) {
                    var span = el('span');
                    span.appendChild(V.cell(row.cells[c]));
                    b.appendChild(span);
                });
                if (state === 'null') b.appendChild(el('span', 'tag', 'NULL'));
                var focus = function () { highlight(name, row.rid); };
                b.addEventListener('mouseenter', focus);
                b.addEventListener('focus', focus);
                b.addEventListener('mouseleave', function () { highlight(null); });
                b.addEventListener('blur', function () { highlight(null); });
                rowEls[name].set(row.rid, b);
                box.appendChild(b);
            });
            return box;
        }

        function highlight(name, rid) {
            var partners = new Set();
            paths.forEach(function (p) {
                var on = name !== null && ((name === 'left' && p.line.lrid === rid) || (name === 'right' && p.line.rrid === rid));
                if (on) partners.add(name === 'left' ? 'right:' + p.line.rrid : 'left:' + p.line.lrid);
                p.node.setAttribute('stroke', on ? '#1ed6a8' : 'currentColor');
                p.node.setAttribute('stroke-width', on ? '2.5' : '1.25');
                p.node.style.opacity = name === null ? '.7' : on ? '1' : '.1';
            });
            ['left', 'right'].forEach(function (s) {
                rowEls[s].forEach(function (b, id) {
                    var self = s === name && id === rid;
                    var partner = partners.has(s + ':' + id);
                    b.classList.toggle('hot', self || partner);
                    b.classList.toggle('faded', name !== null && !self && !partner);
                });
            });
        }

        var scroll = el('div', 'jv-scroll');
        var jv = el('div', 'jv');
        jv.appendChild(side('left', left));
        var height = HEAD_H + COLS_H + Math.max(left.rows.length, right.rows.length) * ROW_H;
        var svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('width', GAP_W);
        svg.setAttribute('height', height);
        svg.setAttribute('aria-hidden', 'true');
        var y = function (i) { return HEAD_H + COLS_H + i * ROW_H + ROW_H / 2; };
        if (!tooMany) {
            lines.forEach(function (line) {
                var p = document.createElementNS(SVG, 'path');
                var y1 = y(line.l);
                var y2 = y(line.r);
                p.setAttribute('d', 'M0 ' + y1 + ' C ' + GAP_W / 2 + ' ' + y1 + ', ' + GAP_W / 2 + ' ' + y2 + ', ' + GAP_W + ' ' + y2);
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke', 'currentColor');
                p.setAttribute('stroke-width', '1.25');
                p.style.opacity = '.7';
                svg.appendChild(p);
                paths.push({ node: p, line: line });
            });
        }
        jv.appendChild(svg);
        jv.appendChild(side('right', right));
        scroll.appendChild(jv);
        root.appendChild(scroll);

        var legend = el('ul', 'jv-legend');
        var a = el('li');
        a.appendChild(el('span', 'sw'));
        a.appendChild(document.createTextNode(ui.joinNull));
        legend.appendChild(a);
        var b = el('li');
        b.appendChild(el('s', '', 'abc'));
        b.appendChild(document.createTextNode(ui.joinNoMatch));
        legend.appendChild(b);
        if (left.rows.length < left.total) legend.appendChild(el('li', '', left.name + ': ' + ui.joinShown(left.rows.length, left.total)));
        if (right.rows.length < right.total) legend.appendChild(el('li', '', right.name + ': ' + ui.joinShown(right.rows.length, right.total)));
        if (join.more) legend.appendChild(el('li', '', ui.joinMore));
        root.appendChild(legend);
        return root;
    }

    window.SqlInsight = { stageViewer: stageViewer, traceViewer: traceViewer, analysisView: analysisView };
})();
