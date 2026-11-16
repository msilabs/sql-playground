import { describe, expect, it } from "vitest";
import { isReadOnly, splitStatements, statementKind, tokenize } from "@/lib/sql/tokenize";

describe("tokenize", () => {
  it("চেনে keyword, string, number, comment আর বাংলা লেখা", () => {
    const types = tokenize("SELECT name, 'ঢাকা''র' -- মন্তব্য\nFROM t WHERE x >= 1.5")
      .filter((t) => t.type !== "ws")
      .map((t) => t.type);
    expect(types).toEqual(["keyword", "ident", "punct", "string", "comment", "keyword", "ident", "keyword", "ident", "op", "number"]);
  });

  it("বাংলা identifier", () => {
    expect(tokenize("নাম")[0].type).toBe("ident");
  });
});

describe("splitStatements", () => {
  it("string আর comment-এর ভেতরের ; এ ভাগ করে না", () => {
    const parts = splitStatements("SELECT ';'; /* ; */ SELECT 2;; ");
    expect(parts.map((p) => p.text)).toEqual(["SELECT ';';", "/* ; */ SELECT 2;"]);
  });

  it("trigger-এর BEGIN … END একসাথে রাখে", () => {
    const sql = "CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE b SET x = 1; END; SELECT 1";
    expect(splitStatements(sql)).toHaveLength(2);
  });
});

describe("statementKind / isReadOnly", () => {
  it("WITH-এর পরের মূল কাজ দেখে", () => {
    expect(statementKind("WITH x AS (SELECT 1) SELECT * FROM x")).toBe("select");
    expect(statementKind("WITH x AS (SELECT 1) DELETE FROM t WHERE id IN x")).toBe("delete");
  });

  it("PRAGMA-তে = থাকলে DB বদলায়", () => {
    expect(isReadOnly("PRAGMA table_info(products)")).toBe(true);
    expect(isReadOnly("PRAGMA foreign_keys = OFF")).toBe(false);
    expect(isReadOnly("select 1")).toBe(true);
    expect(isReadOnly("insert into t values (1)")).toBe(false);
  });
});
