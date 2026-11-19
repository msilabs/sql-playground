import { describe, it } from 'node:test';
import { expect, engineWith, Trace, Db } from './helpers.mjs';

const { runTrace } = Trace;
const engine = await engineWith('dokan');
const traceOf = async (sql) => {
    const t = await runTrace(engine, sql);
    if (!t.ok)
        throw new Error(t.message);
    return t;
};
const last = (t) => t.frames.at(-1);

describe("runTrace: বাস্তবে যেভাবে চলে", () => {
    it("শেষে ফল আসল query-র ফলের সমান", async () => {
        for (const sql of [
            "SELECT name FROM products WHERE price > 1000 LIMIT 3",
            "SELECT * FROM districts WHERE id < 10 AND id > 3",
            "SELECT * FROM districts WHERE id IN (2, 5, 9)",
            "SELECT name, price FROM products ORDER BY price DESC LIMIT 3",
            "SELECT name, price FROM products ORDER BY price LIMIT 4 OFFSET 2",
            "SELECT name FROM products WHERE stock > 10 ORDER BY name",
            "SELECT DISTINCT category FROM products",
            "SELECT count(*), sum(price) FROM products WHERE price > 1000",
            "SELECT category, sum(stock) AS s FROM products GROUP BY category HAVING s > 50 ORDER BY s DESC",
            "SELECT category, count(*) FROM products GROUP BY category LIMIT 2",
            "SELECT * FROM districts ORDER BY id DESC LIMIT 2",
            "SELECT name AS n, price * 2 AS d FROM products WHERE d > 5000",
        ]) {
            const t = await traceOf(sql);
            const real = await Db.query(engine, sql);
            expect(t.outRows, sql).toEqual(real.rows);
            expect(t.outColumns, sql).toEqual(real.columns);
            expect(last(t).outCount, sql).toBe(real.rows.length);
        }
    });
    it("LIMIT পূর্ণ হলে পড়া থামে, বাকি row ছোঁয় না", async () => {
        const t = await traceOf("SELECT name FROM products WHERE price > 1000 LIMIT 3");
        const src = last(t).src;
        expect(src.slice(0, 10).join(" ")).toBe("drop keep keep drop drop drop drop drop drop keep");
        expect(src.slice(10).every((s) => s === "skip")).toBe(true);
    });
    it("primary key দিয়ে খুঁজলে লাফ দেয় আর সীমা ভাঙলে থামে", async () => {
        const t = await traceOf("SELECT * FROM districts WHERE id < 10 AND id > 3");
        expect(last(t).src.join(" ")).toBe("skip skip skip keep keep keep keep keep keep stop skip skip");
        expect(t.frames[0].cur).toBe(-1);
    });
    it("ORDER BY … LIMIT-এ বাক্সে শুধু সেরা কয়টা থাকে", async () => {
        const t = await traceOf("SELECT name, price FROM products ORDER BY price DESC LIMIT 3");
        expect(t.frames.filter((f) => f.phase === "read").every((f) => f.box.rows.length <= 3)).toBe(true);
        expect(last(t).src.filter((s) => s === "box").length).toBe(3);
        expect(last(t).src.filter((s) => s === "discard").length).toBe(17);
    });
    it("WHERE ছাড়া count(*) কোনো row পড়ে না", async () => {
        const t = await traceOf("SELECT count(*) FROM products");
        expect(last(t).src.every((s) => s === "skip")).toBe(true);
        expect(t.outRows).toEqual([[20]]);
    });
    it("GROUP BY: জমা, সাজানো, দলের হিসাব, তারপর ফল", async () => {
        const t = await traceOf("SELECT category, sum(stock) AS s FROM products GROUP BY category HAVING s > 50 ORDER BY s DESC");
        expect(t.phases).toEqual(["read", "sort", "group", "out"]);
        expect(t.frames.filter((f) => f.phase === "group").length).toBe(5);
    });
    it("যেটা এখনো আঁকা যায় না, সেখানে কারণসহ ok: false", async () => {
        expect((await runTrace(engine, "SELECT c.name FROM customers c JOIN districts d ON d.id = c.district_id")).reason).toBe("join");
        expect((await runTrace(engine, "SELECT name FROM products WHERE price > (SELECT avg(price) FROM products)")).reason).toBe("subquery");
        expect((await runTrace(engine, "UPDATE products SET stock = 1")).reason).toBe("not-select");
        expect((await runTrace(engine, "SELECT max(id) FROM districts")).reason).toBe("plan");
    });
});
