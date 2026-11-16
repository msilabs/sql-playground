import { describe, expect, it } from "vitest";
import { DOKAN_SQL } from "@/lib/db/datasets/dokan";
import { loadSchema } from "@/lib/db/schema";
import { closest, friendlyError } from "@/lib/sql/errors";
import { engineWith } from "./engine";

const engine = await engineWith(DOKAN_SQL);
const schema = await loadSchema(engine);

const errorOf = async (sql: string) => {
  const r = await engine.run(sql);
  expect(r.error).toBeDefined();
  return friendlyError(r.error!.message, schema);
};

describe("friendlyError", () => {
  it("table-এর বানান ভুল", async () => {
    const e = await errorOf("SELECT * FROM prodcts");
    expect(e.title).toContain("prodcts");
    expect(e.hint).toContain("products");
  });

  it("column-এর বানান ভুল", async () => {
    const e = await errorOf("SELECT custmer_id FROM orders");
    expect(e.hint).toContain("customer_id");
  });

  it("keyword-এর বানান ভুল", async () => {
    const e = await errorOf("SELCT * FROM products");
    expect(e.hint).toContain("SELECT");
  });

  it("WHERE-এ aggregate", async () => {
    const e = await errorOf("SELECT category FROM products WHERE count(*) > 2 GROUP BY category");
    expect(e.title).toContain("aggregate");
  });

  it("একই column দুই table-এ", async () => {
    const e = await errorOf("SELECT id FROM orders JOIN customers ON customer_id = customers.id");
    expect(e.hint).toContain("orders.id");
  });

  it("closest দূরের শব্দ দেয় না", () => {
    expect(closest("zzzzzz", ["products"])).toBeUndefined();
  });
});

describe("schema", () => {
  it("table, column, row সংখ্যা আর foreign key", () => {
    const orders = schema.tables.find((t) => t.name === "orders")!;
    expect(orders.rowCount).toBe(60);
    expect(orders.columns.find((c) => c.name === "customer_id")!.ref).toEqual({ table: "customers", column: "id" });
    expect(schema.tables.map((t) => t.name)).toEqual(["districts", "customers", "products", "orders", "order_items"]);
  });
});
