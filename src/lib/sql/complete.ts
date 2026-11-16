/** Editor-এর autocomplete: কার্সরের আগের শব্দ দেখে keyword, table বা column-এর পরামর্শ */
import type { SchemaInfo } from "../db/schema";
import { identName, isKeyword, isNameToken, significant, splitStatements, tokenize } from "./tokenize";

export type SuggestionKind = "keyword" | "table" | "column" | "function";

export interface Suggestion {
  readonly label: string;
  readonly kind: SuggestionKind;
  /** column হলে কোন table-এর */
  readonly detail?: string;
}

export interface Completion {
  /** কোন অংশ বদলাবে: [from, to) */
  readonly from: number;
  readonly to: number;
  readonly items: readonly Suggestion[];
}

const KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS NULL", "IS NOT NULL", "GROUP BY",
  "ORDER BY", "HAVING", "LIMIT", "OFFSET", "JOIN", "LEFT JOIN", "INNER JOIN", "ON", "AS", "DISTINCT", "ASC", "DESC",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE", "CREATE INDEX", "CREATE VIEW", "DROP TABLE",
  "ALTER TABLE", "CASE", "WHEN", "THEN", "ELSE", "END", "EXISTS", "UNION", "UNION ALL", "WITH", "BEGIN", "COMMIT",
  "ROLLBACK", "NULL", "PRIMARY KEY", "INTEGER", "TEXT", "REAL", "EXPLAIN QUERY PLAN",
];

const FUNCTIONS = [
  "COUNT", "SUM", "AVG", "MIN", "MAX", "ROUND", "LENGTH", "UPPER", "LOWER", "SUBSTR", "TRIM", "REPLACE", "COALESCE",
  "IFNULL", "IIF", "ABS", "CAST", "DATE", "STRFTIME", "JULIANDAY", "GROUP_CONCAT", "ROW_NUMBER", "RANK",
];

const TABLE_CONTEXT = new Set(["FROM", "JOIN", "INTO", "UPDATE", "TABLE"]);
const MAX_ITEMS = 8;

const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

/** এই statement-এ কোন alias কোন table-কে বোঝায় (`orders o` → o: orders) */
export function aliasMap(statement: string, schema: SchemaInfo): Map<string, string> {
  const tables = new Map(schema.tables.map((t) => [t.name.toLowerCase(), t.name]));
  const map = new Map<string, string>();
  const tokens = significant(tokenize(statement));
  tokens.forEach((t, i) => {
    if (!isNameToken(t)) return;
    const table = tables.get(identName(t).toLowerCase());
    if (!table) return;
    map.set(table.toLowerCase(), table);
    let next = tokens[i + 1];
    if (isKeyword(next, "AS")) next = tokens[i + 2];
    if (next && isNameToken(next)) map.set(identName(next).toLowerCase(), table);
  });
  return map;
}

export function complete(text: string, cursor: number, schema: SchemaInfo): Completion | null {
  let from = cursor;
  while (from > 0 && isWordChar(text[from - 1])) from--;
  const prefix = text.slice(from, cursor).toLowerCase();
  const afterDot = text[from - 1] === ".";

  const statement =
    splitStatements(text).find((s) => s.start <= cursor && cursor <= s.end + 1)?.text ?? text;
  const aliases = aliasMap(statement, schema);
  const tableOf = (name: string) => schema.tables.find((t) => t.name === name);
  const match = (label: string) => label.toLowerCase().startsWith(prefix) && label.toLowerCase() !== prefix;

  let items: Suggestion[] = [];
  if (afterDot) {
    let q = from - 1;
    while (q > 0 && isWordChar(text[q - 1])) q--;
    const table = aliases.get(text.slice(q, from - 1).toLowerCase());
    const info = table ? tableOf(table) : undefined;
    if (!info) return null;
    items = info.columns.filter((c) => match(c.name)).map((c) => ({ label: c.name, kind: "column" as const, detail: info.name }));
  } else {
    if (prefix.length === 0) return null;
    const before = significant(tokenize(text.slice(0, from))).pop();
    const onlyTables = before !== undefined && before.type === "keyword" && TABLE_CONTEXT.has(before.upper);
    const tables = schema.tables.filter((t) => match(t.name)).map((t) => ({ label: t.name, kind: "table" as const }));
    if (onlyTables) items = tables;
    else {
      const used = new Set(aliases.values());
      const seen = new Set<string>();
      const columns: Suggestion[] = [];
      // এই query-র table-গুলোর column আগে
      for (const t of [...schema.tables].sort((a, b) => Number(used.has(b.name)) - Number(used.has(a.name)))) {
        for (const c of t.columns) {
          if (match(c.name) && !seen.has(c.name)) {
            seen.add(c.name);
            columns.push({ label: c.name, kind: "column", detail: t.name });
          }
        }
      }
      const keywords = KEYWORDS.filter(match).map((k) => ({ label: k, kind: "keyword" as const }));
      const functions = FUNCTIONS.filter(match).map((f) => ({ label: f, kind: "function" as const }));
      items = [...columns, ...tables, ...keywords, ...functions];
    }
  }
  if (items.length === 0) return null;
  return { from, to: cursor, items: items.slice(0, MAX_ITEMS) };
}

/** পরামর্শ বসানোর পর নতুন লেখা আর কার্সর কোথায় */
export function applySuggestion(text: string, completion: Completion, item: Suggestion): { text: string; cursor: number } {
  const insert = item.kind === "function" ? `${item.label}(` : item.label;
  return {
    text: text.slice(0, completion.from) + insert + text.slice(completion.to),
    cursor: completion.from + insert.length,
  };
}
