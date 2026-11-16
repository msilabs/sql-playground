import { describe, expect, it } from "vitest";
import { groupTerms, resolveAliases, splitSelect } from "@/lib/sql/split";

const parse = (sql: string) => {
  const r = splitSelect(sql);
  if (!r.ok) throw new Error(r.reason);
  return r.query;
};

describe("splitSelect", () => {
  it("সব clause আলাদা করে", () => {
    const q = parse(
      "SELECT DISTINCT c.name, count(*) AS n FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = 'paid' GROUP BY c.id HAVING n > 2 ORDER BY n DESC LIMIT 5;",
    );
    expect(q.distinct).toBe(true);
    expect(q.select).toBe("c.name, count(*) AS n");
    expect(q.items.map((i) => i.alias)).toEqual([undefined, "n"]);
    expect(q.from).toBe("customers c JOIN orders o ON o.customer_id = c.id");
    expect(q.where).toBe("o.status = 'paid'");
    expect(q.groupBy).toBe("c.id");
    expect(q.having).toBe("n > 2");
    expect(q.orderBy).toBe("n DESC");
    expect(q.limit).toBe("5");
    expect(q.hasAggregate).toBe(true);
  });

  it("subquery-র ভেতরের WHERE/FROM-এ বিভ্রান্ত হয় না", () => {
    const q = parse("SELECT name FROM products WHERE price > (SELECT avg(price) FROM products WHERE stock > 0)");
    expect(q.from).toBe("products");
    expect(q.where).toBe("price > (SELECT avg(price) FROM products WHERE stock > 0)");
    expect(q.hasAggregate).toBe(false);
  });

  it("WITH অংশ আলাদা রাখে", () => {
    const q = parse("WITH big AS (SELECT * FROM products WHERE price > 1000) SELECT name FROM big");
    expect(q.with).toBe("WITH big AS (SELECT * FROM products WHERE price > 1000)");
    expect(q.from).toBe("big");
  });

  it("AS ছাড়া alias", () => {
    const q = parse("SELECT price p, count(*) total, a.b FROM t");
    expect(q.items.map((i) => i.alias)).toEqual(["p", "total", undefined]);
  });

  it("UNION আর DB বদলানো query সামলায় না", () => {
    expect(splitSelect("SELECT 1 UNION SELECT 2")).toEqual({ ok: false, reason: "compound" });
    expect(splitSelect("DELETE FROM t")).toEqual({ ok: false, reason: "not-select" });
  });

  it("GROUP BY-এর সংখ্যা আর alias বদলায়", () => {
    const q = parse("SELECT category AS cat, count(*) AS n FROM products GROUP BY 1 HAVING n > 3");
    expect(groupTerms(q)).toEqual(["category"]);
    expect(resolveAliases("n > 3 AND t.n = 1", q.items)).toBe("(count(*)) > 3 AND t.n = 1");
  });
});
