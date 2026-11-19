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
        const src = last(t).src[0];
        expect(src.slice(0, 10).join(" ")).toBe("drop keep keep drop drop drop drop drop drop keep");
        expect(src.slice(10).every((s) => s === "skip")).toBe(true);
    });
    it("primary key দিয়ে খুঁজলে লাফ দেয় আর সীমা ভাঙলে থামে", async () => {
        const t = await traceOf("SELECT * FROM districts WHERE id < 10 AND id > 3");
        expect(last(t).src[0].join(" ")).toBe("skip skip skip keep keep keep keep keep keep stop skip skip");
        expect(t.frames[0].cur[0]).toBe(-1);
    });
    it("ORDER BY … LIMIT-এ বাক্সে শুধু সেরা কয়টা থাকে", async () => {
        const t = await traceOf("SELECT name, price FROM products ORDER BY price DESC LIMIT 3");
        expect(t.frames.filter((f) => f.phase === "read").every((f) => f.box.rows.length <= 3)).toBe(true);
        expect(last(t).src[0].filter((s) => s === "box").length).toBe(3);
        expect(last(t).src[0].filter((s) => s === "discard").length).toBe(17);
    });
    it("WHERE ছাড়া count(*) কোনো row পড়ে না", async () => {
        const t = await traceOf("SELECT count(*) FROM products");
        expect(last(t).src[0].every((s) => s === "skip")).toBe(true);
        expect(t.outRows).toEqual([[20]]);
    });
    it("GROUP BY: জমা, সাজানো, দলের হিসাব, তারপর ফল", async () => {
        const t = await traceOf("SELECT category, sum(stock) AS s FROM products GROUP BY category HAVING s > 50 ORDER BY s DESC");
        expect(t.phases).toEqual(["read", "sort", "group", "out"]);
        expect(t.frames.filter((f) => f.phase === "group").length).toBe(5);
    });
    it("JOIN: শেষে ফল আসল query-র ফলের সমান (পাঠের সব রকম JOIN)", async () => {
        const school = await engineWith('school');
        const cases = [
            [engine, "SELECT c.name, d.name AS জেলা FROM customers c INNER JOIN districts d ON d.id = c.district_id"],
            [engine, "SELECT c.name, d.name AS জেলা FROM customers c JOIN districts d ON d.id = c.district_id WHERE d.division = 'চট্টগ্রাম' ORDER BY d.name"],
            [engine, "SELECT orders.id, customers.name, orders.order_date FROM orders JOIN customers ON customers.id = orders.customer_id LIMIT 5"],
            [engine, "SELECT count(*) FROM districts CROSS JOIN products"],
            [engine, "SELECT c.name, d.name FROM customers c, districts d WHERE d.id = c.district_id AND c.id < 5"],
            [engine, "SELECT d.name, c.name FROM districts d LEFT JOIN customers c ON c.district_id = d.id"],
            [engine, "SELECT d.name FROM districts d LEFT JOIN customers c ON c.district_id = d.id WHERE c.id IS NULL"],
            [engine, "SELECT d.name, count(c.id) AS গ্রাহক FROM districts d LEFT JOIN customers c ON c.district_id = d.id GROUP BY d.id ORDER BY গ্রাহক DESC"],
            [engine, "SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'paid'"],
            [engine, "SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'"],
            [engine, "SELECT c.name, o.id AS অর্ডার FROM orders o RIGHT JOIN customers c ON c.id = o.customer_id ORDER BY o.id"],
            [engine, "SELECT c.name AS গ্রাহক, d.name AS জেলা FROM customers c FULL JOIN districts d ON d.id = c.district_id WHERE c.id IS NULL OR d.id IS NULL"],
            [engine, "SELECT a.name, b.name, a.district_id FROM customers a JOIN customers b ON a.district_id = b.district_id AND a.id < b.id ORDER BY a.district_id"],
            [engine, "SELECT a.name, a.price, b.name, b.price FROM products a JOIN products b ON a.category = b.category"],
            [engine, "SELECT DISTINCT d.division FROM customers c JOIN districts d ON d.id = c.district_id"],
            [engine, "SELECT d.division, count(*) FROM customers c JOIN districts d ON d.id = c.district_id GROUP BY d.division HAVING count(*) > 2"],
            [school, "SELECT a.name, b.name, a.hometown FROM students a JOIN students b ON a.class_id = b.class_id AND a.hometown = b.hometown AND a.id < b.id"],
        ];
        for (const [eng, sql] of cases) {
            const t = await runTrace(eng, sql);
            expect(t.ok, sql).toBe(true);
            expect(t.outRows, sql).toEqual((await Db.query(eng, sql)).rows);
        }
    });
    it("JOIN: SQLite যেটাকে বাইরে রাখে সেটাই বাইরের লুপ, primary key দিয়ে সরাসরি খোঁজে", async () => {
        const t = await traceOf("SELECT c.name, d.name FROM districts d JOIN customers c ON d.id = c.district_id");
        expect(t.tables.map((x) => [x.alias, x.role])).toEqual([["c", "outer"], ["d", "inner"]]);
        expect(t.frames[0].note).toContain("লেখায় `d` আগে থাকলেও");
        expect(t.frames[1].src[1].filter((s) => s === "hit").length).toBe(1);
        expect(t.frames[1].src[1].filter((s) => s !== "pending" && s !== "hit").length).toBe(0);
    });
    it("JOIN: index না থাকলে অস্থায়ী index, LEFT-এ জোড়া না পেলে NULL, RIGHT-এ শেষে বাকিগুলো", async () => {
        const left = await traceOf("SELECT d.name FROM districts d LEFT JOIN customers c ON c.district_id = d.id WHERE c.id IS NULL");
        expect(left.phases).toEqual(["index", "read", "out"]);
        expect(left.frames.some((f) => f.note.includes("NULL বসিয়ে একটা row বানাল"))).toBe(true);
        const right = await traceOf("SELECT c.name FROM orders o RIGHT JOIN customers c ON c.id = o.customer_id WHERE o.id IS NULL");
        expect(right.phases).toEqual(["read", "right", "out"]);
        const inner = await traceOf("SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'paid'");
        expect(inner.frames[0].note).toContain("সাধারণ JOIN হিসেবেই চালায়");
    });
    it("যেটা এখনো আঁকা যায় না, সেখানে কারণসহ ok: false", async () => {
        expect((await runTrace(engine, "SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id")).reason).toBe("join3");
        expect((await runTrace(engine, "SELECT name FROM products WHERE price > (SELECT avg(price) FROM products)")).reason).toBe("subquery");
        expect((await runTrace(engine, "UPDATE products SET stock = 1")).reason).toBe("not-select");
        expect((await runTrace(engine, "SELECT max(id) FROM districts")).reason).toBe("plan");
    });
});
