/**
 * Query ধাপে ধাপে: SQLite আসলে যে ক্রমে কাজ করে (FROM → WHERE → GROUP BY → HAVING → SELECT →
 * ORDER BY → LIMIT), প্রতিটা ধাপের পরে table দেখতে কেমন, তা বের করে।
 *
 * নিজে কোনো SQL হিসাব করে না: প্রতিটা ধাপের জন্য মূল query-র টুকরো জুড়ে ছোট একটা SELECT বানায়
 * আর আসল SQLite-এ চালায়। WHERE আর HAVING-এর শর্ত একটা বাড়তি column হিসেবে হিসাব হয়
 * (`CASE WHEN … THEN 1 ELSE 0 END`), তাই কোন row টিকল আর কোনটা বাদ গেল দুটোই দেখানো যায়।
 */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./01-bn.js') : root.SqlBn;
    var bn = M0.bn;
    var M1 = isNode ? require('./04-db.js') : root.SqlDb;
    var runQuery = M1.query;
    var M2 = isNode ? require('./03-split.js') : root.SqlSplit;
    var groupTerms = M2.groupTerms, resolveAliases = M2.resolveAliases, splitSelect = M2.splitSelect, splitTopLevel = M2.splitTopLevel;
    var M3 = isNode ? require('./02-tokenize.js') : root.SqlTokenize;
    var isKeyword = M3.isKeyword, significant = M3.significant, tokenize = M3.tokenize, identName = M3.identName, isNameToken = M3.isNameToken;

    const STAGE_ROWS = 200;
    const SOURCE_ROWS = 50;
    const TITLES = {
        from: ["FROM", "table থেকে row আনা"],
        where: ["WHERE", "শর্ত দিয়ে row ছাঁকা"],
        group: ["GROUP BY", "row-গুলো দলে ভাগ করা"],
        having: ["HAVING", "দল ছাঁকা"],
        select: ["SELECT", "column বাছাই আর হিসাব"],
        order: ["ORDER BY", "সাজানো"],
        limit: ["LIMIT", "কয়টা row থাকবে"],
    };
    const FAILURE_TEXT = {
        "not-select": "ধাপে ধাপে দেখা যায় শুধু SELECT query-র। এটা DB বদলানোর query, তাই ফলটাই দেখুন।",
        compound: "UNION, INTERSECT বা EXCEPT দিয়ে জোড়া query-র ধাপ এখনো দেখানো যায় না। ফল ঠিকই এসেছে।",
        "window-clause": "WINDOW clause থাকা query-র ধাপ এখনো দেখানো যায় না। ফল ঠিকই এসেছে।",
        empty: "চালানোর মতো কোনো query নেই।",
    };
    const JOIN_WORDS = ["JOIN"];
    async function runStages(engine, statement) {
        const split = splitSelect(statement);
        if (!split.ok)
            return { ok: false, reason: split.reason, message: FAILURE_TEXT[split.reason] };
        const q = split.query;
        const W = q.with ? `${q.with} ` : "";
        /** চালায়; "no such column" হলে alias বদলে আরেকবার চেষ্টা করে */
        const attempt = async (build, rows = STAGE_ROWS) => {
            try {
                return { result: await runQuery(engine, W + build((s) => s), { maxRows: rows }) };
            }
            catch (first) {
                const message = first instanceof Error ? first.message : String(first);
                if (!message.includes("no such column"))
                    return { error: message };
                try {
                    return { result: await runQuery(engine, W + build((s) => resolveAliases(s, q.items)), { maxRows: rows }) };
                }
                catch {
                    return { error: message };
                }
            }
        };
        const count = async (build) => {
            const a = await attempt(build, 1);
            const v = a.result?.rows[0]?.[0];
            return typeof v === "number" ? v : null;
        };
        const from = (fix) => (q.from ? ` FROM ${fix(q.from)}` : "");
        const where = (fix) => (q.where ? ` WHERE ${fix(q.where)}` : "");
        const terms = groupTerms(q);
        const group = (fix) => (terms.length ? ` GROUP BY ${terms.map(fix).join(", ")}` : "");
        const having = (fix) => (q.having ? ` HAVING ${fix(q.having)}` : "");
        const selectPart = (fix) => `SELECT ${q.distinct ? "DISTINCT " : ""}${q.select}${from(fix)}${where(fix)}${group(fix)}${having(fix)}`;
        const stages = [];
        const base = (key, clause) => ({ key, label: TITLES[key][0], title: TITLES[key][1], clause });
        const plan = q.from ? await planOf(engine, statement) : [];
        // ORDER BY বা GROUP BY-এর জন্য SQLite কি row জমা করে সাজায় (temp B-tree)?
        // plan না পেলে "বাস্তবে কী হয়" অংশ বাদ, আন্দাজে কিছু লেখা হয় না
        const known = plan.length > 0;
        const sorted = (what) => plan.some((p) => p.startsWith("USE TEMP B-TREE FOR ") && p.endsWith(what));
        const search = q.where && q.from ? await indexSearch(engine, W, q, plan) : null;
        const failed = (key, clause, error) => ({
            ...base(key, clause),
            note: "এই ধাপের table বানানো গেল না।",
            columns: [],
            rows: [],
            total: 0,
            capped: false,
            error,
        });
        // ১. FROM (আর JOIN)
        if (q.from) {
            const clause = `FROM ${q.from}`;
            const a = await attempt((fix) => `SELECT *${from(fix)}`);
            if (a.result) {
                const r = a.result;
                stages.push({ ...base("from", clause), note: fromNote(q, r.total, r.capped, Boolean(search)), ...table(r) });
            }
            else
                stages.push(failed("from", clause, a.error));
        }
        // ২. WHERE: প্রতিটা row-এর পাশে শর্ত সত্য কি না
        if (search) {
            const clause = `WHERE ${q.where}`;
            for (const step of search)
                stages.push({ ...base("where", clause), ...step });
        }
        else if (q.where && q.from) {
            const clause = `WHERE ${q.where}`;
            const a = await attempt((fix) => `SELECT *, CASE WHEN (${fix(q.where)}) THEN 1 ELSE 0 END${from(fix)}`);
            if (a.result) {
                const { columns, rows, flags } = takeLastColumn(a.result);
                let kept = flags.filter(Boolean).length;
                if (a.result.capped || a.result.total > rows.length) {
                    kept = (await count((fix) => `SELECT count(*)${from(fix)}${where(fix)}`)) ?? kept;
                }
                const all = a.result.total;
                stages.push({
                    ...base("where", clause),
                    note: `${bn(all)}টা row-এর মধ্যে ${bn(kept)}টা শর্ত মেনেছে, তাই থাকল। বাকি ${bn(all - kept)}টা বাদ গেল।`,
                    columns,
                    rows,
                    total: all,
                    capped: a.result.capped,
                    marks: flags,
                });
            }
            else
                stages.push(failed("where", clause, a.error));
        }
        // ৩. GROUP BY: একই দলের row পাশাপাশি, দলের নম্বরসহ
        if (terms.length && q.from) {
            const clause = `GROUP BY ${q.groupBy}`;
            const keys = terms.map((_, i) => `__g${i}`);
            const a = await attempt((fix) => `SELECT *, ${terms.map((t, i) => `${fix(t)} AS ${keys[i]}`).join(", ")}${from(fix)}${where(fix)} ORDER BY ${keys.join(", ")}`);
            if (a.result) {
                const r = a.result;
                const n = terms.length;
                const groups = [];
                let last = "";
                let id = -1;
                for (const row of r.rows) {
                    const key = JSON.stringify(row.slice(-n));
                    if (key !== last) {
                        id++;
                        last = key;
                    }
                    groups.push(id);
                }
                let groupCount = id + 1;
                if (r.capped || r.total > r.rows.length) {
                    groupCount =
                        (await count((fix) => `SELECT count(*) FROM (SELECT 1${from(fix)}${where(fix)}${group(fix)})`)) ?? groupCount;
                }
                stages.push({
                    ...base("group", clause),
                    note: `${bn(r.total)}টা row ${terms.map((t) => `\`${t}\``).join(" আর ")} অনুযায়ী ${bn(groupCount)}টা দলে ভাগ হলো। একই রঙের row একই দলে; প্রতিটা দল শেষে একটা row হয়ে যাবে।${!known ? "" : sorted("GROUP BY") ? " দল বানাতে SQLite-কে সত্যিই সব row জমা করে দলের মান অনুযায়ী সাজাতে হয় (temp B-tree), তারপর প্রতিটা দলের হিসাব করে।" : " এখানে row-গুলো index-এর ক্রমে পড়া হয়, তাই একই দলের row পরপর আসে; আলাদা করে জমা করে সাজাতে হয় না।"}`,
                    columns: r.columns.slice(0, -n),
                    rows: r.rows.map((row) => row.slice(0, -n)),
                    total: r.total,
                    capped: r.capped,
                    groups,
                });
            }
            else
                stages.push(failed("group", clause, a.error));
        }
        // ৪. HAVING: প্রতিটা দলের পাশে শর্ত সত্য কি না
        if (q.having && q.from) {
            const clause = `HAVING ${q.having}`;
            const keyCols = terms.length ? `${terms.join(", ")}, ` : "";
            const a = await attempt((fix) => `SELECT ${keyCols}count(*) AS "row সংখ্যা", CASE WHEN (${fix(q.having)}) THEN 1 ELSE 0 END${from(fix)}${where(fix)}${group(fix)}`);
            if (a.result) {
                const { columns, rows, flags } = takeLastColumn(a.result);
                const kept = flags.filter(Boolean).length;
                stages.push({
                    ...base("having", clause),
                    note: `${bn(rows.length)}টা দলের মধ্যে ${bn(kept)}টা শর্ত মেনেছে। WHERE ছাঁকে row, আর HAVING ছাঁকে দল; তাই এখানে COUNT, SUM-এর মতো হিসাব ব্যবহার করা যায়।`,
                    columns,
                    rows,
                    total: a.result.total,
                    capped: a.result.capped,
                    marks: flags,
                });
            }
            else
                stages.push(failed("having", clause, a.error));
        }
        // ৫. SELECT
        {
            const clause = `SELECT ${q.distinct ? "DISTINCT " : ""}${q.select}`;
            const a = await attempt(selectPart);
            if (a.result) {
                const r = a.result;
                let note = selectNote(q, r.total);
                if (q.distinct && q.from) {
                    const before = await count((fix) => `SELECT count(*) FROM (SELECT ${q.select}${from(fix)}${where(fix)}${group(fix)}${having(fix)})`);
                    if (before !== null && before > r.total)
                        note += ` DISTINCT একই রকম ${bn(before - r.total)}টা row বাদ দিয়েছে।`;
                }
                stages.push({ ...base("select", clause), note, ...table(r) });
            }
            else
                stages.push(failed("select", clause, a.error));
        }
        // ৬. ORDER BY
        if (q.orderBy) {
            const clause = `ORDER BY ${q.orderBy}`;
            const a = await attempt((fix) => `${selectPart(fix)} ORDER BY ${q.orderBy}`);
            const how = !known ? null : sorted("ORDER BY") ? "sorter" : q.groupBy && sorted("GROUP BY") ? "grouped" : q.hasAggregate && !q.groupBy ? "one" : "index";
            if (a.result)
                stages.push({ ...base("order", clause), note: orderNote(q.orderBy, how), ...table(a.result) });
            else
                stages.push(failed("order", clause, a.error));
        }
        // ৭. LIMIT: পুরো query
        if (q.limit) {
            const clause = `LIMIT ${q.limit}`;
            const order = q.orderBy ? ` ORDER BY ${q.orderBy}` : "";
            const a = await attempt((fix) => `${selectPart(fix)}${order} LIMIT ${q.limit}`);
            const early = !known ? null : Boolean(q.from) && !q.groupBy && !q.hasAggregate && !sorted("ORDER BY") && !sorted("GROUP BY");
            if (a.result)
                stages.push({ ...base("limit", clause), note: limitNote(q.limit, Boolean(q.orderBy), early), ...table(a.result) });
            else
                stages.push(failed("limit", clause, a.error));
        }
        return { ok: true, stages, written: writtenOrder(q), sources: await sourceTables(engine, statement) };
    }
    /** SQLite আসলে কীভাবে চালাবে (EXPLAIN QUERY PLAN-এর প্রতিটা লাইন); না পেলে ফাঁকা */
    async function planOf(engine, statement) {
        try {
            const r = await runQuery(engine, `EXPLAIN QUERY PLAN ${statement}`, { maxRows: 100 });
            return r.rows.map((row) => String(row[3]));
        }
        catch {
            return [];
        }
    }
    const quoteName = (name) => `"${name.replace(/"/g, '""')}"`;
    const literal = (text) => `'${text.replace(/'/g, "''")}'`;
    /** query-তে যে table আর view-এর নাম আছে, প্রতিটার শুরুর row (SQL চলার আগের অবস্থা) */
    async function sourceTables(engine, statement) {
        try {
            const all = await runQuery(engine, "SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'", { maxRows: 1000 });
            const byName = new Map(all.rows.map((r) => [String(r[0]).toLowerCase(), { name: String(r[0]), view: r[1] === "view" }]));
            const tokens = significant(tokenize(statement));
            const found = [];
            tokens.forEach((t, i) => {
                if (!isNameToken(t) || tokens[i - 1]?.text === "." || tokens[i + 1]?.text === "(")
                    return;
                const hit = byName.get(identName(t).toLowerCase());
                if (hit && !found.includes(hit))
                    found.push(hit);
            });
            const sources = [];
            for (const src of found) {
                const info = await runQuery(engine, `SELECT name FROM pragma_table_info(${literal(src.name)}) WHERE pk > 0 ORDER BY pk`, { maxRows: 50 });
                const r = await runQuery(engine, `SELECT * FROM ${quoteName(src.name)}`, { maxRows: SOURCE_ROWS });
                sources.push({ name: src.name, view: src.view, pk: info.rows.map((row) => String(row[0])), ...table(r) });
            }
            return sources;
        }
        catch {
            return [];
        }
    }
    /** শর্তটাকে মাথার স্তরের AND বা OR-এ ভাগ করে (BETWEEN-এর AND, বন্ধনী আর CASE-এর ভেতর বাদে) */
    function splitLogical(text, word) {
        const parts = [];
        let depth = 0;
        let start = 0;
        let between = 0;
        for (const t of tokenize(text)) {
            if (t.text === "(" || isKeyword(t, "CASE"))
                depth++;
            else if (t.text === ")" || isKeyword(t, "END"))
                depth--;
            else if (depth === 0 && isKeyword(t, "BETWEEN"))
                between++;
            else if (depth === 0 && isKeyword(t, word)) {
                if (word === "AND" && between > 0) {
                    between--;
                    continue;
                }
                parts.push(text.slice(start, t.start).trim());
                start = t.end;
            }
        }
        parts.push(text.slice(start).trim());
        return parts;
    }
    /** পুরো লেখা একটা বন্ধনীতে ঘেরা থাকলে খুলে দেয় */
    function stripParens(text) {
        for (;;) {
            const tokens = significant(tokenize(text));
            if (tokens[0]?.text !== "(" || tokens.at(-1)?.text !== ")")
                return text;
            let depth = 0;
            const closesAtEnd = tokens.every((t, i) => {
                if (t.text === "(")
                    depth++;
                else if (t.text === ")")
                    depth--;
                return depth > 0 || i === tokens.length - 1;
            });
            if (!closesAtEnd)
                return text;
            text = text.slice(tokens[0].end, tokens.at(-1).start).trim();
        }
    }
    const COMPARE = ["=", "==", "<", "<=", ">", ">="];
    /** শর্তটা কি শুধু index-এর column আর ধ্রুব মানের তুলনা (index যেটা দিয়ে খুঁজতে পারে)? */
    function isKeyTerm(term, isKey) {
        term = stripParens(term);
        for (const word of ["OR", "AND"]) {
            const parts = splitLogical(term, word);
            if (parts.length > 1)
                return parts.every((p) => isKeyTerm(p, isKey));
        }
        const t = significant(tokenize(term));
        const constant = (list) => list.length > 0 && list.every((x, i) => !isKeyword(x, "SELECT", "NOT") && !(isNameToken(x) && list[i + 1]?.text !== "("));
        const refEnd = (i) => (isNameToken(t[i]) && t[i + 1]?.text === "." && isNameToken(t[i + 2]) ? i + 2 : i);
        const end = refEnd(0);
        if (isNameToken(t[end]) && isKey(identName(t[end]))) {
            const op = t[end + 1];
            const rest = t.slice(end + 2);
            if (op && (COMPARE.includes(op.text) || isKeyword(op, "IN", "BETWEEN") || (isKeyword(op, "IS") && !isKeyword(rest[0], "NOT"))))
                return constant(rest);
            return false;
        }
        const last = t.at(-1);
        if (isNameToken(last) && isKey(identName(last))) {
            const start = t[t.length - 2]?.text === "." ? t.length - 3 : t.length - 1;
            const op = t[start - 1];
            return Boolean(op) && COMPARE.includes(op.text) && constant(t.slice(0, start - 1));
        }
        return false;
    }
    /** FROM-এ শুধু একটা table (alias থাকতে পারে) হলে তার নাম */
    function singleTable(from) {
        const t = significant(tokenize(from));
        if (!isNameToken(t[0]))
            return null;
        const ok = t.length === 1 || (t.length === 2 && isNameToken(t[1])) || (t.length === 3 && isKeyword(t[1], "AS") && isNameToken(t[2]));
        return ok ? identName(t[0]) : null;
    }
    /**
     * WHERE যদি primary key (বা index) দিয়ে খোঁজা যায়, SQLite সব row পড়ে না: B-tree ধরে সরাসরি
     * প্রথম মেলা row-এ যায়, ক্রম ধরে পড়ে, শর্ত ভাঙলে থামে। EXPLAIN QUERY PLAN দেখে সেটা চিনে
     * WHERE-কে কয়েকটা ছোট ধাপে ভাঙে। index কাজে না লাগলে null (তখন সাধারণ WHERE ধাপ)।
     */
    /**
     * plan-এর একটা SEARCH লাইন (primary key বা index দিয়ে খোঁজা) থেকে: কোন column-এর ক্রমে
     * খোঁজে, আর WHERE-এর কোন অংশটুকু দিয়ে খোঁজে। চেনা না গেলে null।
     */
    async function indexKey(engine, name, line, where) {
        const m = /^SEARCH \S+(?: AS \S+)? USING (INTEGER PRIMARY KEY|(?:COVERING )?INDEX (\S+)) \((.*)\)$/.exec(line);
        if (!m || !where)
            return null;
        const byPk = m[1] === "INTEGER PRIMARY KEY";
        let keyCols;
        if (byPk) {
            const pk = await runQuery(engine, `SELECT name, type FROM pragma_table_info(${literal(name)}) WHERE pk > 0`, { maxRows: 50 });
            if (pk.rows.length !== 1 || !/^INTEGER$/i.test(String(pk.rows[0][1])))
                return null;
            keyCols = [String(pk.rows[0][0])];
        }
        else {
            const idx = await runQuery(engine, `SELECT name FROM pragma_index_info(${literal(m[2])}) ORDER BY seqno`, { maxRows: 50 });
            if (!idx.rows.length || idx.rows.some((r) => r[0] === null))
                return null;
            keyCols = idx.rows.map((r) => String(r[0]));
        }
        const constraint = m[3];
        const used = new Set([...constraint.matchAll(/([^\s()=<>]+)[=<>]/g)].map((x) => (x[1] === "rowid" ? keyCols[0] : x[1]).toLowerCase()));
        const isKey = (col) => used.has(col.toLowerCase()) || (byPk && ["rowid", "oid", "_rowid_"].includes(col.toLowerCase()));
        const keyTerms = splitLogical(where, "AND").filter((term) => isKeyTerm(term, isKey));
        if (!keyTerms.length)
            return null;
        return {
            byPk,
            index: m[2] ?? null,
            keyCols,
            constraint,
            keyTerms,
            keyCond: keyTerms.join(" AND "),
            keySql: keyTerms.map((t) => `(${t})`).join(" AND "),
            upper: constraint.includes("<"),
            equality: !/[<>]/.test(constraint),
        };
    }
    async function indexSearch(engine, W, q, plan) {
        try {
            const name = singleTable(q.from);
            if (!name || plan.length !== 1)
                return null;
            const key = await indexKey(engine, name, plan[0], q.where);
            if (!key)
                return null;
            const { byPk, keyCols, constraint, keyTerms, keyCond } = key;
            const r = await runQuery(engine, `${W}SELECT *, CASE WHEN (${keyTerms.map((t) => `(${t})`).join(" AND ")}) THEN 1 ELSE 0 END, CASE WHEN (${q.where}) THEN 1 ELSE 0 END FROM ${q.from} ORDER BY ${keyCols.map(quoteName).join(", ")}`, { maxRows: STAGE_ROWS });
            if (r.capped || r.total > r.rows.length)
                return null;
            const columns = r.columns.slice(0, -2);
            const rows = r.rows.map((row) => row.slice(0, -2));
            const hit = r.rows.map((row) => row[row.length - 2] === 1);
            const pass = r.rows.map((row) => row[row.length - 1] === 1);
            const n = rows.length;
            const visited = hit.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
            const kept = visited.filter((i) => pass[i]).length;
            const dropped = visited.length - kept;
            const keyName = keyCols[0];
            const keyAt = columns.findIndex((c) => c.toLowerCase() === keyName.toLowerCase());
            const at = (i) => `\`${keyName} = ${keyAt >= 0 ? String(rows[i][keyAt]) : bn(i + 1)}\``;
            const what = byPk ? `\`${keyName}\` এই table-এর primary key, আর table-টা \`${keyName}\`-এর ক্রমেই সাজানো থাকে (B-tree)` : `\`${keyName}\`-এ index (\`${key.index}\`) আছে, যেটা \`${keyName}\`-এর ক্রমে সাজানো একটা আলাদা তালিকা (B-tree)। নিচের table সেই ক্রমে দেখানো হলো`;
            const read = (i) => (pass[i] ? "keep" : "drop");
            const step = (sub, title, note, states) => ({ sub, title, note, columns, rows, total: n, capped: false, states });
            const droppedText = dropped ? `; \`${keyName}\` ছাড়া বাকি শর্তে তার ${bn(dropped)}টা বাদ গেল` : "";
            // শুধু = বা IN: প্রতিটা মান সরাসরি খুঁজে পায়, পরপর পড়তে হয় না
            if (!/[<>]/.test(constraint) || !visited.length) {
                const targets = visited.length === 0 ? "" : visited.length <= 3 ? visited.map(at).join(", ") : `${bn(visited.length)}টা মেলা row`;
                const note = visited.length === 0
                    ? `${what}। তাই SQLite B-tree ধরে সরাসরি খুঁজে দেখল: কোনো row \`${keyCond}\` মেলে না, তাই কোনো row পড়তেই হয়নি।`
                    : `${what}। তাই SQLite সব row একটা একটা করে দেখে না: B-tree ধরে সরাসরি ${targets}-এ চলে যায়।${visited.length > 1 ? " একাধিক মান হলে (IN বা OR) প্রতিটার জন্য আলাদা করে খোঁজে।" : ""} ${bn(n)}টা row-এর মধ্যে মাত্র ${bn(visited.length)}টা ছুঁতে হলো${droppedText}।`;
                return [step("index-এ খোঁজা", "index দিয়ে সরাসরি খুঁজে পাওয়া", note, rows.map((_, i) => (hit[i] ? read(i) : "skip")))];
            }
            // সীমার খোঁজা (<, >, BETWEEN): প্রথম মেলা row-এ লাফ, ক্রমে পড়া, শর্ত ভাঙলে থামা
            const first = visited[0];
            const lastHit = visited[visited.length - 1];
            const stop = constraint.includes("<") && lastHit + 1 < n ? lastHit + 1 : -1;
            const seekNote = first > 0
                ? `${what}। তাই SQLite উপর থেকে পড়ে না: B-tree ধরে সরাসরি প্রথম মেলা row ${at(first)}-এ চলে যায়। আগের ${bn(first)}টা row ছুঁয়েও দেখে না।`
                : `${what}। ${/[>=]/.test(constraint) ? "প্রথম row-টাই প্রথম মেলা row" : "নিচের দিকে কোনো সীমা নেই"}, তাই প্রথম row ${at(first)} থেকেই পড়া শুরু।`;
            const steps = [
                step("খোঁজা", first > 0 ? "index ধরে প্রথম মেলা row-এ লাফ" : "প্রথম row থেকে পড়া শুরু", seekNote, rows.map((_, i) => (i < first ? "skip" : i === first ? "seek" : "pending"))),
                step("পড়া", "ক্রম ধরে পড়া আর শর্ত মেলানো", `${at(first)} থেকে ক্রম ধরে একটা একটা row পড়ে শর্ত মেলায়। ${bn(visited.length)}টা row পড়ল, ${bn(kept)}টা টিকল${droppedText}।${stop < 0 && lastHit === n - 1 ? " উপরের দিকে কোনো সীমা নেই, তাই শেষ row পর্যন্ত পড়তে হলো।" : ""}`, rows.map((_, i) => (hit[i] ? read(i) : i > lastHit ? "pending" : "skip"))),
            ];
            if (stop >= 0) {
                steps.push(step("থামা", "শর্ত ভাঙল, পড়া বন্ধ", `${at(stop)}-এ এসে \`${keyCond}\` আর মেলে না। সব row \`${keyName}\`-এর ক্রমে সাজানো, তাই এর পরের কোনো row-ও মিলবে না: SQLite এখানেই থামে, বাকি ${bn(n - stop - 1)}টা row ছুঁয়েও দেখে না। ${bn(n)}টা row-এর মধ্যে মোট ${bn(visited.length + 1)}টা ছুঁতে হলো।`, rows.map((_, i) => (hit[i] ? read(i) : i === stop ? "stop" : "skip"))));
            }
            return steps;
        }
        catch {
            return null;
        }
    }
    function table(r) {
        return { columns: r.columns, rows: r.rows, total: r.total, capped: r.capped };
    }
    function takeLastColumn(r) {
        return {
            columns: r.columns.slice(0, -1),
            rows: r.rows.map((row) => row.slice(0, -1)),
            flags: r.rows.map((row) => row[row.length - 1] === 1),
        };
    }
    /** query লেখার ক্রমে clause-গুলো */
    function writtenOrder(q) {
        const order = ["SELECT"];
        if (q.from)
            order.push("FROM");
        if (q.where)
            order.push("WHERE");
        if (q.groupBy)
            order.push("GROUP BY");
        if (q.having)
            order.push("HAVING");
        if (q.orderBy)
            order.push("ORDER BY");
        if (q.limit)
            order.push("LIMIT");
        return order;
    }
    function fromNote(q, total, capped, searched) {
        const count = capped ? `${bn(total)}টার বেশি` : `${bn(total)}টা`;
        const tokens = significant(tokenize(q.from ?? ""));
        const joins = tokens.filter((t) => isKeyword(t, ...JOIN_WORDS)).length;
        const commas = (() => {
            let depth = 0;
            let n = 0;
            for (const t of tokens) {
                if (t.text === "(")
                    depth++;
                else if (t.text === ")")
                    depth--;
                else if (t.text === "," && depth === 0)
                    n++;
            }
            return n;
        })();
        if (joins + commas > 0) {
            return `যুক্তির দিক থেকে সবার আগে FROM। ${bn(joins + commas + 1)}টা table জোড়া লাগালে ${count} row হয়। বাস্তবে SQLite এই জোড়া table আগে পুরোটা বানিয়ে রাখে না: এক table-এর একটা row নিয়ে অন্য table-এ তার জোড়া খোঁজে, আর প্রতিটা জোড়া সাথে সাথে পরের ধাপে পাঠায়। JOIN কীভাবে মেলে, তা "JOIN" ট্যাবে দেখুন।`;
        }
        const real = searched
            ? "বাস্তবে এখানে index থাকায় SQLite সব row পড়েই না; কোনগুলো ছোঁয় তা WHERE ধাপে দেখুন।"
            : "এই ট্যাব শুধু যুক্তি বোঝায়; বাস্তবে SQLite সব row একসাথে আনে না, একটা একটা row পড়ে কাজ করে। সেটা দেখুন \"বাস্তবে যেভাবে চলে\" ট্যাবে।";
        return `যুক্তির দিক থেকে সবার আগে FROM (লেখা হয় SELECT-এর পরে): কোন table থেকে পড়া হবে, তার ${count} row। ${real}`;
    }
    function selectNote(q, total) {
        const star = q.items.length === 1 && q.items[0].expr === "*";
        const cols = star ? "সব column রাখা হলো" : `${bn(q.items.length)}টা column বানানো হলো: ${q.items.map((i) => `\`${i.alias ?? i.expr}\``).join(", ")}`;
        if (q.hasAggregate && !q.groupBy) {
            return `${cols}। GROUP BY নেই কিন্তু aggregate ফাংশন আছে, তাই সব row মিলে একটাই row হলো।`;
        }
        if (q.groupBy)
            return `${cols}। প্রতিটা দল থেকে একটা করে, মোট ${bn(total)}টা row।`;
        return `${cols}। মোট ${bn(total)}টা row।`;
    }
    function orderNote(orderBy, how) {
        const parts = splitTopLevel(orderBy).map((term) => {
            const tokens = significant(tokenize(term));
            const desc = tokens.some((t) => isKeyword(t, "DESC"));
            const expr = term.replace(/\s+(ASC|DESC)\b.*$/i, "").replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "");
            return `\`${expr}\` অনুযায়ী ${desc ? "বড় থেকে ছোট (DESC)" : "ছোট থেকে বড় (ASC)"}`;
        });
        const joined = parts.length > 1 ? `আগে ${parts[0]}, সমান হলে ${parts.slice(1).join(", তারপর ")}` : parts[0];
        const real = {
            sorter: " সাজাতে হলে আগে সবগুলো row হাতে লাগে, তাই এই ধাপে SQLite সত্যিই row-গুলো জমা করে (temp B-tree), তারপর সাজায়।",
            grouped: " এখানে আলাদা করে সাজাতে হয়নি: GROUP BY-এর জন্য দলগুলো আগেই এই ক্রমে সাজানো হয়ে গেছে।",
            one: " ফলে একটাই row, তাই সাজানোর কিছু নেই।",
            index: " এখানে আলাদা করে সাজাতে হয়নি: SQLite row-গুলো যে ক্রমে পড়ে (primary key বা index-এর ক্রম), সেটাই চাওয়া ক্রম।",
        }[how] ?? "";
        return `${joined} সাজানো হলো।${real} ORDER BY না দিলে row-এর ক্রম নিশ্চিত নয়।`;
    }
    function limitNote(limit, ordered, early) {
        const tokens = significant(tokenize(limit));
        const nums = tokens.filter((t) => t.type === "number").map((t) => Number(t.text));
        let what = `\`LIMIT ${limit}\` অনুযায়ী row রাখা হলো।`;
        if (tokens.length === 1 && nums.length === 1)
            what = `প্রথম ${bn(nums[0])}টা row রাখা হলো, বাকিগুলো বাদ।`;
        else if (nums.length === 2 && tokens.some((t) => isKeyword(t, "OFFSET"))) {
            what = `প্রথম ${bn(nums[1])}টা row বাদ দিয়ে পরের ${bn(nums[0])}টা রাখা হলো।`;
        }
        else if (nums.length === 2 && tokens.some((t) => t.text === ",")) {
            what = `প্রথম ${bn(nums[0])}টা row বাদ দিয়ে পরের ${bn(nums[1])}টা রাখা হলো।`;
        }
        const real = early === null ? "" : early
            ? " বাস্তবে দরকারি কয়টা row পাওয়া মাত্র SQLite পড়া থামিয়ে দেয়; বাকি row-এ হাতই দেয় না।"
            : " এখানে ফল বানাতে আগে শর্ত মেলা সব row লাগে (সাজানো, দলে ভাগ বা হিসাবের জন্য), তাই SQLite আগে সেগুলো সব পড়ে, তারপর প্রথম কয়টা নেয়।";
        return ordered ? `${what}${real} এটাই শেষ ধাপ।` : `${what}${real} ORDER BY নেই, তাই কোন row-গুলো আসবে তা নিশ্চিত নয়।`;
    }

    var api = { STAGE_ROWS: STAGE_ROWS, runStages: runStages, writtenOrder: writtenOrder, planOf: planOf, indexKey: indexKey, singleTable: singleTable, splitLogical: splitLogical, sourceTables: sourceTables };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlStages = api;
})(typeof self !== 'undefined' ? self : this);
