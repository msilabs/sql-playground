// DOM: table-এর তালিকা। নাম চাপলে column দেখা যায়; column-এর নাম চাপলে editor-এ বসে।
// editor-এর query-তে যে table আছে, সেটা নিজে থেকে খোলা থাকে (নিজে খুললে বা বন্ধ করলে সেটাই থাকে)।
(function () {
    if (typeof document === 'undefined') return;
    var ui = window.SqlText.ui;
    var Ds = window.SqlDatasets;
    var aliasMap = window.SqlComplete.aliasMap;
    var el = window.SqlView.el;

    function mount(container, opts) {
        var manual = {};
        var last = null;

        var head = el('div', 'card-head');
        head.style.marginBottom = '4px';
        head.appendChild(el('h2', 'card-title', ui.schemaTitle));
        var dsName = el('span', 'ds-name');
        head.appendChild(dsName);
        container.appendChild(head);
        container.appendChild(el('p', 'hint-line', ui.schemaHint));
        var list = el('ul', 'schema');
        container.appendChild(list);
        var foot = el('p', 'schema-foot');
        var switcher = el('button', 'link-btn');
        switcher.type = 'button';
        foot.appendChild(switcher);
        if (opts.onDataset) container.appendChild(foot);

        switcher.addEventListener('click', function () {
            if (!last) return;
            manual = {};
            opts.onDataset(last.dataset === Ds.DEFAULT_DATASET ? 'school' : Ds.DEFAULT_DATASET);
        });

        function render(schema, state) {
            last = state;
            var used = new Set(aliasMap(state.editorText || '', schema).values());
            var isDefault = state.dataset === Ds.DEFAULT_DATASET;
            dsName.textContent = isDefault ? '' : Ds.datasetById(state.dataset).title;
            switcher.textContent = isDefault ? ui.tryOtherDataset : ui.backToMainDataset;
            switcher.disabled = state.disabled;
            list.textContent = '';
            schema.tables.forEach(function (t) {
                var li = el('li');
                var details = el('details');
                details.open = manual[t.name] ?? used.has(t.name);
                details.addEventListener('toggle', function () { manual[t.name] = details.open; });
                var summary = el('summary');
                summary.appendChild(el('b', '', t.name));
                if (t.kind === 'view') summary.appendChild(el('span', 'badge fk', ui.viewBadge));
                if (t.rowCount !== null) summary.appendChild(el('small', '', ui.rowCount(t.rowCount)));
                details.appendChild(summary);

                var cols = el('ul', 'schema-cols');
                t.columns.forEach(function (c) {
                    var row = el('li');
                    var name = el('button', '', c.name);
                    name.type = 'button';
                    name.title = ui.insertName(c.name);
                    name.addEventListener('click', function () { opts.onInsert(c.name); });
                    row.appendChild(name);
                    row.appendChild(el('span', 'type', c.type));
                    if (c.pk) {
                        var pk = el('span', 'badge pk', ui.pk);
                        pk.title = ui.pkTitle;
                        row.appendChild(pk);
                    }
                    if (c.ref) {
                        var fk = el('span', 'badge fk', '→ ' + c.ref.table);
                        fk.title = ui.fkTitle(c.ref.table, c.ref.column);
                        row.appendChild(fk);
                    }
                    cols.appendChild(row);
                });
                details.appendChild(cols);

                var actions = el('div', 'schema-actions');
                if (opts.onView) {
                    var view = el('button', 'btn small', ui.viewTable);
                    view.type = 'button';
                    view.disabled = state.disabled;
                    view.setAttribute('aria-label', ui.viewTableLabel(t.name));
                    view.addEventListener('click', function () { opts.onView(t.name); });
                    actions.appendChild(view);
                }
                var insert = el('button', 'btn small', ui.insertTable);
                insert.type = 'button';
                insert.title = ui.insertName(t.name);
                insert.addEventListener('click', function () { opts.onInsert(t.name); });
                actions.appendChild(insert);
                details.appendChild(actions);

                li.appendChild(details);
                list.appendChild(li);
            });
            if (!schema.tables.length) list.appendChild(el('li', 'loading', ui.loadingDb));
        }

        return { render: render };
    }

    window.SqlSchemaView = { mount: mount };
})();
