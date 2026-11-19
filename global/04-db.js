/**
 * DB-র সাথে কথা বলার ছোট সাহায্য আর schema পড়া।
 *
 * Engine মানে যার আছে `load(datasetId, log)` আর `run(sql, options)`: ব্রাউজারে worker
 * (80-client.js), টেস্টে সরাসরি sql.js। বাকি সব কোড শুধু এটাই দেখে।
 */
(function (root) {
    /** সময়ের মধ্যে query শেষ হয়নি; DB আবার load করতে হবে */
    class TimeoutError extends Error {
        constructor() {
            super("timeout");
            this.name = "TimeoutError";
        }
    }
    const USER_MAX_ROWS = 1000;
    const COUNT_LIMIT = 100_000;
    /** ভুল না হলে প্রথম statement-এর ফল; ভুল হলে Error ছোড়ে। ভেতরের ছোট query-র জন্য। */
    async function query(engine, sql, options) {
        const result = await engine.run(sql, options);
        if (result.error)
            throw new Error(result.error.message);
        const first = result.statements[0];
        if (!first)
            throw new Error("no statement");
        return first;
    }
    /** DB-তে কী কী table আর column আছে (schema প্যানেল, autocomplete আর ভুলের ইঙ্গিতের জন্য) */
    const EMPTY_SCHEMA = { tables: [] };
    const quote = (name) => `"${name.replace(/"/g, '""')}"`;
    const literal = (text) => `'${text.replace(/'/g, "''")}'`;
    async function loadSchema(engine) {
        const cols = await query(engine, `SELECT m.name, m.type, p.name, p.type, p.pk, p."notnull"
         FROM sqlite_schema m JOIN pragma_table_info(m.name) p
         WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%'
         ORDER BY m.rowid, p.cid`, { maxRows: 5000 });
        const fks = await query(engine, `SELECT m.name, f."from", f."table", f."to"
         FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
         WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`, { maxRows: 5000 });
        const refs = new Map();
        for (const [table, from, target, to] of fks.rows) {
            refs.set(`${table}.${from}`, { table: String(target), column: to === null ? "id" : String(to) });
        }
        const tables = new Map();
        for (const [table, kind, name, type, pk, notNull] of cols.rows) {
            const key = String(table);
            if (!tables.has(key))
                tables.set(key, { kind: kind === "view" ? "view" : "table", columns: [] });
            tables.get(key).columns.push({
                name: String(name),
                type: String(type ?? ""),
                pk: Number(pk) > 0,
                notNull: Number(notNull) === 1,
                ref: refs.get(`${key}.${name}`),
            });
        }
        const names = [...tables.keys()];
        const counts = new Map();
        if (names.length > 0) {
            try {
                const r = await query(engine, names.map((n) => `SELECT ${literal(n)}, count(*) FROM ${quote(n)}`).join(" UNION ALL "), { maxRows: names.length });
                for (const [name, n] of r.rows)
                    counts.set(String(name), Number(n));
            }
            catch {
                // কোনো view ভাঙা থাকলে গোনা বাদ
            }
        }
        return {
            tables: names.map((name) => ({
                name,
                kind: tables.get(name).kind,
                rowCount: counts.get(name) ?? null,
                columns: tables.get(name).columns,
            })),
        };
    }
    const allColumns = (schema) => [
        ...new Set(schema.tables.flatMap((t) => t.columns.map((c) => c.name))),
    ];

    var api = { TimeoutError: TimeoutError, USER_MAX_ROWS: USER_MAX_ROWS, COUNT_LIMIT: COUNT_LIMIT, query: query, EMPTY_SCHEMA: EMPTY_SCHEMA, loadSchema: loadSchema, allColumns: allColumns };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlDb = api;
})(typeof self !== 'undefined' ? self : this);
