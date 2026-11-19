/**
 * Query বাস্তবে যেভাবে চলে: SQLite একবারে একটা row নিয়ে কাজ করে। row পড়ে, WHERE মেলায়,
 * মিললে SELECT-এর column বানিয়ে সাথে সাথে ফলে পাঠায় (বা ORDER BY, GROUP BY থাকলে জমার
 * বাক্সে রাখে), তারপর পরের row। LIMIT পূর্ণ হলে পড়া থামায়। JOIN চলে লুপের ভেতরে লুপ দিয়ে:
 * বাইরের table-এর প্রতিটা row-এর জন্য ভেতরের table-এ জোড়া খোঁজে (primary key, index বা সব row দেখে)।
 *
 * sql.js ভেতরের প্রতিটা পদক্ষেপ রেকর্ড করতে দেয় না, তাই ঘটনাগুলো সাজানো হয় SQLite-এর নিজের
 * plan (EXPLAIN QUERY PLAN আর bytecode) আর আসল ডেটা থেকে: কোন table বাইরে, কোন ক্রমে row পড়ে,
 * কোথায় index দিয়ে লাফ দেয়, কোথায় জমা করে সাজায়, কোথায় থামে। plan চেনা না গেলে { ok: false }।
 *
 * ফল: প্রতিটা ধাপের পুরো ছবি (frame), যাতে আগে-পরে যাওয়া সহজ হয়।
 */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./01-bn.js') : root.SqlBn;
    var bn = M0.bn;
    var M1 = isNode ? require('./04-db.js') : root.SqlDb;
    var runQuery = M1.query;
    var M2 = isNode ? require('./03-split.js') : root.SqlSplit;
    var splitSelect = M2.splitSelect, splitTopLevel = M2.splitTopLevel, groupTerms = M2.groupTerms, resolveAliases = M2.resolveAliases, AGGREGATES = M2.AGGREGATES;
    var M3 = isNode ? require('./02-tokenize.js') : root.SqlTokenize;
    var tokenize = M3.tokenize, significant = M3.significant, isKeyword = M3.isKeyword, isNameToken = M3.isNameToken, identName = M3.identName;
    var M4 = isNode ? require('./05-join.js') : root.SqlJoin;
    var parseJoin = M4.parseJoin;
    var M5 = isNode ? require('./06-stages.js') : root.SqlStages;
    var planOf = M5.planOf, indexKey = M5.indexKey, singleTable = M5.singleTable, splitLogical = M5.splitLogical;

    const MAX_ROWS = 200;
    const MAX_COMBOS = 3000;
    const REASONS = {
        "not-select": "বাস্তবের ছবি দেখা যায় শুধু SELECT query-র।",
        "no-from": "FROM নেই, তাই কোনো table পড়তে হয় না।",
        join: "এই ধরনের JOIN-এর বাস্তবের ছবি এখনো আঁকা যায় না।",
        join3: "দুইয়ের বেশি table জোড়া লাগানো query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        subquery: "subquery থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        with: "WITH (CTE) থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        window: "window ফাংশন (OVER) থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        big: `table বা জোড়ার সংখ্যা অনেক বেশি (${bn(MAX_ROWS)}টার বেশি row), ধাপে ধাপে দেখানোর জন্য বড়।`,
        plan: "SQLite এই query একটু অন্যভাবে চালায়, যার ছবি এখনো আঁকা যায় না।",
        shape: "এই ধরনের query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
    };
    const no = (reason) => ({ ok: false, reason, message: REASONS[reason] });
    const quoteName = (name) => `"${name.replace(/"/g, '""')}"`;
    const literal = (text) => `'${text.replace(/'/g, "''")}'`;
    const show = (v) => (v === null || v === undefined ? "NULL" : typeof v === "string" ? `'${v}'` : v instanceof Uint8Array ? "BLOB" : String(v));
    const code = (s) => `\`${s}\``;
    const sqlValue = (v) => (v === null || v === undefined ? "NULL" : String(v));
    const ROWID = ["rowid", "oid", "_rowid_"];

    /** ORDER BY-এর প্রতিটা অংশ: expression আর দিক (ASC/DESC, NULLS …); সংখ্যা হলে SELECT-এর সেই column */
    function orderParts(q) {
        return splitTopLevel(q.orderBy).map((term) => {
            const m = /\s+(ASC|DESC)?(\s+NULLS\s+(FIRST|LAST))?\s*$/i.exec(term);
            const suffix = m && m[0].trim() ? m[0].trim() : "";
            let expr = suffix ? term.slice(0, m.index).trim() : term.trim();
            if (/^\d+$/.test(expr)) {
                const item = q.items[Number(expr) - 1];
                if (item && item.expr !== "*")
                    expr = item.expr;
            }
            return { expr: resolveAliases(expr, q.items), suffix, desc: /^DESC/i.test(suffix) };
        });
    }
    const hasSubquery = (statement) => significant(tokenize(statement)).filter((t) => isKeyword(t, "SELECT")).length > 1;
    const hasJoin = (from) => {
        let depth = 0;
        return significant(tokenize(from)).some((t) => {
            if (t.text === "(")
                depth++;
            else if (t.text === ")")
                depth--;
            return depth === 0 && (isKeyword(t, "JOIN") || t.text === ",");
        });
    };
    /** SELECT-এ যে aggregate ফাংশন আছে (`count(*)`, `sum(price)`), লেখা যেমন */
    function aggregateCalls(q) {
        const calls = [];
        for (const item of q.items) {
            const tokens = significant(tokenize(item.expr));
            tokens.forEach((t, i) => {
                if (t.type !== "ident" || !AGGREGATES.has(t.upper) || tokens[i + 1]?.text !== "(")
                    return;
                let depth = 0;
                for (let j = i + 1; j < tokens.length; j++) {
                    if (tokens[j].text === "(")
                        depth++;
                    else if (tokens[j].text === ")" && --depth === 0) {
                        const text = item.expr.slice(t.start, tokens[j].end);
                        if (!calls.includes(text))
                            calls.push(text);
                        break;
                    }
                }
            });
        }
        return calls;
    }
    /** LIMIT আর OFFSET-এর মান (SQLite দিয়ে হিসাব করে); না থাকলে limit = Infinity */
    async function limitOf(engine, q) {
        if (!q.limit)
            return { limit: Infinity, offset: 0 };
        let limitExpr = q.limit;
        let offsetExpr = "0";
        let depth = 0;
        for (const t of tokenize(q.limit)) {
            if (t.text === "(")
                depth++;
            else if (t.text === ")")
                depth--;
            else if (depth === 0 && isKeyword(t, "OFFSET")) {
                limitExpr = q.limit.slice(0, t.start);
                offsetExpr = q.limit.slice(t.end);
                break;
            }
            else if (depth === 0 && t.text === ",") {
                offsetExpr = q.limit.slice(0, t.start);
                limitExpr = q.limit.slice(t.end);
                break;
            }
        }
        const r = await runQuery(engine, `SELECT CAST((${limitExpr}) AS INTEGER), CAST((${offsetExpr}) AS INTEGER)`, { maxRows: 1 });
        const [limit, offset] = r.rows[0];
        return { limit: limit < 0 ? Infinity : limit, offset: Math.max(0, offset ?? 0) };
    }
    /** শর্তে কোন কোন table (alias) আছে */
    function refsOf(term, tables) {
        const found = new Set();
        const tokens = significant(tokenize(term));
        tokens.forEach((t, i) => {
            if (!isNameToken(t) || tokens[i - 1]?.text === "." || tokens[i + 1]?.text === "(")
                return;
            const name = identName(t).toLowerCase();
            if (tokens[i + 1]?.text === ".") {
                const tb = tables.find((x) => x.alias.toLowerCase() === name);
                if (tb)
                    found.add(tb.alias);
                return;
            }
            const owners = tables.filter((x) => x.columns.some((c) => c.toLowerCase() === name));
            if (owners.length === 1)
                found.add(owners[0].alias);
        });
        return found;
    }
    /**
     * ভেতরের table-এ খোঁজার শর্ত: `B.col <op> (বাইরের কিছু)`, যেখানে col সেই column যেটা দিয়ে
     * SQLite খোঁজে (plan-এর বন্ধনীতে লেখা)। প্রতিটা শর্ত লেখা যেমন।
     */
    function seekTerms(terms, inner, consCols, tables) {
        const isConsCol = (side) => {
            const t = significant(tokenize(side));
            const name = t.length === 1 && isNameToken(t[0]) ? identName(t[0]) : t.length === 3 && isNameToken(t[0]) && t[1].text === "." && isNameToken(t[2]) && identName(t[0]).toLowerCase() === inner.alias.toLowerCase() ? identName(t[2]) : null;
            if (!name)
                return false;
            if (t.length === 1 && !inner.columns.some((c) => c.toLowerCase() === name.toLowerCase()) && !ROWID.includes(name.toLowerCase()))
                return false;
            return consCols.has(name.toLowerCase()) || (ROWID.includes(name.toLowerCase()) && consCols.has("rowid"));
        };
        return terms.filter((term) => {
            const tokens = significant(tokenize(term));
            let depth = 0;
            const ops = [];
            tokens.forEach((t) => {
                if (t.text === "(")
                    depth++;
                else if (t.text === ")")
                    depth--;
                else if (depth === 0 && (["=", "==", "<", "<=", ">", ">="].includes(t.text) || isKeyword(t, "IS")))
                    ops.push(t);
            });
            if (ops.length !== 1)
                return false;
            const left = term.slice(0, ops[0].start).trim();
            const right = term.slice(ops[0].end).trim();
            const other = (side) => !refsOf(side, tables).has(inner.alias);
            return (isConsCol(left) && other(right)) || (isConsCol(right) && other(left));
        });
    }

    async function runTrace(engine, statement) {
        const split = splitSelect(statement);
        if (!split.ok)
            return no(split.reason === "not-select" ? "not-select" : "shape");
        const q = split.query;
        if (!q.from)
            return no("no-from");
        if (q.with)
            return no("with");
        let refs;
        let join = null;
        const name = singleTable(q.from);
        if (name) {
            const t = significant(tokenize(q.from));
            refs = [{ name, alias: t.length > 1 ? identName(t[t.length - 1]) : name }];
        }
        else {
            join = parseJoin(q.from);
            if (!join)
                return no(hasJoin(q.from) ? "join" : "shape");
            if (join.more)
                return no("join3");
            if (join.natural)
                return no("join");
            refs = [join.left, join.right];
        }
        if (hasSubquery(statement))
            return no("subquery");
        if (q.hasWindow)
            return no("window");
        if ((q.distinct && (q.groupBy || q.hasAggregate)) || (q.having && !q.groupBy))
            return no("shape");
        try {
            return await build(engine, statement, q, refs, join);
        }
        catch {
            return no("shape");
        }
    }

    async function build(engine, statement, q, refs, join) {
        // ---- SQLite কীভাবে চালাবে: কোন table কোন লুপে, কীভাবে পড়ে
        const plan = await planOf(engine, statement);
        const loops = [];
        const temps = new Set();
        const bloom = new Set();
        let rightPass = false;
        const aliasOf = (id) => refs.find((r) => r.alias === id || (r.alias === r.name && r.name === id))?.alias;
        for (let li = 0; li < plan.length; li++) {
            const line = plan[li];
            let m;
            if ((m = /^USE TEMP B-TREE FOR (ORDER BY|GROUP BY|DISTINCT)$/.exec(line))) {
                temps.add(m[1]);
                continue;
            }
            if ((m = /^BLOOM FILTER ON (\S+) \(/.exec(line))) {
                bloom.add(aliasOf(m[1]));
                continue;
            }
            if (/^RIGHT-JOIN \S+$/.test(line)) {
                const scan = /^SCAN (\S+)$/.exec(plan[li + 1] ?? "");
                if (!scan || loops.length !== 2 || aliasOf(scan[1]) !== loops[1].alias)
                    return no("plan");
                rightPass = true;
                li++;
                continue;
            }
            const left = line.endsWith(" LEFT-JOIN");
            const body = left ? line.slice(0, -" LEFT-JOIN".length) : line;
            if ((m = /^SCAN (\S+)$/.exec(body)))
                loops.push({ alias: aliasOf(m[1]), kind: "scan", left });
            else if ((m = /^SCAN (\S+) USING (?:COVERING )?INDEX (\S+)$/.exec(body)))
                loops.push({ alias: aliasOf(m[1]), kind: "index-scan", index: m[2], left });
            else if ((m = /^SEARCH (\S+) USING AUTOMATIC (?:PARTIAL )?(?:COVERING )?INDEX \((.*)\)$/.exec(body)))
                loops.push({ alias: aliasOf(m[1]), kind: "auto", cons: m[2], left });
            else if ((m = /^SEARCH (\S+) USING (INTEGER PRIMARY KEY|(?:COVERING )?INDEX (\S+)) \((.*)\)$/.exec(body)))
                loops.push({ alias: aliasOf(m[1]), kind: "search", line: body, byPk: m[2] === "INTEGER PRIMARY KEY", index: m[3] ?? null, cons: m[4], left });
            else
                return no("plan");
            if (!loops[loops.length - 1].alias)
                return no("plan");
        }
        if (loops.length !== refs.length || new Set(loops.map((l) => l.alias)).size !== loops.length)
            return no("plan");
        const ops = (await runQuery(engine, `EXPLAIN ${statement}`, { maxRows: 3000 })).rows.map((r) => String(r[1]));
        const isJoin = loops.length === 2;
        const sorter = temps.has("ORDER BY");
        const grouped = Boolean(q.groupBy);
        const groupSorted = temps.has("GROUP BY");
        if (grouped && q.orderBy && !sorter)
            return no("plan");
        const aggregate = q.hasAggregate && !grouped;
        if (aggregate && sorter)
            return no("plan");
        if (isJoin && q.orderBy && !sorter && !aggregate)
            return no("plan");

        // ---- table-গুলো (লুপের ক্রমে)
        const tables = [];
        for (const lp of loops) {
            const ref = refs.find((r) => r.alias === lp.alias);
            const info = await runQuery(engine, `SELECT name, type, pk FROM pragma_table_info(${literal(ref.name)})`, { maxRows: 200 });
            if (!info.rows.length)
                return no("plan");
            const pks = info.rows.filter((r) => Number(r[2]) > 0);
            tables.push({ name: ref.name, alias: ref.alias, columns: info.rows.map((r) => String(r[0])), pkName: pks.length === 1 ? String(pks[0][0]) : null, loop: lp, rid: `${quoteName(ref.alias)}.rowid` });
        }
        const A = tables[0];
        const B = isJoin ? tables[1] : null;
        const attempt = async (make, maxRows) => {
            try {
                return await runQuery(engine, make((s) => s), { maxRows });
            }
            catch (first) {
                if (!String(first?.message ?? first).includes("no such column"))
                    throw first;
                return runQuery(engine, make((s) => resolveAliases(s, q.items)), { maxRows });
            }
        };
        const whereSql = (fix) => (q.where ? fix(q.where) : "1");
        const whereTerms = q.where ? splitLogical(q.where, "AND") : [];
        const joinType = join ? join.type : null;
        // LEFT JOIN-এর জায়গায় SQLite সাধারণ JOIN চালাচ্ছে কি না (WHERE-এ NULL row কখনো টেকে না)
        const leftKept = isJoin && B.loop.left;
        const leftDropped = isJoin && (joinType === "LEFT" || joinType === "FULL") && !leftKept;
        const innerJoin = isJoin && !leftKept && !rightPass;

        // ---- বাইরের লুপ: কোন শর্ত ভেতরে খোঁজার আগেই মেলায়
        const outerTerms = !isJoin ? whereTerms : rightPass ? [] : whereTerms.filter((t) => {
            const r = refsOf(t, tables);
            return r.size === 1 && r.has(A.alias);
        });
        const outerText = outerTerms.join(" AND ");
        const outerSql = (fix) => (outerTerms.length ? outerTerms.map((t) => `(${fix(t)})`).join(" AND ") : "1");
        let key = null;
        if (A.loop.kind === "search") {
            key = await indexKey(engine, A.name, A.loop.line, outerText);
            if (!key)
                return no("plan");
        }
        else if (A.loop.kind === "auto")
            return no("plan");
        let indexColsA = null;
        if (A.loop.kind === "index-scan") {
            const idx = await runQuery(engine, `SELECT name FROM pragma_index_info(${literal(A.loop.index)}) ORDER BY seqno`, { maxRows: 50 });
            if (!idx.rows.length || idx.rows.some((r) => r[0] === null))
                return no("plan");
            indexColsA = idx.rows.map((r) => String(r[0]));
        }
        const orders = q.orderBy ? orderParts(q) : [];
        const streamOrder = !isJoin && q.orderBy && !sorter && !grouped && !aggregate;
        const readOrder = streamOrder
            ? `${orders.map((o) => `${o.expr} ${o.suffix}`).join(", ")}, ${A.rid}`
            : key ? `${key.keyCols.map(quoteName).join(", ")}, ${A.rid}`
                : indexColsA ? `${indexColsA.map(quoteName).join(", ")}, ${A.rid}`
                    : A.rid;
        const reverse = streamOrder && orders[0].desc;
        const fromA = isJoin ? `${quoteName(A.name)} AS ${quoteName(A.alias)}` : q.from;
        const dataA = await attempt((fix) => `SELECT ${A.rid}, CASE WHEN (${key ? key.keySql : "1"}) THEN 1 ELSE 0 END, CASE WHEN (${outerSql(fix)}) THEN 1 ELSE 0 END, ${quoteName(A.alias)}.* FROM ${fromA} ORDER BY ${readOrder}`, MAX_ROWS + 1);
        if (dataA.total > MAX_ROWS)
            return no("big");
        A.rids = dataA.rows.map((r) => r[0]);
        A.columns = dataA.columns.slice(3);
        A.rows = dataA.rows.map((r) => r.slice(3));
        const hitA = dataA.rows.map((r) => r[1] === 1);
        const passA = dataA.rows.map((r) => r[2] === 1);
        const n = A.rows.length;

        // ---- ভেতরের লুপ: কোন ক্রমে সাজানো, প্রতিটা বাইরের row-এর জন্য কোন row-গুলো দেখে
        const examined = new Map();
        let seekText = "";
        if (isJoin) {
            const consCols = new Set([...(B.loop.cons ?? "").matchAll(/([^\s()=<>]+)[=<>]/g)].map((x) => x[1].toLowerCase()));
            let innerOrder = B.rid;
            if (B.loop.kind === "auto") {
                // অস্থায়ী covering index: আগে খোঁজার column, তারপর query-তে লাগা বাকি column (table-এর ক্রমে), শেষে rowid
                const tokens = significant(tokenize(statement));
                const all = tokens.some((t, i) => t.text === "*" && (tokens[i - 1]?.text === "." ? identName(tokens[i - 2]).toLowerCase() === B.alias.toLowerCase() : isKeyword(tokens[i - 1], "SELECT", "DISTINCT") || tokens[i - 1]?.text === ","));
                const mentioned = (c) => tokens.some((t, i) => {
                    if (!isNameToken(t) || identName(t).toLowerCase() !== c.toLowerCase())
                        return false;
                    if (tokens[i - 1]?.text === ".")
                        return identName(tokens[i - 2]).toLowerCase() === B.alias.toLowerCase();
                    return !A.columns.some((x) => x.toLowerCase() === c.toLowerCase());
                });
                const used = B.columns.filter((c) => c.toLowerCase() !== (B.pkName ?? "").toLowerCase() && !consCols.has(c.toLowerCase()) && (all || mentioned(c)));
                innerOrder = [...consCols].map(quoteName).concat(used.map(quoteName), [B.rid]).join(", ");
            }
            else if (B.loop.kind === "search" && !B.loop.byPk) {
                const cols = (await runQuery(engine, `SELECT name FROM pragma_index_info(${literal(B.loop.index)}) ORDER BY seqno`, { maxRows: 50 })).rows.map((r) => String(r[0]));
                innerOrder = `${cols.map(quoteName).join(", ")}, ${B.rid}`;
            }
            else if (B.loop.kind === "index-scan") {
                const cols = (await runQuery(engine, `SELECT name FROM pragma_index_info(${literal(B.loop.index)}) ORDER BY seqno`, { maxRows: 50 })).rows.map((r) => String(r[0]));
                innerOrder = `${cols.map(quoteName).join(", ")}, ${B.rid}`;
            }
            const dataB = await runQuery(engine, `SELECT ${B.rid}, ${quoteName(B.alias)}.* FROM ${quoteName(B.name)} AS ${quoteName(B.alias)} ORDER BY ${innerOrder}`, { maxRows: MAX_ROWS + 1 });
            if (dataB.total > MAX_ROWS)
                return no("big");
            B.rids = dataB.rows.map((r) => r[0]);
            B.columns = dataB.columns.slice(1);
            B.rows = dataB.rows.map((r) => r.slice(1));
            if (B.loop.kind === "search" || B.loop.kind === "auto") {
                if (B.loop.byPk && B.pkName)
                    consCols.add(B.pkName.toLowerCase());
                const onTerms = join.on ? splitLogical(join.on, "AND") : (join.using ?? []).map((c) => `${quoteName(A.alias)}.${quoteName(c)} = ${quoteName(B.alias)}.${quoteName(c)}`);
                const seek = seekTerms(innerJoin ? [...onTerms, ...whereTerms] : onTerms, B, consCols, tables);
                if (!seek.length)
                    return no("plan");
                seekText = seek.join(" AND ");
                const r = await runQuery(engine, `SELECT ${A.rid}, ${B.rid} FROM ${quoteName(A.name)} AS ${quoteName(A.alias)}, ${quoteName(B.name)} AS ${quoteName(B.alias)} WHERE ${seek.map((t) => `(${t})`).join(" AND ")}`, { maxRows: MAX_COMBOS + 1 });
                if (r.total > MAX_COMBOS)
                    return no("big");
                r.rows.forEach(([ra, rb]) => {
                    if (!examined.has(ra))
                        examined.set(ra, new Set());
                    examined.get(ra).add(rb);
                });
            }
        }
        const atA = new Map(A.rids.map((v, i) => [v, i]));
        const atB = isJoin ? new Map(B.rids.map((v, i) => [v, i])) : null;
        for (const tb of tables) {
            const pkAt = tb.pkName ? tb.columns.findIndex((c) => c.toLowerCase() === tb.pkName.toLowerCase()) : -1;
            tb.label = (i) => (pkAt >= 0 ? code(`${isJoin ? `${tb.alias}.` : ""}${tb.columns[pkAt]} = ${show(tb.rows[i][pkAt])}`) : `row ${bn(i + 1)}`);
            tb.short = (i) => (pkAt >= 0 ? show(tb.rows[i][pkAt]) : bn(i + 1));
            tb.pkAt = pkAt;
        }

        // ---- প্রতিটা জোড়া (বা এক table-এ প্রতিটা row): WHERE মেলে কি না, SELECT-এর ফল
        const comboKey = (ra, rb) => (isJoin ? `${ra}|${rb ?? "N"}` : String(ra));
        const ridCols = tables.map((t) => t.rid).join(", ");
        const plain = !aggregate && !grouped;
        const combosQ = await attempt((fix) => `SELECT ${ridCols}, CASE WHEN (${whereSql(fix)}) THEN 1 ELSE 0 END${plain ? `, ${q.select}` : ""} FROM ${q.from}`, MAX_COMBOS + 1);
        if (combosQ.total > MAX_COMBOS)
            return no("big");
        const nr = tables.length;
        let outColumns = plain ? combosQ.columns.slice(nr + 1) : [];
        const combo = new Map();
        const matchedOf = new Map();
        const rightOnly = [];
        for (const row of combosQ.rows) {
            const ra = row[0];
            const rb = isJoin ? row[1] : undefined;
            const c = { ra, rb, pass: row[nr] === 1, out: plain ? row.slice(nr + 1) : null, key: comboKey(ra, rb) };
            combo.set(c.key, c);
            if (!isJoin)
                continue;
            if (ra === null)
                rightOnly.push(c);
            else if (rb !== null) {
                if (!matchedOf.has(ra))
                    matchedOf.set(ra, []);
                matchedOf.get(ra).push(c);
            }
        }
        if (isJoin) {
            // index দিয়ে খুঁজলে শুধু খুঁজে পাওয়া row-গুলোই জোড়া হতে পারে (comma বা CROSS-এ শর্ত থাকে WHERE-এ)
            if (B.loop.kind === "search" || B.loop.kind === "auto")
                matchedOf.forEach((list, ra) => matchedOf.set(ra, list.filter((c) => examined.get(ra)?.has(c.rb))));
            matchedOf.forEach((list) => list.sort((x, y) => atB.get(x.rb) - atB.get(y.rb)));
            rightOnly.sort((x, y) => atB.get(x.rb) - atB.get(y.rb));
            if (B.loop.kind === "scan" || B.loop.kind === "index-scan")
                A.rids.forEach((ra) => examined.set(ra, new Set(B.rids)));
        }
        const { limit, offset } = await limitOf(engine, q);

        // কোন row-গুলো পড়ে: SCAN-এ সব, index দিয়ে খুঁজলে শুধু মেলা অংশ (মাঝে ফাঁক থাকলে আবার লাফ)
        const reads = key ? hitA.map((h, i) => (h ? i : -1)).filter((i) => i >= 0) : [...Array(n).keys()];

        // যে ক্রমে জোড়া বা row তৈরি হয় (production): এর ওপরে সাজানো আর হিসাবের query চলে
        const produced = [];
        const producedOf = new Map();
        for (const i of reads) {
            const ra = A.rids[i];
            if (!passA[i])
                continue;
            let list;
            if (!isJoin)
                list = combo.has(comboKey(ra)) ? [combo.get(comboKey(ra))] : [];
            else {
                list = matchedOf.get(ra) ?? [];
                if (!list.length && leftKept && combo.has(comboKey(ra, null)))
                    list = [combo.get(comboKey(ra, null))];
            }
            producedOf.set(i, list);
            list.forEach((c) => { c.pos = produced.length; produced.push(c); });
        }
        if (rightPass)
            rightOnly.forEach((c) => { c.pos = produced.length; produced.push(c); });
        const valuesCte = produced.length
            ? `WITH __p(${tables.map((_, k) => `r${k}`).join(", ")}, pos) AS (VALUES ${produced.map((c) => `(${sqlValue(c.ra)}${isJoin ? `, ${sqlValue(c.rb)}` : ""}, ${c.pos})`).join(", ")}) `
            : "";
        const joinP = `JOIN __p ON ${tables.map((t, k) => `${t.rid} IS __p.r${k}`).join(" AND ")}`;

        // ---- frame বানানো
        const frames = [];
        const src = tables.map((t) => new Array(t.rows.length).fill("pending"));
        const cur = tables.map(() => -1);
        let box = null;
        const outRows = [];
        let acc = null;
        let phase = "read";
        const snap = (note) => {
            frames.push({
                phase,
                note,
                cur: cur.slice(),
                src: src.map((s) => s.slice()),
                box: box ? { ...box, items: box.items.slice(), states: box.states ? box.states.slice() : undefined } : null,
                outCount: outRows.length,
                acc: acc ? acc.slice() : null,
            });
        };
        const finishSkipped = () => src[0].forEach((s, i) => { if (s === "pending") src[0][i] = "skip"; });
        const whereCols = (tb, text) => (text ? tb.columns.filter((c, ci) => ci !== tb.pkAt).filter((c) => significant(tokenize(text)).some((t) => isNameToken(t) && identName(t).toLowerCase() === c.toLowerCase())) : []);
        const colsA = whereCols(A, isJoin ? [q.where, join.on, seekText, ...(join.using ?? [])].filter(Boolean).join(" ") : q.where);
        const values = (i) => colsA.map((c) => `${c} = ${show(A.rows[i][A.columns.indexOf(c)])}`).join(", ");

        // count(*)-এর সোজা পথ: row না পড়েই গোনা
        if (!isJoin && aggregate && ops.includes("Count") && !q.where) {
            const real = await runQuery(engine, statement, { maxRows: 1 });
            outColumns = real.columns;
            outRows.push(...real.rows);
            src[0].fill("skip");
            snap(`${code("count(*)")}-এ WHERE নেই, তাই SQLite একটা row-ও পড়ে না: table-এর B-tree নিজেই গুনে দেয় কয়টা row আছে (bytecode-এ ${code("Count")})। তাই সব row "ছোঁয়নি"।`);
            phase = "out";
            snap("গোনা সংখ্যাটা দিয়ে একটা row বানিয়ে ফলে পাঠানো হলো।");
            return result();
        }
        if (limit === 0) {
            src.forEach((s) => s.fill("skip"));
            snap(`${code("LIMIT 0")}: একটা row-ও লাগবে না, তাই SQLite কোনো row পড়েই না।`);
            return result();
        }

        // ---- শুরুর ব্যাখ্যা
        if (isJoin) {
            const written = refs[0].alias;
            let intro = `SQLite JOIN চালায় লুপের ভেতরে লুপ দিয়ে: বাইরের লুপে ${code(A.alias)} (${A.name})-এর প্রতিটা row একবার করে, আর প্রতিটার জন্য ভেতরের ${code(B.alias)} (${B.name})-তে জোড়া খোঁজা।`;
            if (written !== A.alias)
                intro += ` লেখায় ${code(written)} আগে থাকলেও SQLite ${code(A.alias)}-কে বাইরে রাখল, কারণ এভাবে ${code(B.alias)}-তে সরাসরি খোঁজা যায়, কাজ কম।`;
            if (B.loop.kind === "search" && B.loop.byPk)
                intro += ` ${code(`${B.alias}.${B.pkName}`)} primary key, তাই প্রতিবার B-tree ধরে সরাসরি লাফ দিয়ে খোঁজে (${code(seekText)})।`;
            else if (B.loop.kind === "search")
                intro += ` ${code(B.alias)}-এ index (${code(B.loop.index)}) আছে, তাই প্রতিবার সেই index ধরে খোঁজে (${code(seekText)})।`;
            else if (B.loop.kind === "scan" || B.loop.kind === "index-scan")
                intro += ` ভেতরের table-এ কাজে লাগার মতো index নেই, তাই প্রতিটা বাইরের row-এর জন্য ভেতরের সব row মিলিয়ে দেখে।`;
            if (outerTerms.length)
                intro += ` WHERE-এর ${code(outerText)} শুধু ${code(A.alias)}-এর, তাই এটা ভেতরে খোঁজার আগেই মেলানো হয়।`;
            if (leftDropped)
                intro += ` WHERE-এর জন্য NULL বসানো row কখনো টিকবে না, তাই SQLite ${joinType} JOIN-কে সাধারণ JOIN হিসেবেই চালায়।`;
            if (rightPass)
                intro += ` ${joinType === "FULL" ? "FULL" : "RIGHT"} JOIN-এর জন্য কোন ${code(B.alias)} row জোড়া পেল তা মনে রাখে, লুপ শেষে বাকিগুলো আলাদা করে আনে।`;
            // অস্থায়ী index পড়া শুরুর আগেই বানানো হয়, তাই শুরুর ব্যাখ্যাও সেই ধাপে
            if (B.loop.kind === "auto")
                phase = "index";
            snap(intro);
            if (B.loop.kind === "auto") {
                src[1].fill("indexed");
                const cols = [...new Set([...(B.loop.cons ?? "").matchAll(/([^\s()=<>]+)[=<>]/g)].map((x) => x[1]))];
                snap(`${code(B.alias)}-তে ${cols.map(code).join(", ")}-এর কোনো index নেই। তাই SQLite শুরুতেই একবার ${code(B.alias)}-এর সব ${bn(B.rows.length)}টা row পড়ে ${cols.map(code).join(", ")}-এর একটা অস্থায়ী index বানাল (AUTOMATIC INDEX)${bloom.has(B.alias) ? ", সাথে একটা Bloom filter, যা দেখে চট করে বলা যায় কোনো মান একেবারেই নেই কি না" : ""}। এরপর প্রতিটা বাইরের row-এর জন্য এই index-এ খোঁজে। ভেতরের table এই index-এর ক্রমে দেখানো হলো।`);
                src[1].fill("pending");
                phase = "read";
            }
        }
        if (key) {
            const keyName = key.keyCols[0];
            const what = key.byPk ? `${code(keyName)} এই table-এর primary key, আর table-টা ${code(keyName)}-এর ক্রমেই সাজানো থাকে (B-tree)` : `${code(keyName)}-এ index (${code(key.index)}) আছে, যেটা ${code(keyName)}-এর ক্রমে সাজানো (B-tree); নিচের table সেই ক্রমে`;
            const how = reads.length === 0
                ? `তাই SQLite B-tree ধরে খুঁজে দেখল: কোনো row ${code(key.keyCond)} মেলে না, তাই কোনো row পড়তেই হলো না।`
                : key.equality
                    ? `তাই সব row একটা একটা করে না দেখে B-tree ধরে সরাসরি মেলা row-গুলোতে যাবে${reads.length > 1 ? " (প্রতিটা মানের জন্য আলাদা করে খুঁজে)" : ""}।`
                    : reads[0] > 0
                        ? `তাই উপর থেকে না পড়ে B-tree ধরে সরাসরি প্রথম মেলা row ${A.label(reads[0])}-এ লাফ দেবে, আগের ${bn(reads[0])}টা row ছুঁয়েও দেখবে না।`
                        : `একদিকে কোনো সীমা নেই, তাই প্রথম row ${A.label(reads[0])} থেকেই পড়া শুরু; থামবে যেখানে ${code(key.keyCond)} ভাঙবে।`;
            if (reads.length === 0)
                src[0].fill("skip");
            snap(`${isJoin ? `${code(A.alias)}-এ: ` : ""}${what}। ${how}`);
            if (reads.length === 0 && !rightPass) {
                phase = "out";
                snap("কোনো row ফলে যায়নি।");
                return result();
            }
        }

        // ---- জমার বাক্স, হিসাব, দলের জন্য দরকারি তথ্য
        let emitted = 0;
        let skippedByOffset = 0;
        let stopped = false;
        const seen = new Set();
        const needed = offset + limit;
        const rank = new Map();
        const orderVals = new Map();
        if (sorter && !grouped && produced.length) {
            const r = await attempt((fix) => `${valuesCte}SELECT pos, rank() OVER (ORDER BY ${orders.map((o, k) => `__o${k} ${o.suffix}`).join(", ")}), ${orders.map((_, k) => `__o${k}`).join(", ")} FROM (SELECT __p.pos AS pos, ${orders.map((o, k) => `${o.expr} AS __o${k}`).join(", ")} FROM ${q.from} ${joinP} WHERE ${whereSql(fix)})`, MAX_COMBOS + 1);
            r.rows.forEach((row) => { rank.set(row[0], row[1] * (MAX_COMBOS + 1) + row[0]); orderVals.set(row[0], row.slice(2)); });
        }
        if (sorter && !grouped) {
            box = { kind: "sort", columns: [...orders.map((o) => `↕ ${o.expr}`), ...outColumns], items: [], sorted: Number.isFinite(needed) };
            box.topN = box.sorted;
        }
        const calls = aggregateCalls(q);
        const running = new Map();
        if (aggregate && produced.length) {
            const r = await attempt((fix) => `${valuesCte}SELECT __p.pos, ${calls.map((c) => `${c} OVER (ORDER BY __p.pos ROWS UNBOUNDED PRECEDING)`).join(", ")} FROM ${q.from} ${joinP} WHERE ${whereSql(fix)}`, MAX_COMBOS + 1);
            r.rows.forEach((row) => running.set(row[0], row.slice(1)));
        }
        if (aggregate)
            acc = calls.map((c) => `${c} = ${c.toLowerCase().startsWith("count") ? "0" : "NULL"}`);
        const terms = grouped ? groupTerms(q) : [];
        const groupKey = new Map();
        let groups = [];
        if (grouped) {
            const r = await attempt((fix) => `SELECT ${ridCols}, ${terms.map(fix).join(", ")} FROM ${q.from}`, MAX_COMBOS + 1);
            r.rows.forEach((row) => groupKey.set(comboKey(row[0], isJoin ? row[1] : undefined), row.slice(nr)));
            const nk = terms.length;
            const g = await attempt((fix) => `SELECT ${terms.map((t, k) => `${fix(t)} AS __g${k}`).join(", ")}, CASE WHEN (${q.having ? resolveAliases(q.having, q.items) : "1"}) THEN 1 ELSE 0 END AS __h, ${q.select} FROM ${q.from} WHERE ${whereSql(fix)} GROUP BY ${terms.map(fix).join(", ")} ORDER BY ${terms.map((_, k) => `__g${k}`).join(", ")}`, MAX_COMBOS + 1);
            outColumns = g.columns.slice(nk + 1);
            groups = g.rows.map((row) => ({ key: JSON.stringify(row.slice(0, nk)), keyVals: row.slice(0, nk), pass: row[nk] === 1, out: row.slice(nk + 1) }));
            if (groupSorted)
                box = { kind: "group", columns: [...terms.map((t) => `দল: ${t}`), ...(isJoin ? ["জোড়া"] : A.columns)], items: [], sorted: false };
            else {
                // বাক্স ছাড়া দল: একই দলের row পরপর আসতে হবে
                const order = produced.filter((c) => c.pass).map((c) => JSON.stringify(groupKey.get(c.key)));
                const done = new Set();
                for (let k = 0; k < order.length; k++) {
                    if (k > 0 && order[k] !== order[k - 1]) {
                        if (done.has(order[k]))
                            return no("plan");
                        done.add(order[k - 1]);
                    }
                }
                groups.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
            }
        }
        const groupByKey = new Map(groups.map((gr) => [gr.key, gr]));
        let orderRank = null;
        if (grouped && sorter) {
            const nk = terms.length;
            const r = await attempt((fix) => `SELECT * FROM (SELECT ${terms.map((t, k) => `${fix(t)} AS __g${k}`).join(", ")}, ${orders.map((o, k) => `${o.expr} AS __o${k}`).join(", ")} FROM ${q.from} WHERE ${whereSql(fix)} GROUP BY ${terms.map(fix).join(", ")}) ORDER BY ${orders.map((o, k) => `__o${k} ${o.suffix}`).join(", ")}, ${terms.map((_, k) => `__g${k}`).join(", ")}`, MAX_COMBOS + 1);
            orderRank = new Map(r.rows.map((row, k) => [JSON.stringify(row.slice(0, nk)), k]));
        }
        const groupOut = [];
        let groupsEmitted = 0;
        let curGroup = null;
        const groupLabel = (gr) => code(terms.map((t, k) => `${t} = ${show(gr.keyVals[k])}`).join(", "));
        // একটা দল শেষ: HAVING, তারপর ফলে বা ORDER BY-এর বাক্সে
        const endGroup = (gr, count) => {
            acc = outColumns.map((c, ci) => `${c} = ${show(gr.out[ci])}`);
            let text = `দল ${groupLabel(gr)} শেষ (${bn(count)}টা row), হিসাব থেকে একটা row বানানো হলো।`;
            if (q.having)
                text += gr.pass ? ` HAVING ${code(q.having)} মেলে ✓।` : ` HAVING ${code(q.having)} মেলে না ✕, তাই দলটা বাদ।`;
            if (!gr.pass)
                return text;
            if (sorter) {
                groupOut.push(gr);
                return `${text} ORDER BY আছে, তাই row-টা জমার বাক্সে গেল।`;
            }
            if (groupsEmitted < offset) {
                groupsEmitted++;
                return `${text} কিন্তু OFFSET-এ বাদ।`;
            }
            outRows.push(gr.out);
            text += " ফলে পাঠানো হলো।";
            if (outRows.length >= limit) {
                stopped = true;
                text += ` ফলে ${bn(limit)}টা row হয়ে গেছে (LIMIT), তাই SQLite এখানেই থামল।`;
            }
            return text;
        };

        // একটা জোড়া (বা row) পাইপলাইন দিয়ে পাঠানো: কী হলো তার ধরন আর ব্যাখ্যা
        const proc = (c) => {
            if (!c.pass)
                return { cat: "where" };
            if (aggregate) {
                acc = calls.map((call, ci) => `${call} = ${show(running.get(c.pos)?.[ci])}`);
                return { cat: "agg" };
            }
            if (grouped && groupSorted) {
                box.items.push(c);
                return { cat: "box-group" };
            }
            if (grouped) {
                const k = JSON.stringify(groupKey.get(c.key));
                let ended = "";
                if (curGroup && curGroup.key !== k)
                    ended = endGroup(groupByKey.get(curGroup.key), curGroup.count);
                if (!curGroup || curGroup.key !== k)
                    curGroup = { key: k, count: 0 };
                curGroup.count++;
                return { cat: "group", ended, group: groupByKey.get(k) };
            }
            if (q.distinct) {
                const sig = JSON.stringify(c.out);
                if (seen.has(sig))
                    return { cat: "dup" };
                seen.add(sig);
            }
            if (sorter) {
                const ranked = (x, y) => rank.get(x.pos) - rank.get(y.pos);
                if (box.items.length < needed) {
                    box.items.push(c);
                    if (box.sorted)
                        box.items.sort(ranked);
                    return { cat: "box" };
                }
                const worst = box.items[box.items.length - 1];
                if (rank.get(c.pos) > rank.get(worst.pos))
                    return { cat: "discard" };
                box.items.pop();
                box.items.push(c);
                box.items.sort(ranked);
                return { cat: "replace", evicted: worst };
            }
            if (skippedByOffset < offset) {
                skippedByOffset++;
                return { cat: "offset" };
            }
            outRows.push(c.out);
            emitted++;
            if (emitted >= limit) {
                stopped = true;
                return { cat: "out", limitHit: true };
            }
            return { cat: "out" };
        };
        const STATUS = { where: "drop", agg: "keep", "box-group": "box", group: "keep", dup: "dup", box: "box", replace: "box", discard: "discard", offset: "offset", out: "keep" };
        const rank0 = ["keep", "box", "dup", "offset", "discard", "drop"];
        const best = (list) => rank0.find((s) => list.includes(s)) ?? "drop";
        const limitText = () => {
            const left = src[0].filter((s) => s === "pending").length;
            return ` ফলে ${bn(limit)}টা row হয়ে গেছে (LIMIT), তাই SQLite এখানেই পড়া থামিয়ে দিল${left ? `; বাকি ${bn(left)}টা${isJoin ? " বাইরের" : ""} row ছুঁয়েও দেখেনি` : ""}।`;
        };

        // ---- ১. পড়া (আর JOIN হলে জোড়া খোঁজা)
        for (let k = 0; k < reads.length && !stopped; k++) {
            const i = reads[k];
            const jump = key && (k === 0 ? reads[0] > 0 || key.equality : reads[k - 1] !== i - 1);
            if (jump)
                for (let j = k === 0 ? 0 : reads[k - 1] + 1; j < i; j++)
                    src[0][j] = "skip";
            cur[0] = i;
            const readText = `${isJoin ? `বাইরে ${code(A.alias)}: ` : ""}${jump ? `B-tree ধরে সরাসরি ${A.label(i)}-এ গিয়ে পড়া হলো` : `${A.label(i)} পড়া হলো`}${values(i) ? ` (${values(i)})` : ""}।`;

            if (!isJoin) {
                let note = readText + (q.where ? (passA[i] ? ` ${code(q.where)} মেলে ✓।` : ` ${code(q.where)} মেলে না ✕, তাই বাদ; পরের row।`) : "");
                if (!passA[i]) {
                    src[0][i] = "drop";
                    snap(note);
                    continue;
                }
                const c = producedOf.get(i)[0];
                const r = proc(c);
                src[0][i] = STATUS[r.cat];
                if (r.cat === "replace")
                    src[0][atA.get(r.evicted.ra)] = "discard";
                if (r.cat === "agg")
                    note += " হিসাবে যোগ হলো; ফলে এখনো কিছু যায় না, সব row শেষ হলে একটা row বেরোবে।";
                else if (r.cat === "box-group")
                    note += ` GROUP BY আছে, তাই row-টা দলের মান (${terms.map((t, ti) => `${t} = ${show(groupKey.get(c.key)[ti])}`).join(", ")}) সহ জমার বাক্সে রাখা হলো।`;
                else if (r.cat === "group")
                    note += `${r.ended ? ` ${r.ended}` : ""} row-টা দল ${groupLabel(r.group)}-এর হিসাবে যোগ হলো।`;
                else if (r.cat === "dup")
                    note += " কিন্তু এই মান আগেই ফলে গেছে (DISTINCT), তাই আবার পাঠানো হলো না।";
                else if (r.cat === "box")
                    note += Number.isFinite(needed)
                        ? ` ORDER BY আছে, তাই এখনই ফলে না পাঠিয়ে জমার বাক্সে রাখা হলো। LIMIT থাকায় বাক্সে সবচেয়ে আগে আসা ${bn(needed)}টার বেশি রাখা হয় না, আর বাক্সটা সবসময় সাজানো থাকে।`
                        : " ORDER BY আছে, তাই এখনই ফলে না পাঠিয়ে জমার বাক্সে রাখা হলো: সব row না দেখে কোনটা প্রথম হবে বলা যায় না।";
                else if (r.cat === "discard")
                    note += ` কিন্তু ক্রমে এটা বাক্সের ${bn(needed)}টার সবার পরে আসে, তাই ফেলে দেওয়া হলো।`;
                else if (r.cat === "replace")
                    note += ` ক্রমে এটা বাক্সের শেষেরটার (${A.label(atA.get(r.evicted.ra))}) আগে আসে, তাই ওটা ফেলে দিয়ে এটা রাখা হলো।`;
                else if (r.cat === "offset")
                    note += ` কিন্তু OFFSET-এর জন্য প্রথম ${bn(offset)}টা row বাদ যায়; এটা তার ${bn(skippedByOffset)} নম্বর।`;
                else if (r.cat === "out") {
                    note += " SELECT-এর column বানিয়ে সাথে সাথে ফলে পাঠানো হলো।";
                    if (r.limitHit) {
                        note += limitText();
                        finishSkipped();
                    }
                }
                snap(note);
                continue;
            }

            // JOIN: বাইরের row → ভেতরে খোঁজা → জোড়াগুলো পাইপলাইনে
            src[1].fill("pending");
            cur[1] = -1;
            let note = readText;
            if (!passA[i]) {
                src[0][i] = "drop";
                snap(`${note} ${code(outerText)} মেলে না ✕, তাই ${code(B.alias)}-তে খোঁজাই হলো না; পরের row।`);
                continue;
            }
            if (outerTerms.length)
                note += ` ${code(outerText)} মেলে ✓।`;
            const ra = A.rids[i];
            const seenB = [...(examined.get(ra) ?? [])].map((rb) => atB.get(rb)).sort((x, y) => x - y);
            const matched = (matchedOf.get(ra) ?? []).map((c) => atB.get(c.rb));
            seenB.forEach((j) => { src[1][j] = "miss"; });
            matched.forEach((j) => { src[1][j] = "hit"; });
            cur[1] = matched[0] ?? seenB[0] ?? -1;
            if (B.loop.kind === "search" && B.loop.byPk)
                note += seenB.length ? ` ${code(B.alias)}-তে primary key দিয়ে সরাসরি ${B.label(seenB[0])}-এ গেল` : ` ${code(B.alias)}-তে primary key দিয়ে খুঁজে দেখল, মেলার মতো row নেই`;
            else if (B.loop.kind === "auto")
                note += !seenB.length && bloom.has(B.alias) ? ` Bloom filter আগেই জানিয়ে দিল ${code(B.alias)}-তে মেলার মতো row নেই, তাই index-এ খুঁজতে হলো না` : ` ${code(B.alias)}-এর অস্থায়ী index-এ খুঁজে ${seenB.length ? `${bn(seenB.length)}টা row পেল` : "কিছু পেল না"}`;
            else if (B.loop.kind === "search")
                note += ` ${code(B.alias)}-এর index (${code(B.loop.index)}) দিয়ে খুঁজে ${seenB.length ? `${bn(seenB.length)}টা row পেল` : "কিছু পেল না"}`;
            else
                note += ` ${code(B.alias)}-এর সব ${bn(B.rows.length)}টা row একটা একটা করে মিলিয়ে দেখল`;
            if (seenB.length && matched.length < seenB.length)
                note += matched.length ? `; তার ${bn(matched.length)}টা ON-এর সব শর্ত মেলে।` : `, কিন্তু ON-এর সব শর্ত মেলে না।`;
            else
                note += seenB.length ? ", মিলল ✓।" : "।";
            const list = producedOf.get(i) ?? [];
            if (!matched.length) {
                if (list.length)
                    note += ` জোড়া নেই, তাই ${joinType} JOIN-এর নিয়মে ${code(B.alias)}-এর column-এ NULL বসিয়ে একটা row বানাল।`;
                else {
                    src[0][i] = "nomatch";
                    snap(`${note} জোড়া নেই, তাই এই row থেকে কিছু ফলে যায় না।`);
                    continue;
                }
            }
            const results = [];
            for (const c of list) {
                if (stopped)
                    break;
                const r = proc(c);
                results.push(r);
                if (r.cat === "replace") {
                    const ia = atA.get(r.evicted.ra);
                    if (ia !== undefined && ia !== i && src[0][ia] === "box")
                        src[0][ia] = "discard";
                }
            }
            src[0][i] = best(results.map((r) => STATUS[r.cat]));
            note += ` ${summary(results, list.length, !matched.length)}`;
            if (stopped && !grouped) {
                note += limitText();
                finishSkipped();
            }
            snap(note);
        }
        // index দিয়ে সীমার খোঁজা: সীমা ভাঙা row-টা পড়ে থামে
        if (!stopped && key && !key.equality && reads.length) {
            const last = reads[reads.length - 1];
            const bound = reverse ? key.constraint.includes(">") : key.upper;
            if (bound && last + 1 < n) {
                src[0][last + 1] = "stop";
                cur[0] = last + 1;
                if (isJoin)
                    src[1].fill("pending");
                const left = n - last - 2;
                finishSkipped();
                snap(`${A.label(last + 1)} পড়া হলো: ${code(key.keyCond)} আর মেলে না। সব row ${code(key.keyCols[0])}-এর ক্রমে সাজানো, তাই সামনের কোনো row-ও মিলবে না; SQLite এখানেই থামল${left ? `, বাকি ${bn(left)}টা row ছুঁয়েও দেখেনি` : ""}।`);
            }
        }
        finishSkipped();
        if (frames.length && !stopped && !isJoin && !sorter && !grouped && !aggregate && reads.length) {
            frames[frames.length - 1].note += reads[reads.length - 1] === n - 1 ? " এটাই শেষ row, পড়া শেষ।" : "";
        }

        // ---- RIGHT/FULL JOIN: ভেতরের table আরেকবার, জোড়া না পাওয়াগুলো
        if (rightPass && !stopped) {
            phase = "right";
            cur[0] = -1;
            src[1].fill("paired");
            const results = [];
            for (const c of rightOnly) {
                if (stopped)
                    break;
                const r = proc(c);
                results.push(r);
                src[1][atB.get(c.rb)] = STATUS[r.cat];
            }
            cur[1] = rightOnly.length ? atB.get(rightOnly[0].rb) : -1;
            snap(`বাইরের লুপ শেষ। ${joinType} JOIN-এর জন্য এবার ${code(B.alias)}-এর সব row আরেকবার পড়া হলো: ${rightOnly.length ? `যারা কোনো জোড়া পায়নি (${bn(rightOnly.length)}টা), তাদের ${code(A.alias)}-এর column-এ NULL বসিয়ে row বানানো হলো। ${summary(results, rightOnly.length, true)}` : "সবাই জোড়া পেয়েছে, তাই বাড়তি row নেই।"}${stopped && !grouped ? limitText() : ""}`);
        }
        if (isJoin) {
            src[1].fill("pending");
            cur[1] = -1;
        }
        cur[0] = -1;

        // ---- ২. ORDER BY: সাজিয়ে ফলে পাঠানো
        if (sorter && !grouped) {
            phase = "sort";
            if (!box.topN) {
                box.items.sort((x, y) => rank.get(x.pos) - rank.get(y.pos));
                box.sorted = true;
                snap(`সব row পড়া শেষ। এবার জমার বাক্সের ${bn(box.items.length)}টা row ${code(q.orderBy)} অনুযায়ী সাজানো হলো।`);
            }
            phase = "out";
            const take = box.items.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
            take.forEach((c) => outRows.push(c.out));
            snap(`${box.topN ? "সব row পড়া শেষ। বাক্সটা আগে থেকেই সাজানো (B-tree), তাই " : ""}সাজানো ক্রমে${offset ? ` প্রথম ${bn(offset)}টা (OFFSET) বাদ দিয়ে` : ""} ${bn(take.length)}টা row ফলে পাঠানো হলো।`);
        }

        // ---- ২. aggregate: একটাই row
        if (aggregate) {
            phase = "out";
            const real = await runQuery(engine, statement, { maxRows: 5 });
            outColumns = real.columns;
            outRows.push(...real.rows);
            snap("সব row পড়া শেষ। হিসাব থেকে একটাই row বানিয়ে ফলে পাঠানো হলো।");
        }

        // ---- GROUP BY বাক্স ছাড়া (দল পরপর আসে): শেষ দলটা
        if (grouped && !groupSorted) {
            phase = sorter ? "group" : "out";
            if (curGroup && !stopped)
                snap(`সব row পড়া শেষ। ${endGroup(groupByKey.get(curGroup.key), curGroup.count)}`);
        }

        // ---- GROUP BY বাক্সসহ: সাজানো, প্রতিটা দলের হিসাব, HAVING
        if (grouped && groupSorted) {
            const order = new Map(groups.map((gr, k) => [gr.key, k]));
            phase = "sort";
            box.items.sort((x, y) => order.get(JSON.stringify(groupKey.get(x.key))) - order.get(JSON.stringify(groupKey.get(y.key))) || x.pos - y.pos);
            box.sorted = true;
            box.states = box.items.map(() => "");
            snap(`সব row পড়া শেষ। জমার বাক্সের ${bn(box.items.length)}টা row ${terms.map(code).join(", ")} অনুযায়ী সাজানো হলো, যাতে একই দলের row পাশাপাশি আসে।`);
            phase = "group";
            for (const gr of groups) {
                if (stopped)
                    break;
                const members = box.items.map((c, k) => (JSON.stringify(groupKey.get(c.key)) === gr.key ? k : -1)).filter((k) => k >= 0);
                box.states = box.states.map((s) => (s === "cur" ? "done" : s));
                members.forEach((k) => { box.states[k] = "cur"; });
                const lastOne = members[members.length - 1] === box.items.length - 1;
                snap(`দল ${groupLabel(gr)}: বাক্স থেকে পরপর ${bn(members.length)}টা row নিয়ে হিসাব হলো। ${lastOne ? "বাক্স শেষ" : "পরের row অন্য দলের"}, তাই ${endGroup(gr, members.length)}`);
            }
            box.states = box.states.map((s) => (s === "cur" ? "done" : s));
        }

        // ---- GROUP BY-এর পরে ORDER BY
        if (grouped && sorter) {
            phase = "sort";
            groupOut.sort((x, y) => orderRank.get(x.key) - orderRank.get(y.key));
            box = { kind: "sort", columns: outColumns, items: groupOut.map((gr) => gr.out), sorted: true, rowsGiven: true };
            acc = null;
            snap(`সব দল শেষ। জমার বাক্সের ${bn(groupOut.length)}টা row ${code(q.orderBy)} অনুযায়ী সাজানো হলো।`);
            phase = "out";
            const take = groupOut.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
            take.forEach((gr) => outRows.push(gr.out));
            snap(`সাজানো ক্রমে${offset ? ` প্রথম ${bn(offset)}টা (OFFSET) বাদ দিয়ে` : ""} ${bn(take.length)}টা row ফলে পাঠানো হলো।`);
        }
        else if (grouped) {
            phase = "out";
            acc = null;
            snap(`ফলে মোট ${bn(outRows.length)}টা row।`);
        }
        if (!sorter && !aggregate && !grouped) {
            phase = "out";
            snap(`ফলে মোট ${bn(outRows.length)}টা row, যে ক্রমে ${isJoin ? "জোড়া তৈরি" : "পড়া"} হয়েছিল সেই ক্রমেই।`);
        }
        return result();

        // JOIN-এর এক ধাপে কয়েকটা জোড়া হলে তাদের কী হলো, গুনে লেখা
        function summary(results, total, nulls) {
            if (!results.length)
                return "";
            const count = (cats) => results.filter((r) => cats.includes(r.cat)).length;
            const parts = [];
            const add = (cats, text) => { const k = count(cats); if (k) parts.push(text(k)); };
            add(["where"], (k) => `${bn(k)}টা WHERE-এ বাদ`);
            add(["out"], (k) => `${bn(k)}টা ফলে পাঠানো হলো`);
            add(["dup"], (k) => `${bn(k)}টা আগেই ফলে আছে (DISTINCT), তাই বাদ`);
            add(["box", "replace"], (k) => `${bn(k)}টা জমার বাক্সে`);
            add(["discard"], (k) => `${bn(k)}টা ক্রমে পিছিয়ে, ফেলে দেওয়া হলো`);
            add(["offset"], (k) => `${bn(k)}টা OFFSET-এ বাদ`);
            add(["agg"], (k) => `${bn(k)}টা হিসাবে যোগ হলো`);
            add(["box-group"], (k) => `${bn(k)}টা দলের মানসহ জমার বাক্সে`);
            add(["group"], (k) => `${bn(k)}টা দলের হিসাবে যোগ হলো`);
            const ended = results.map((r) => r.ended).filter(Boolean).join(" ");
            const head = nulls ? (total === 1 ? "NULL বসানো row-টা" : `NULL বসানো ${bn(total)}টা row`) : total === 1 ? "জোড়া row-টা" : `জোড়া ${bn(total)}টা row`;
            const whereNote = q.where && count(["where"]) ? ` (${code(q.where)})` : "";
            return `${ended ? `${ended} ` : ""}${head}: ${parts.join(", ")}${whereNote}।`;
        }

        function result() {
            const label = (c) => `${A.alias}: ${A.short(atA.get(c.ra))}, ${B.alias}: ${c.rb === null ? "NULL" : B.short(atB.get(c.rb))}`;
            const boxRows = (b) => (b.rowsGiven ? b.items : b.items.map((c) => (b.kind === "sort" ? [...(orderVals.get(c.pos) ?? []), ...(c.out ?? [])] : [...groupKey.get(c.key), ...(isJoin ? [label(c)] : A.rows[atA.get(c.ra)])])));
            return {
                ok: true,
                tables: tables.map((t, k) => ({ name: t.name, alias: t.alias, role: !isJoin ? "only" : k === 0 ? "outer" : "inner", columns: t.columns, rows: t.rows, pk: t.pkName ? [t.pkName] : [] })),
                outColumns,
                outRows,
                frames: frames.map((f) => (f.box ? { ...f, box: { kind: f.box.kind, columns: f.box.columns, rows: boxRows(f.box), states: f.box.states } } : f)),
                phases: [...new Set(frames.map((f) => f.phase))],
            };
        }
    }

    var api = { MAX_ROWS: MAX_ROWS, runTrace: runTrace };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlTrace = api;
})(typeof self !== 'undefined' ? self : this);
