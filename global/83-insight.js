// DOM: "query কীভাবে চলে" প্যানেল। দুই ট্যাব: ধাপে ধাপে (চলার ক্রমে প্রতিটা ধাপের table)
// আর JOIN (দুই table পাশাপাশি, কোন row কোনটার সাথে মিলল তা লাইন টেনে)।
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

    function stageViewer(result) {
        var root = el('div');
        if (!result.ok) {
            root.appendChild(el('p', 'insight-empty', result.message));
            return root;
        }
        var stages = result.stages;
        var index = 0;
        var order = el('div', 'order-box');
        order.appendChild(orderRow(ui.writtenOrder, result.written, false));
        order.appendChild(orderRow(ui.runOrder, stages.map(function (s) { return s.label; }), true));
        root.appendChild(order);

        var steps = el('ol', 'steps');
        steps.setAttribute('aria-label', ui.runOrder);
        var buttons = stages.map(function (s, i) {
            var li = el('li');
            var b = el('button', s.error ? 'bad' : '', bn(i + 1) + '. ' + s.label);
            b.type = 'button';
            b.addEventListener('click', function () { go(i); });
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
        prev.addEventListener('click', function () { go(index - 1); });
        next.addEventListener('click', function () { go(index + 1); });
        nav.appendChild(prev);
        nav.appendChild(where);
        nav.appendChild(next);
        root.appendChild(nav);

        var body = el('div');
        root.appendChild(body);

        function go(i) {
            index = Math.max(0, Math.min(stages.length - 1, i));
            var stage = stages[index];
            buttons.forEach(function (b, j) {
                b.classList.toggle('on', j === index);
                if (j === index) b.setAttribute('aria-current', 'step');
                else b.removeAttribute('aria-current');
            });
            prev.disabled = index === 0;
            next.disabled = index >= stages.length - 1;
            where.textContent = ui.stepOf(index + 1, stages.length);
            body.textContent = '';
            body.appendChild(el('p', 'stage-title', stage.title));
            body.appendChild(el('code', 'clause', stage.clause));
            body.appendChild(V.rich(el('p', 'stage-note'), stage.note));
            if (stage.error) {
                var err = el('p', 'notice warn', ui.stageFailed + ' ');
                err.appendChild(el('code', '', stage.error));
                body.appendChild(err);
                return;
            }
            body.appendChild(V.table({ columns: stage.columns, rows: stage.rows, marks: stage.marks, groups: stage.groups, maxHeight: '24rem', label: stage.label }));
            if (stage.rows.length < stage.total) body.appendChild(el('p', 'res-meta', ui.shownRows(stage.rows.length)));
        }
        if (stages.length) go(0);
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

    function mount(container) {
        var head = el('div', 'card-head');
        head.appendChild(el('h2', 'card-title', ui.insightTitle));
        var tabs = el('div', 'tabs');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', ui.insightTitle);
        var tab = 'stages';
        var tabButtons = {};
        [['stages', ui.stagesTab], ['join', ui.joinTab]].forEach(function (t) {
            var b = el('button', '', t[1]);
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.addEventListener('click', function () {
                tab = t[0];
                render();
            });
            tabButtons[t[0]] = b;
            tabs.appendChild(b);
        });
        head.appendChild(tabs);
        var body = el('div');
        body.setAttribute('role', 'tabpanel');
        container.appendChild(head);
        container.appendChild(body);

        var state = { status: 'idle' };

        function render() {
            Object.keys(tabButtons).forEach(function (k) {
                tabButtons[k].classList.toggle('on', k === tab);
                tabButtons[k].setAttribute('aria-selected', String(k === tab));
            });
            body.textContent = '';
            if (state.status === 'idle') body.appendChild(el('p', 'insight-empty', ui.insightEmpty));
            else if (state.status === 'loading') body.appendChild(el('p', 'loading', ui.insightLoading));
            else if (tab === 'stages') body.appendChild(stageViewer(state.stages));
            else if (state.join) body.appendChild(joinViewer(state.join));
            else body.appendChild(el('p', 'insight-empty', state.hasJoin ? ui.joinUnavailable : ui.noJoin));
        }

        render();
        return {
            idle: function () { state = { status: 'idle' }; render(); },
            loading: function () { state = { status: 'loading' }; render(); },
            show: function (data) { state = Object.assign({ status: 'ready' }, data); render(); }
        };
    }

    window.SqlInsight = { mount: mount };
})();
