import { describe, it } from 'node:test';
import { expect, engineWith, Join } from './helpers.mjs';

const { buildJoinView, displayColumns, parseJoin } = Join;
const engine = await engineWith('dokan');
describe("parseJoin", () => {
    it("alias, ধরন আর শর্ত", () => {
        expect(parseJoin("customers c LEFT OUTER JOIN orders AS o ON o.customer_id = c.id WHERE x")).toBeTruthy();
        const j = parseJoin("customers c LEFT JOIN orders AS o ON o.customer_id = c.id JOIN products p ON 1");
        expect(j.left).toEqual({ name: "customers", alias: "c" });
        expect(j.right).toEqual({ name: "orders", alias: "o" });
        expect(j.type).toBe("LEFT");
        expect(j.on).toBe("o.customer_id = c.id");
        expect(j.more).toBe(true);
    });
    it("কমা আর USING", () => {
        expect(parseJoin("a, b").type).toBe("CROSS");
        expect(parseJoin("a JOIN b USING (id, x)").using).toEqual(["id", "x"]);
        expect(parseJoin("products")).toBeNull();
        expect(parseJoin("(SELECT 1) x JOIN b ON 1")).toBeNull();
    });
});
describe("buildJoinView", () => {
    it("LEFT JOIN-এ মিল না পাওয়া গ্রাহকের জোড়া null", async () => {
        const view = await buildJoinView(engine, "SELECT * FROM customers c LEFT JOIN orders o ON o.customer_id = c.id");
        expect(view).not.toBeNull();
        const unmatched = view.pairs.filter(([, r]) => r === null).map(([l]) => l);
        for (const id of [26, 27, 28, 29, 30]) expect(unmatched).toContain(id);
        expect(view.left.rows.length).toBe(30);
        const cols = displayColumns(view.left, view.join).map((i) => view.left.columns[i]);
        expect(cols).toEqual(["id", "name"]);
        const rightCols = displayColumns(view.right, view.join).map((i) => view.right.columns[i]);
        expect(rightCols).toContain("customer_id");
    });
    it("JOIN না থাকলে null", async () => {
        expect(await buildJoinView(engine, "SELECT * FROM products")).toBeNull();
    });
});
