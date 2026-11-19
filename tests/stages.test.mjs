import { describe, it } from 'node:test';
import { expect, engineWith, Stages, Db } from './helpers.mjs';

const { runStages } = Stages;
const { query } = Db;
const engine = await engineWith('dokan');
const stagesOf = async (sql) => {
    const r = await runStages(engine, sql);
    if (!r.ok)
        throw new Error(r.message);
    return r;
};
describe("runStages", () => {
    it("চলার ক্রমে ধাপ, আর শেষ ধাপ আসল query-র ফলের সমান", async () => {
        const sql = "SELECT category, count(*) AS n FROM products WHERE price > 300 GROUP BY category HAVING n >= 2 ORDER BY n DESC, category LIMIT 3";
        const r = await stagesOf(sql);
        expect(r.stages.map((s) => s.key)).toEqual(["from", "where", "group", "having", "select", "order", "limit"]);
        expect(r.written).toEqual(["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"]);
        expect(r.stages.every((s) => !s.error)).toBe(true);
        const real = await query(engine, sql);
        expect(r.stages.at(-1).rows).toEqual(real.rows);
    });
    it("WHERE ধাপে কোন row টিকল তা চিহ্নিত", async () => {
        const r = await stagesOf("SELECT name FROM products WHERE price > 1000");
        const where = r.stages.find((s) => s.key === "where");
        expect(where.total).toBe(20);
        const kept = (await query(engine, "SELECT count(*) FROM products WHERE price > 1000")).rows[0][0];
        expect(where.marks.filter(Boolean).length).toBe(kept);
        expect(where.columns).not.toContain("CASE");
    });
    it("GROUP BY ধাপে দলের নম্বর", async () => {
        const r = await stagesOf("SELECT category, sum(stock) FROM products GROUP BY category");
        const group = r.stages.find((s) => s.key === "group");
        expect(new Set(group.groups).size).toBe(5);
        expect(group.columns).toEqual(["id", "name", "category", "price", "stock"]);
    });
    it("WHERE-এ SELECT-এর alias থাকলেও ধাপ বানায়", async () => {
        const r = await stagesOf("SELECT name, price * 2 AS double_price FROM products WHERE double_price > 5000");
        expect(r.stages.find((s) => s.key === "where").error).toBeUndefined();
    });
    it("FROM ছাড়া query", async () => {
        const r = await stagesOf("SELECT 1 + 1 AS x");
        expect(r.stages.map((s) => s.key)).toEqual(["select"]);
        expect(r.stages[0].rows).toEqual([[2]]);
    });
    it("UNION হলে বাংলায় কারণ", async () => {
        const r = await runStages(engine, "SELECT 1 UNION SELECT 2");
        expect(r.ok).toBe(false);
    });
});
