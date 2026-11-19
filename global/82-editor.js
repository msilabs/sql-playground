// DOM: SQL editor। স্বচ্ছ textarea-র ঠিক নিচে একই মাপে রঙিন লেখা আঁকা হয়।
// লিখতে লিখতে keyword, table আর column-এর পরামর্শ আসে (Ctrl+Space দিয়েও)।
// Ctrl/⌘+Enter চালায়; কিছু সিলেক্ট করা থাকলে শুধু সেটুকু।
(function () {
    if (typeof document === 'undefined') return;
    var tokenize = window.SqlTokenize.tokenize;
    var Complete = window.SqlComplete;
    var ui = window.SqlText.ui;
    var el = window.SqlView.el;

    var KIND_LABEL = { keyword: 'keyword', table: 'table', column: 'column', function: 'ফাংশন' };
    var isWordInput = function (data) { return data !== null && data !== undefined && /^[\p{L}\p{N}_.]$/u.test(data); };
    var nextId = 1;

    function paint(pre, text) {
        pre.textContent = '';
        var tokens = tokenize(text);
        tokens.forEach(function (t, i) {
            if (t.type === 'ws' || t.type === 'ident' && !(tokens[i + 1] && tokens[i + 1].text === '(') || t.type === 'quoted') {
                pre.appendChild(document.createTextNode(t.text));
                return;
            }
            var type = t.type === 'ident' ? 'function' : t.type;
            pre.appendChild(el('span', 'tok-' + type, t.text));
        });
        // শেষে নতুন লাইন থাকলে উচ্চতা ঠিক রাখতে
        if (text === '' || text.endsWith('\n')) pre.appendChild(document.createTextNode(' '));
    }

    function mount(container, opts) {
        var id = nextId++;
        var schema = function () { return opts.schema ? opts.schema() : { tables: [] }; };
        var root = el('div', 'ed' + (opts.compact ? ' compact' : ''));
        var box = el('div', 'ed-box');
        var pre = el('pre', 'ed-layer ed-hl');
        pre.setAttribute('aria-hidden', 'true');
        var input = el('textarea', 'ed-layer ed-input');
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('aria-label', opts.label || ui.editorLabel);
        input.setAttribute('aria-autocomplete', 'list');
        if (opts.placeholder) input.placeholder = opts.placeholder;
        var suggest = el('div', 'ed-suggest');
        suggest.setAttribute('aria-live', 'polite');
        box.appendChild(pre);
        box.appendChild(input);
        root.appendChild(box);
        root.appendChild(suggest);
        container.appendChild(root);

        var completion = null;
        var active = 0;

        function set(text) {
            input.value = text;
            paint(pre, text);
        }

        function change(text) {
            paint(pre, text);
            if (opts.onChange) opts.onChange(text);
        }

        function setCursor(pos) {
            requestAnimationFrame(function () {
                input.focus();
                input.setSelectionRange(pos, pos);
            });
        }

        function renderSuggest() {
            suggest.textContent = '';
            input.removeAttribute('aria-activedescendant');
            if (!completion) return;
            var list = el('div', 'ed-suggest');
            list.id = 'sql-completions-' + id;
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'পরামর্শ');
            completion.items.forEach(function (item, i) {
                var b = el('button', i === active ? 'on' : '', item.label);
                b.type = 'button';
                b.tabIndex = -1;
                b.id = 'sql-completion-' + id + '-' + i;
                b.setAttribute('role', 'option');
                b.setAttribute('aria-selected', String(i === active));
                b.appendChild(el('small', '', item.detail || KIND_LABEL[item.kind]));
                b.addEventListener('mousedown', function (e) { e.preventDefault(); });
                b.addEventListener('click', function () { accept(item); });
                list.appendChild(b);
            });
            suggest.appendChild(list);
            suggest.appendChild(el('span', 'ed-tip', ui.completionHint));
            input.setAttribute('aria-activedescendant', 'sql-completion-' + id + '-' + active);
        }

        function close() {
            completion = null;
            renderSuggest();
        }

        function accept(item) {
            if (!completion) return;
            var next = Complete.applySuggestion(input.value, completion, item);
            input.value = next.text;
            change(next.text);
            close();
            setCursor(next.cursor);
        }

        function run() {
            var selected = input.selectionStart !== input.selectionEnd ? input.value.slice(input.selectionStart, input.selectionEnd) : '';
            close();
            if (opts.onRun) opts.onRun(selected.trim() ? selected : input.value);
        }

        input.addEventListener('input', function (e) {
            change(input.value);
            if (opts.autocomplete !== false && isWordInput(e.data)) {
                completion = Complete.complete(input.value, input.selectionStart, schema());
                active = 0;
            } else completion = null;
            renderSuggest();
        });

        input.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                run();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
                e.preventDefault();
                completion = Complete.complete(input.value, input.selectionStart, schema());
                active = 0;
                renderSuggest();
                return;
            }
            if (!completion) return;
            var n = completion.items.length;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                active = (active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
                renderSuggest();
            } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                accept(completion.items[active] || completion.items[0]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });

        input.addEventListener('blur', function () { setTimeout(close, 150); });

        set(opts.value || '');

        return {
            value: function () { return input.value; },
            set: set,
            insert: function (text) {
                var start = input.selectionStart ?? input.value.length;
                var end = input.selectionEnd ?? input.value.length;
                var next = input.value.slice(0, start) + text + input.value.slice(end);
                input.value = next;
                change(next);
                setCursor(start + text.length);
            },
            focus: function () { input.focus(); },
            run: run
        };
    }

    window.SqlEditor = { mount: mount };
})();
