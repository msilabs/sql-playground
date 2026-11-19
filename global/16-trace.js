/**
 * Query বাস্তবে যেভাবে চলে: SQLite একবারে একটা row নিয়ে কাজ করে। row পড়ে, WHERE মেলায়,
 * মিললে SELECT-এর column বানিয়ে সাথে সাথে ফলে পাঠায় (বা ORDER BY, GROUP BY থাকলে জমার
 * বাক্সে রাখে), তারপর পরের row। LIMIT পূর্ণ হলে পড়া থামায়।
 *
 * sql.js ভেতরের প্রতিটা পদক্ষেপ রেকর্ড করতে দেয় না, তাই ঘটনাগুলো সাজানো হয় SQLite-এর নিজের
 * plan (EXPLAIN QUERY PLAN আর bytecode) আর আসল ডেটা থেকে: কোন ক্রমে row পড়ে, কোথায় index দিয়ে
 * লাফ দেয়, কোথায় জমা করে সাজায়, কোথায় থামে। plan চেনা না গেলে { ok: false } (তখন যুক্তির ক্রম)।
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
    var M4 = isNode ? require('./06-stages.js') : root.SqlStages;
    var planOf = M4.planOf, indexKey = M4.indexKey, singleTable = M4.singleTable;

    const MAX_ROWS = 200;
    const REASONS = {
        "not-select": "বাস্তবের ছবি দেখা যায় শুধু SELECT query-র।",
        "no-from": "FROM নেই, তাই কোনো table পড়তে হয় না।",
        join: "কয়েকটা table জোড়া লাগানো query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        subquery: "subquery থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        with: "WITH (CTE) থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        window: "window ফাংশন (OVER) থাকা query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
        big: `table-এ ${bn(MAX_ROWS)}টার বেশি row, ধাপে ধাপে দেখানোর জন্য অনেক বেশি।`,
        plan: "SQLite এই query একটু অন্যভাবে চালায়, যার ছবি এখনো আঁকা যায় না।",
        shape: "এই ধরনের query-র বাস্তবের ছবি এখনো আঁকা যায় না।",
    };
    const no = (reason) => ({ ok: false, reason, message: REASONS[reason] });
    const quoteName = (name) => `"${name.replace(/"/g, '""')}"`;
    const literal = (text) => `'${text.replace(/'/g, "''")}'`;
    const show = (v) => (v === null ? "NULL" : typeof v === "string" ? `'${v}'` : v instanceof Uint8Array ? "BLOB" : String(v));
    const code = (s) => `\`${s}\``;

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

    async function runTrace(engine, statement) {
        const split = splitSelect(statement);
        if (!split.ok)
            return no(split.reason === "not-select" ? "not-select" : "shape");
        const q = split.query;
        if (!q.from)
            return no("no-from");
        if (q.with)
            return no("with");
        const name = singleTable(q.from);
        if (!name)
            return no(hasJoin(q.from) ? "join" : "shape");
        if (hasSubquery(statement))
            return no("subquery");
        if (q.hasWindow)
            return no("window");
        if ((q.distinct && (q.groupBy || q.hasAggregate)) || (q.having && !q.groupBy))
            return no("shape");
        try {
            return await build(engine, statement, q, name);
        }
        catch {
            return no("shape");
        }
    }

    async function build(engine, statement, q, name) {
        // ---- SQLite কীভাবে চালাবে
        const plan = await planOf(engine, statement);
        let access = null;
        const temps = new Set();
        for (const line of plan) {
            const t = /^USE TEMP B-TREE FOR (ORDER BY|GROUP BY|DISTINCT)$/.exec(line);
            if (t) {
                temps.add(t[1]);
                continue;
            }
            if (access)
                return no("plan");
            const scanIndex = /^SCAN \S+ USING (?:COVERING )?INDEX (\S+)$/.exec(line);
            if (/^SCAN \S+$/.test(line))
                access = { kind: "scan" };
            else if (scanIndex)
                access = { kind: "index-scan", index: scanIndex[1] };
            else if (line.startsWith("SEARCH "))
                access = { kind: "search", line };
            else
                return no("plan");
        }
        if (!access)
            return no("plan");
        const ops = (await runQuery(engine, `EXPLAIN ${statement}`, { maxRows: 2000 })).rows.map((r) => String(r[1]));
        const sorter = temps.has("ORDER BY");
        const grouped = Boolean(q.groupBy);
        if (grouped && !temps.has("GROUP BY"))
            return no("plan");
        if (grouped && q.orderBy && !sorter)
            return no("plan");
        const aggregate = q.hasAggregate && !grouped;
        if (aggregate && sorter)
            return no("plan");

        const fromAlias = (() => {
            const t = significant(tokenize(q.from));
            return t.length > 1 ? identName(t[t.length - 1]) : identName(t[0]);
        })();
        const rid = `${quoteName(fromAlias)}.rowid`;
        const pk = await runQuery(engine, `SELECT name, type FROM pragma_table_info(${literal(name)}) WHERE pk > 0`, { maxRows: 50 });
        const pkName = pk.rows.length === 1 ? String(pk.rows[0][0]) : null;

        let key = null;
        if (access.kind === "search") {
            key = await indexKey(engine, name, access.line, q.where);
            if (!key)
                return no("plan");
        }
        let indexCols = null;
        if (access.kind === "index-scan") {
            const idx = await runQuery(engine, `SELECT name FROM pragma_index_info(${literal(access.index)}) ORDER BY seqno`, { maxRows: 50 });
            if (!idx.rows.length || idx.rows.some((r) => r[0] === null))
                return no("plan");
            indexCols = idx.rows.map((r) => String(r[0]));
        }

        // ---- কোন ক্রমে row পড়ে
        const orders = q.orderBy ? orderParts(q) : [];
        const streamOrder = q.orderBy && !sorter && !grouped && !aggregate;
        const readOrder = streamOrder
            ? `${orders.map((o) => `${o.expr} ${o.suffix}`).join(", ")}, ${rid}`
            : key ? `${key.keyCols.map(quoteName).join(", ")}, ${rid}`
                : indexCols ? `${indexCols.map(quoteName).join(", ")}, ${rid}`
                    : rid;
        const reverse = streamOrder && orders[0].desc;

        // alias থাকা শর্ত: আগে যেমন লেখা তেমন, "no such column" হলে alias বদলে
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
        const data = await attempt((fix) => `SELECT ${rid}, CASE WHEN (${key ? key.keySql : "1"}) THEN 1 ELSE 0 END, CASE WHEN (${whereSql(fix)}) THEN 1 ELSE 0 END, ${quoteName(fromAlias)}.* FROM ${q.from} ORDER BY ${readOrder}`, MAX_ROWS + 1);
        if (data.total > MAX_ROWS)
            return no("big");
        const n = data.rows.length;
        const rids = data.rows.map((r) => r[0]);
        const hit = data.rows.map((r) => r[1] === 1);
        const pass = data.rows.map((r) => r[2] === 1);
        const columns = data.columns.slice(3);
        const rows = data.rows.map((r) => r.slice(3));
        const at = new Map(rids.map((v, i) => [v, i]));
        const pkAt = pkName ? columns.findIndex((c) => c.toLowerCase() === pkName.toLowerCase()) : -1;
        const label = (i) => (pkAt >= 0 ? code(`${columns[pkAt]} = ${show(rows[i][pkAt])}`) : `row ${bn(i + 1)}`);
        const whereCols = q.where
            ? columns.filter((c, ci) => ci !== pkAt).filter((c) => significant(tokenize(q.where)).some((t) => isNameToken(t) && identName(t).toLowerCase() === c.toLowerCase()))
            : [];
        const values = (i) => whereCols.map((c) => `${c} = ${show(rows[i][columns.indexOf(c)])}`).join(", ");
        const { limit, offset } = await limitOf(engine, q);

        // ---- ফলের row (SELECT-এর column), প্রতিটা row-এর জন্য
        let outColumns = [];
        const outOf = new Map();
        if (!aggregate && !grouped) {
            const r = await attempt(() => `SELECT ${rid}, ${q.select} FROM ${q.from}`, MAX_ROWS + 1);
            outColumns = r.columns.slice(1);
            r.rows.forEach((row) => outOf.set(at.get(row[0]), row.slice(1)));
        }

        // ---- frame বানানো
        const frames = [];
        const src = new Array(n).fill("pending");
        let box = null;
        const outRows = [];
        let acc = null;
        let phase = "read";
        const snap = (note, cur = -1) => {
            frames.push({
                phase,
                note,
                cur,
                src: src.slice(),
                box: box ? { ...box, items: box.items.slice(), states: box.states ? box.states.slice() : undefined } : null,
                outCount: outRows.length,
                acc: acc ? acc.slice() : null,
            });
        };
        const finishSkipped = () => src.forEach((s, i) => { if (s === "pending") src[i] = "skip"; });
        const whereText = q.where ? code(q.where) : "";
        const readText = (i, jump) => `${jump ? `B-tree ধরে সরাসরি ${label(i)}-এ গিয়ে পড়া হলো` : `${label(i)} পড়া হলো`}${values(i) ? ` (${values(i)})` : ""}।`;
        const passText = (i) => (q.where ? (pass[i] ? ` ${whereText} মেলে ✓।` : ` ${whereText} মেলে না ✕, তাই বাদ; পরের row।`) : "");

        // count(*)-এর সোজা পথ: row না পড়েই গোনা
        if (aggregate && ops.includes("Count") && !q.where) {
            const real = await runQuery(engine, statement, { maxRows: 1 });
            outColumns = real.columns;
            outRows.push(...real.rows);
            src.fill("skip");
            snap(`${code("count(*)")}-এ WHERE নেই, তাই SQLite একটা row-ও পড়ে না: table-এর B-tree নিজেই গুনে দেয় কয়টা row আছে (bytecode-এ ${code("Count")})। তাই সব row "ছোঁয়নি"।`);
            phase = "out";
            snap(`গোনা সংখ্যাটা দিয়ে একটা row বানিয়ে ফলে পাঠানো হলো।`);
            return result();
        }
        if (limit === 0) {
            src.fill("skip");
            snap(`${code("LIMIT 0")}: একটা row-ও লাগবে না, তাই SQLite কোনো row পড়েই না।`);
            return result();
        }

        // কোন row-গুলো পড়ে: SCAN-এ সব, index দিয়ে খুঁজলে শুধু মেলা অংশ (মাঝে ফাঁক থাকলে আবার লাফ)
        const reads = key ? hit.map((h, i) => (h ? i : -1)).filter((i) => i >= 0) : [...Array(n).keys()];
        if (key) {
            const keyName = key.keyCols[0];
            const what = key.byPk ? `${code(keyName)} এই table-এর primary key, আর table-টা ${code(keyName)}-এর ক্রমেই সাজানো থাকে (B-tree)` : `${code(keyName)}-এ index (${code(key.index)}) আছে, যেটা ${code(keyName)}-এর ক্রমে সাজানো (B-tree); নিচের table সেই ক্রমে`;
            const how = reads.length === 0
                ? `তাই SQLite B-tree ধরে খুঁজে দেখল: কোনো row ${code(key.keyCond)} মেলে না, তাই কোনো row পড়তেই হলো না।`
                : key.equality
                    ? `তাই সব row একটা একটা করে না দেখে B-tree ধরে সরাসরি মেলা row-গুলোতে যাবে${reads.length > 1 ? " (প্রতিটা মানের জন্য আলাদা করে খুঁজে)" : ""}।`
                    : reads[0] > 0
                        ? `তাই উপর থেকে না পড়ে B-tree ধরে সরাসরি প্রথম মেলা row ${label(reads[0])}-এ লাফ দেবে, আগের ${bn(reads[0])}টা row ছুঁয়েও দেখবে না।`
                        : `একদিকে কোনো সীমা নেই, তাই প্রথম row ${label(reads[0])} থেকেই পড়া শুরু; থামবে যেখানে ${code(key.keyCond)} ভাঙবে।`;
            if (reads.length === 0)
                src.fill("skip");
            snap(`${what}। ${how}`);
            if (reads.length === 0) {
                phase = "out";
                snap("কোনো row ফলে যায়নি।");
                return result();
            }
        }

        let emitted = 0;
        let skippedByOffset = 0;
        let stopped = false;
        const seen = new Set();
        const needed = offset + limit;

        // ORDER BY-এর জমার বাক্স: LIMIT থাকলে শুধু সেরা কয়টা রাখে
        let rank = null;
        let orderCols = [];
        const orderVals = new Map();
        if (sorter && !grouped) {
            const r = await attempt((fix) => `SELECT __rid, ${orders.map((_, k) => `__o${k}`).join(", ")} FROM (SELECT ${rid} AS __rid, row_number() OVER (ORDER BY ${readOrder}) AS __pos, ${orders.map((o, k) => `${o.expr} AS __o${k}`).join(", ")} FROM ${q.from} WHERE ${whereSql(fix)}) ORDER BY ${orders.map((o, k) => `__o${k} ${o.suffix}`).join(", ")}, __pos`, MAX_ROWS + 1);
            rank = new Map(r.rows.map((row, k) => [at.get(row[0]), k]));
            r.rows.forEach((row) => orderVals.set(at.get(row[0]), row.slice(1)));
            orderCols = orders.map((o) => `↕ ${o.expr}`);
            box = { kind: "sort", columns: [...orderCols, ...outColumns], items: [], sorted: Number.isFinite(needed) };
            box.topN = box.sorted;
        }

        // aggregate (GROUP BY ছাড়া): প্রতিটা row-এর পরে হিসাব কত দাঁড়াল
        const calls = aggregateCalls(q);
        const running = new Map();
        if (aggregate) {
            const r = await attempt((fix) => `SELECT ${rid}, ${calls.map((c) => `${c} OVER (ORDER BY ${readOrder} ROWS UNBOUNDED PRECEDING)`).join(", ")} FROM ${q.from} WHERE ${whereSql(fix)}`, MAX_ROWS + 1);
            r.rows.forEach((row) => running.set(at.get(row[0]), row.slice(1)));
            acc = calls.map((c) => `${c} = ${c.toLowerCase().startsWith("count") ? "0" : "NULL"}`);
        }

        // GROUP BY: দলের মান
        const terms = grouped ? groupTerms(q) : [];
        const groupKey = new Map();
        if (grouped) {
            const r = await attempt((fix) => `SELECT ${rid}, ${terms.map(fix).join(", ")} FROM ${q.from}`, MAX_ROWS + 1);
            r.rows.forEach((row) => groupKey.set(at.get(row[0]), row.slice(1)));
            box = { kind: "group", columns: [...terms.map((t) => `দল: ${t}`), ...columns], items: [], sorted: false };
        }

        // ---- ১. পড়া আর ছাঁকা
        for (let k = 0; k < reads.length && !stopped; k++) {
            const i = reads[k];
            const jump = key && (k === 0 ? reads[0] > 0 || key.equality : reads[k - 1] !== i - 1);
            if (jump)
                for (let j = k === 0 ? 0 : reads[k - 1] + 1; j < i; j++)
                    src[j] = "skip";
            let note = readText(i, jump) + passText(i);
            if (!pass[i]) {
                src[i] = "drop";
                snap(note, i);
                continue;
            }
            if (aggregate) {
                src[i] = "keep";
                acc = calls.map((c, ci) => `${c} = ${show(running.get(i)[ci])}`);
                snap(`${note} হিসাবে যোগ হলো; ফলে এখনো কিছু যায় না, সব row শেষ হলে একটা row বেরোবে।`, i);
                continue;
            }
            if (grouped) {
                src[i] = "box";
                box.items.push(i);
                snap(`${note} GROUP BY আছে, তাই row-টা দলের মান (${terms.map((t, ti) => `${t} = ${show(groupKey.get(i)[ti])}`).join(", ")}) সহ জমার বাক্সে রাখা হলো।`, i);
                continue;
            }
            if (q.distinct) {
                const sig = JSON.stringify(outOf.get(i));
                if (seen.has(sig)) {
                    src[i] = "dup";
                    snap(`${note} কিন্তু এই মান আগেই ফলে গেছে (DISTINCT), তাই আবার পাঠানো হলো না।`, i);
                    continue;
                }
                seen.add(sig);
            }
            if (sorter) {
                const ranked = (a, b) => rank.get(a) - rank.get(b);
                if (box.items.length < needed) {
                    box.items.push(i);
                    if (box.sorted)
                        box.items.sort(ranked);
                    src[i] = "box";
                    note += Number.isFinite(needed)
                        ? ` ORDER BY আছে, তাই এখনই ফলে না পাঠিয়ে জমার বাক্সে রাখা হলো। LIMIT থাকায় বাক্সে সবচেয়ে আগে আসা ${bn(needed)}টার বেশি রাখা হয় না, আর বাক্সটা সবসময় সাজানো থাকে।`
                        : " ORDER BY আছে, তাই এখনই ফলে না পাঠিয়ে জমার বাক্সে রাখা হলো: সব row না দেখে কোনটা প্রথম হবে বলা যায় না।";
                }
                else {
                    const worst = box.items[box.items.length - 1];
                    if (rank.get(i) > rank.get(worst)) {
                        src[i] = "discard";
                        note += ` কিন্তু ক্রমে এটা বাক্সের ${bn(needed)}টার সবার পরে আসে, তাই ফেলে দেওয়া হলো।`;
                    }
                    else {
                        box.items.pop();
                        src[worst] = "discard";
                        box.items.push(i);
                        box.items.sort(ranked);
                        src[i] = "box";
                        note += ` ক্রমে এটা বাক্সের শেষেরটার (${label(worst)}) আগে আসে, তাই ওটা ফেলে দিয়ে এটা রাখা হলো।`;
                    }
                }
                snap(note, i);
                continue;
            }
            if (skippedByOffset < offset) {
                skippedByOffset++;
                src[i] = "offset";
                snap(`${note} কিন্তু OFFSET-এর জন্য প্রথম ${bn(offset)}টা row বাদ যায়; এটা তার ${bn(skippedByOffset)} নম্বর।`, i);
                continue;
            }
            src[i] = "keep";
            outRows.push(outOf.get(i));
            emitted++;
            note += " SELECT-এর column বানিয়ে সাথে সাথে ফলে পাঠানো হলো।";
            if (emitted >= limit) {
                stopped = true;
                const left = src.filter((s) => s === "pending").length;
                note += ` ফলে ${bn(limit)}টা row হয়ে গেছে (LIMIT), তাই SQLite এখানেই পড়া থামিয়ে দিল${left ? `; বাকি ${bn(left)}টা row ছুঁয়েও দেখেনি` : ""}।`;
                finishSkipped();
            }
            snap(note, i);
        }
        // index দিয়ে সীমার খোঁজা: সীমা ভাঙা row-টা পড়ে থামে
        if (!stopped && key && !key.equality) {
            const last = reads[reads.length - 1];
            const bound = reverse ? key.constraint.includes(">") : key.upper;
            if (bound && last + 1 < n) {
                src[last + 1] = "stop";
                const left = n - last - 2;
                finishSkipped();
                snap(`${label(last + 1)} পড়া হলো: ${code(key.keyCond)} আর মেলে না। সব row ${code(key.keyCols[0])}-এর ক্রমে সাজানো, তাই সামনের কোনো row-ও মিলবে না; SQLite এখানেই থামল${left ? `, বাকি ${bn(left)}টা row ছুঁয়েও দেখেনি` : ""}।`, last + 1);
            }
        }
        finishSkipped();
        if (frames.length && !stopped && !sorter && !grouped && !aggregate) {
            frames[frames.length - 1].note += reads[reads.length - 1] === n - 1 ? " এটাই শেষ row, পড়া শেষ।" : "";
        }

        // ---- ২. ORDER BY: সাজিয়ে ফলে পাঠানো
        if (sorter && !grouped) {
            phase = "sort";
            if (!box.sorted) {
                box.items.sort((a, b) => rank.get(a) - rank.get(b));
                box.sorted = true;
                snap(`সব row পড়া শেষ। এবার জমার বাক্সের ${bn(box.items.length)}টা row ${code(q.orderBy)} অনুযায়ী সাজানো হলো।`);
            }
            phase = "out";
            const sortedItems = box.items.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
            sortedItems.forEach((i) => outRows.push(outOf.get(i)));
            snap(`${box.topN ? "সব row পড়া শেষ। বাক্সটা আগে থেকেই সাজানো (B-tree), তাই " : ""}সাজানো ক্রমে${offset ? ` প্রথম ${bn(offset)}টা (OFFSET) বাদ দিয়ে` : ""} ${bn(sortedItems.length)}টা row ফলে পাঠানো হলো।`);
        }

        // ---- ২. aggregate: একটাই row
        if (aggregate) {
            phase = "out";
            const real = await runQuery(engine, statement, { maxRows: 5 });
            outColumns = real.columns;
            outRows.push(...real.rows);
            snap(`সব row পড়া শেষ। হিসাব থেকে একটাই row বানিয়ে ফলে পাঠানো হলো।`);
        }

        // ---- ২–৪. GROUP BY: সাজানো, প্রতিটা দলের হিসাব, HAVING, (ORDER BY), ফল
        if (grouped) {
            const g = await attempt((fix) => `SELECT ${terms.map((t, k) => `${fix(t)} AS __g${k}`).join(", ")}, CASE WHEN (${q.having ? resolveAliases(q.having, q.items) : "1"}) THEN 1 ELSE 0 END AS __h, ${q.select} FROM ${q.from} WHERE ${whereSql(fix)} GROUP BY ${terms.map(fix).join(", ")} ORDER BY ${terms.map((_, k) => `__g${k}`).join(", ")}`, MAX_ROWS + 1);
            const nk = terms.length;
            outColumns = g.columns.slice(nk + 1);
            const groups = g.rows.map((row) => ({ key: JSON.stringify(row.slice(0, nk)), keyVals: row.slice(0, nk), pass: row[nk] === 1, out: row.slice(nk + 1) }));
            const order = new Map(groups.map((gr, k) => [gr.key, k]));
            const pos = new Map(box.items.map((i, k) => [i, k]));
            phase = "sort";
            box.items.sort((a, b) => order.get(JSON.stringify(groupKey.get(a))) - order.get(JSON.stringify(groupKey.get(b))) || pos.get(a) - pos.get(b));
            box.sorted = true;
            box.states = box.items.map(() => "");
            snap(`সব row পড়া শেষ। জমার বাক্সের ${bn(box.items.length)}টা row ${terms.map(code).join(", ")} অনুযায়ী সাজানো হলো, যাতে একই দলের row পাশাপাশি আসে।`);

            phase = "group";
            let orderRank = null;
            let groupOut = [];
            if (sorter) {
                const r = await attempt((fix) => `SELECT * FROM (SELECT ${terms.map((t, k) => `${fix(t)} AS __g${k}`).join(", ")}, ${orders.map((o, k) => `${o.expr} AS __o${k}`).join(", ")} FROM ${q.from} WHERE ${whereSql(fix)} GROUP BY ${terms.map(fix).join(", ")}) ORDER BY ${orders.map((o, k) => `__o${k} ${o.suffix}`).join(", ")}, ${terms.map((_, k) => `__g${k}`).join(", ")}`, MAX_ROWS + 1);
                orderRank = new Map(r.rows.map((row, k) => [JSON.stringify(row.slice(0, nk)), k]));
            }
            let groupsEmitted = 0;
            for (const gr of groups) {
                if (stopped)
                    break;
                const members = box.items.map((i, k) => (JSON.stringify(groupKey.get(i)) === gr.key ? k : -1)).filter((k) => k >= 0);
                box.states = box.states.map((s) => (s === "cur" ? "done" : s));
                members.forEach((k) => { box.states[k] = "cur"; });
                acc = outColumns.map((c, ci) => `${c} = ${show(gr.out[ci])}`);
                const keyText = gr.keyVals.map(show).join(", ");
                let note = `দল ${keyText}: বাক্স থেকে পরপর ${bn(members.length)}টা row নিয়ে হিসাব হলো। ${members[members.length - 1] === box.items.length - 1 ? "বাক্স শেষ" : "পরের row অন্য দলের"}, তাই দলটা শেষ, একটা row বানানো হলো।`;
                if (q.having)
                    note += gr.pass ? ` HAVING ${code(q.having)} মেলে ✓।` : ` HAVING ${code(q.having)} মেলে না ✕, তাই দলটা বাদ।`;
                if (gr.pass) {
                    if (sorter) {
                        groupOut.push(gr);
                        note += " ORDER BY আছে, তাই row-টা আরেকটা জমার বাক্সে গেল।";
                    }
                    else if (groupsEmitted < offset) {
                        groupsEmitted++;
                        note += " কিন্তু OFFSET-এ বাদ।";
                    }
                    else {
                        outRows.push(gr.out);
                        note += " ফলে পাঠানো হলো।";
                        if (outRows.length >= limit) {
                            stopped = true;
                            note += ` ফলে ${bn(limit)}টা row হয়ে গেছে (LIMIT), তাই বাকি দলের হিসাব আর করা হলো না।`;
                        }
                    }
                }
                snap(note);
            }
            box.states = box.states.map((s) => (s === "cur" ? "done" : s));
            if (sorter) {
                phase = "sort";
                groupOut.sort((a, b) => orderRank.get(a.key) - orderRank.get(b.key));
                box = { kind: "sort", columns: outColumns, items: groupOut.map((gr) => gr.out), sorted: true, rowsGiven: true };
                acc = null;
                snap(`সব দল শেষ। জমার বাক্সের ${bn(groupOut.length)}টা row ${code(q.orderBy)} অনুযায়ী সাজানো হলো।`);
                phase = "out";
                const take = groupOut.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
                take.forEach((gr) => outRows.push(gr.out));
                snap(`সাজানো ক্রমে${offset ? ` প্রথম ${bn(offset)}টা (OFFSET) বাদ দিয়ে` : ""} ${bn(take.length)}টা row ফলে পাঠানো হলো।`);
            }
            else {
                phase = "out";
                acc = null;
                snap(`ফলে মোট ${bn(outRows.length)}টা row।`);
            }
        }
        if (!sorter && !aggregate && !grouped) {
            phase = "out";
            snap(`ফলে মোট ${bn(outRows.length)}টা row, যে ক্রমে পড়া হয়েছিল সেই ক্রমেই।`);
        }
        return result();

        function result() {
            const boxRows = (b) => (b.rowsGiven ? b.items : b.items.map((i) => (b.kind === "sort" ? [...(orderVals.get(i) ?? []), ...(outOf.get(i) ?? [])] : [...groupKey.get(i), ...rows[i]])));
            return {
                ok: true,
                table: { name, columns, rows, pk: pkName ? [pkName] : [] },
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
