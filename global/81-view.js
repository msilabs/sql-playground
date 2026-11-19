// DOM: ছোট সাহায্য (element বানানো, `ব্যাকটিক` লেখা), ফলের table আর ফলের প্যানেল।
(function () {
    if (typeof document === 'undefined') return;
    var bn = window.SqlBn.bn;
    var ui = window.SqlText.ui;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    // `ব্যাকটিক` দিয়ে ঘেরা অংশ কোডের মতো দেখায়
    function rich(node, text) {
        String(text).split(/(`[^`]+`)/g).forEach(function (part) {
            if (part.length > 1 && part[0] === '`' && part[part.length - 1] === '`') node.appendChild(el('code', '', part.slice(1, -1)));
            else if (part) node.appendChild(document.createTextNode(part));
        });
        return node;
    }

    function cell(value) {
        if (value === null) return el('span', 'null', 'NULL');
        if (value instanceof Uint8Array) return el('span', 'null', '[BLOB ' + bn(value.length) + ' byte]');
        return document.createTextNode(String(value));
    }

    // ফলের table: উপরের সারি আটকে থাকে, সংখ্যা ডানে, NULL আলাদা করে চেনা যায়।
    // marks: WHERE/HAVING-এ কোন row টিকল; groups: GROUP BY-এ কোন row কোন দলে;
    // states: index দিয়ে খোঁজার সময় প্রতিটা row-এর অবস্থা (skip, seek, keep, drop, stop, pending);
    // pk: যে column-গুলো primary key, তাদের মাথায় PK চিহ্ন
    function table(opts) {
        var wrap = el('div', 'tbl-wrap');
        wrap.tabIndex = 0;
        if (opts.label) wrap.setAttribute('aria-label', opts.label);
        if (opts.maxHeight) wrap.style.maxHeight = opts.maxHeight;
        var gutter = opts.marks !== undefined || opts.groups !== undefined || opts.states !== undefined;
        var pk = opts.pk || [];
        var t = el('table', 'tbl');
        var head = el('tr');
        head.appendChild(el('th', 'rn', '#'));
        if (gutter) head.appendChild(el('th'));
        opts.columns.forEach(function (c) {
            var th = el('th', '', c);
            if (pk.indexOf(c) >= 0) {
                var badge = el('span', 'badge pk', ui.pk);
                badge.title = ui.pkTitle;
                th.appendChild(badge);
            }
            head.appendChild(th);
        });
        var thead = el('thead');
        thead.appendChild(head);
        t.appendChild(thead);
        var body = el('tbody');
        opts.rows.forEach(function (row, r) {
            var tr = el('tr');
            var state = opts.states ? opts.states[r] : undefined;
            var dropped = (opts.marks !== undefined && !opts.marks[r]) || state === 'drop';
            if (state) tr.classList.add('st-' + state);
            if (opts.cur === r) tr.classList.add('st-current');
            var group = opts.groups ? opts.groups[r] : undefined;
            if (dropped) tr.classList.add('dropped');
            if (group !== undefined) tr.className += ' group-row group-' + (group % 8);
            tr.appendChild(el('td', 'rn', bn(r + 1)));
            if (gutter) {
                var mark = el('td', 'mark');
                if (state) {
                    mark.className += ' ' + state;
                    mark.textContent = (opts.cur === r ? '→ ' : '') + (ui.rowState[state] ?? '');
                } else if (opts.marks !== undefined) {
                    mark.className += opts.marks[r] ? ' keep' : ' drop';
                    mark.textContent = opts.marks[r] ? '✓ ' + ui.kept : '✕ ' + ui.dropped;
                } else mark.textContent = ui.group(group + 1);
                tr.appendChild(mark);
            }
            row.forEach(function (v) {
                var td = el('td', typeof v === 'number' ? 'num' : '');
                if (typeof v === 'string' && v.length > 40) td.title = v;
                td.appendChild(cell(v));
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        t.appendChild(body);
        wrap.appendChild(t);
        return wrap;
    }

    function statementView(st, maxHeight) {
        if (st.columns.length === 0) return el('p', 'res-ok', st.changes > 0 ? ui.changed(st.changes) : ui.ranOk);
        var box = el('div', 'res');
        box.appendChild(el('p', 'res-meta', ui.rowsMeta(st.total, st.capped, st.ms)));
        if (st.total === 0) box.appendChild(el('p', 'res-empty', ui.noRows));
        else box.appendChild(table({ columns: st.columns, rows: st.rows, label: ui.resultTitle, maxHeight: maxHeight }));
        if (st.rows.length < st.total) box.appendChild(el('p', 'res-meta', ui.shownRows(st.rows.length)));
        return box;
    }

    function errorView(error) {
        var box = el('div', 'err');
        box.setAttribute('role', 'alert');
        box.appendChild(rich(el('p', 'err-title'), error.friendly.title));
        if (error.friendly.hint) box.appendChild(rich(el('p', 'err-hint'), error.friendly.hint));
        if (error.sql) {
            var where = el('p', 'err-sql', ui.errorIn + ' ');
            where.appendChild(el('code', '', error.sql));
            box.appendChild(where);
        }
        if (error.message) {
            var details = el('details');
            details.appendChild(el('summary', '', ui.originalError));
            details.appendChild(el('code', '', error.message));
            box.appendChild(details);
        }
        return box;
    }

    function explanationView(explanation) {
        var box = el('div', 'explain');
        box.appendChild(el('h3', '', ui.explainTitle));
        if (explanation.steps.length) {
            var ol = el('ol');
            explanation.steps.forEach(function (s) { ol.appendChild(rich(el('li'), s)); });
            box.appendChild(ol);
        }
        box.appendChild(rich(el('p', 'sum'), explanation.summary));
        if (explanation.warning) box.appendChild(el('p', 'warn', '⚠ ' + explanation.warning));
        return box;
    }

    // output: { statements, error?: { sql, message, friendly }, explanation? }
    function resultPanel(container, opts) {
        opts = opts || {};
        var root = el('div', 'res');
        if (opts.title !== false) {
            var head = el('div', 'card-head');
            head.style.marginBottom = '0';
            head.appendChild(el('h2', 'card-title', ui.resultTitle));
            root.appendChild(head);
        }
        var body = el('div', 'res');
        root.appendChild(body);
        container.appendChild(root);

        function clear() {
            body.textContent = '';
            if (opts.empty !== false) body.appendChild(el('p', 'res-empty', opts.emptyText || ui.resultEmpty));
        }

        function show(output) {
            body.textContent = '';
            var count = output.statements.length;
            var slot = el('div');
            function pick(i) {
                slot.textContent = '';
                slot.appendChild(statementView(output.statements[i], opts.maxHeight));
                tabs.querySelectorAll('button').forEach(function (b, j) { b.classList.toggle('on', i === j); });
            }
            var tabs = el('div', 'res-tabs');
            if (count > 1) {
                output.statements.forEach(function (st, i) {
                    var b = el('button', '', bn(i + 1) + '. ' + st.sql);
                    b.type = 'button';
                    b.title = st.sql;
                    b.addEventListener('click', function () { pick(i); });
                    tabs.appendChild(b);
                });
                body.appendChild(tabs);
            }
            body.appendChild(slot);
            if (count > 0) pick(count - 1);
            if (output.error) body.appendChild(errorView(output.error));
            if (output.explanation && opts.explain !== false) body.appendChild(explanationView(output.explanation));
        }

        function busy(on) { root.setAttribute('aria-busy', String(on)); }

        clear();
        return { show: show, clear: clear, busy: busy };
    }

    window.SqlView = { el: el, rich: rich, cell: cell, table: table, resultPanel: resultPanel };
})();
