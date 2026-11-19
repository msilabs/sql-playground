import { describe, it } from 'node:test';
import { expect, engineWith, Db, Complete, Explain } from './helpers.mjs';

const { loadSchema } = Db;
const { applySuggestion, complete } = Complete;
const { explainStatement } = Explain;
const engine = await engineWith('dokan');
const schema = await loadSchema(engine);
describe("complete", () => {
    it("FROM-এর পরে শুধু table", () => {
        const text = "SELECT * FROM pro";
        const c = complete(text, text.length, schema);
        expect(c.items.map((i) => i.label)).toEqual(["products"]);
        expect(applySuggestion(text, c, c.items[0]).text).toBe("SELECT * FROM products");
    });
    it("alias-এর পরে . দিলে সেই table-এর column", () => {
        const text = "SELECT o. FROM orders o";
        const c = complete(text, "SELECT o.".length, schema);
        expect(c.items.map((i) => i.label)).toEqual(["id", "customer_id", "order_date", "status", "payment"]);
    });
    it("keyword আর ফাংশন", () => {
        const text = "SELECT cou";
        const c = complete(text, text.length, schema);
        expect(c.items.map((i) => i.label)).toContain("COUNT");
        const fn = c.items.find((i) => i.label === "COUNT");
        expect(applySuggestion(text, c, fn).text).toBe("SELECT COUNT(");
    });
    it("ফাঁকা শব্দে কিছু দেখায় না", () => {
        expect(complete("SELECT ", 7, schema)).toBeNull();
    });
});
describe("explainStatement", () => {
    it("SELECT-এর ধাপগুলো চলার ক্রমে", async () => {
        const sql = "SELECT category, count(*) AS n FROM products WHERE price > 300 GROUP BY category ORDER BY n DESC LIMIT 2";
        const r = (await engine.run(sql)).statements[0];
        const e = explainStatement(sql, r);
        expect(e.steps.map((s) => s.split(":")[0])).toEqual(["FROM", "WHERE", "GROUP BY", "SELECT", "ORDER BY", "LIMIT"]);
        expect(e.summary).toBe("ফল: ২টা row।");
    });
    it("WHERE ছাড়া UPDATE-এ সতর্কবার্তা", async () => {
        const e2 = await engineWith('dokan');
        const r = (await e2.run("UPDATE products SET stock = 0")).statements[0];
        const e = explainStatement(r.sql, r);
        expect(e.summary).toContain("২০টা row বদলানো হলো");
        expect(e.warning).toContain("WHERE নেই");
    });
});
