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
    it("primary key-র সীমায় WHERE তিন ধাপে: লাফ, পড়া, থামা", async () => {
        const r = await stagesOf("SELECT * FROM districts WHERE id < 10 AND id > 3");
        const where = r.stages.filter((s) => s.key === "where");
        expect(where.map((s) => s.sub)).toEqual(["খোঁজা", "পড়া", "থামা"]);
        const s = (states) => states.join(" ");
        expect(s(where[0].states)).toBe("skip skip skip seek pending pending pending pending pending pending pending pending");
        expect(s(where[1].states)).toBe("skip skip skip keep keep keep keep keep keep pending pending pending");
        expect(s(where[2].states)).toBe("skip skip skip keep keep keep keep keep keep stop skip skip");
        expect(r.stages.at(-1).rows).toEqual((await query(engine, "SELECT * FROM districts WHERE id < 10 AND id > 3")).rows);
    });
    it("primary key-র = বা IN হলে এক ধাপে সরাসরি খোঁজা; বাকি শর্তে বাদ পড়া row আলাদা", async () => {
        const r = await stagesOf("SELECT * FROM districts WHERE id IN (2, 5, 9)");
        expect(r.stages.filter((s) => s.key === "where").map((s) => s.states.filter((x) => x !== "skip").length)).toEqual([3]);
        const mixed = await stagesOf("SELECT * FROM districts d WHERE d.id < 4 AND division = 'ঢাকা'");
        expect(mixed.stages.find((s) => s.sub === "পড়া").states.slice(0, 4)).toEqual(["keep", "drop", "drop", "pending"]);
    });
    it("index কাজে না লাগলে সাধারণ WHERE ধাপ", async () => {
        for (const sql of ["SELECT * FROM districts WHERE division = 'ঢাকা'", "SELECT * FROM districts WHERE id + 1 < 5", "SELECT * FROM districts WHERE id <> 3"]) {
            const where = (await stagesOf(sql)).stages.filter((s) => s.key === "where");
            expect(where.length).toBe(1);
            expect(where[0].states).toBeUndefined();
            expect(where[0].marks.length).toBe(12);
        }
    });
    it("query কোন table-এ চলবে, primary key-সহ", async () => {
        const r = await stagesOf("SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id IN (SELECT order_id FROM order_items)");
        expect(r.sources.map((s) => [s.name, s.pk])).toEqual([["orders", ["id"]], ["customers", ["id"]], ["order_items", ["id"]]]);
        expect(r.sources[0].rows.length).toBeLessThanOrEqual(50);
    });
    it("বাস্তবে কী হয়: সব row জমা হয় না, LIMIT আগে থামে, ORDER BY-তে জমা করে সাজায়", async () => {
        const note = async (sql, key) => (await stagesOf(sql)).stages.find((s) => s.key === key).note;
        expect(await note("SELECT * FROM products", "from")).toContain("সব row একসাথে আনে না");
        expect(await note("SELECT name FROM products WHERE price > 1000 LIMIT 3", "limit")).toContain("পড়া থামিয়ে দেয়");
        expect(await note("SELECT name FROM products ORDER BY price LIMIT 3", "order")).toContain("temp B-tree");
        expect(await note("SELECT name FROM products ORDER BY price LIMIT 3", "limit")).toContain("আগে সেগুলো সব পড়ে");
        expect(await note("SELECT * FROM districts ORDER BY id", "order")).toContain("আলাদা করে সাজাতে হয়নি");
        expect(await note("SELECT category, count(*) FROM products GROUP BY category ORDER BY category", "order")).toContain("GROUP BY-এর জন্য");
    });
    it("UNION হলে বাংলায় কারণ", async () => {
        const r = await runStages(engine, "SELECT 1 UNION SELECT 2");
        expect(r.ok).toBe(false);
    });
});
