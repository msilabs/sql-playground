/** DB-তে কী কী table আর column আছে (schema প্যানেল, autocomplete আর ভুলের ইঙ্গিতের জন্য) */
import { query, type Engine } from "./types";

export interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly pk: boolean;
  readonly notNull: boolean;
  /** foreign key: কোন table-এর কোন column-কে নির্দেশ করে */
  readonly ref?: { readonly table: string; readonly column: string };
}

export interface TableInfo {
  readonly name: string;
  readonly kind: "table" | "view";
  readonly rowCount: number | null;
  readonly columns: readonly ColumnInfo[];
}

export interface SchemaInfo {
  readonly tables: readonly TableInfo[];
}

export const EMPTY_SCHEMA: SchemaInfo = { tables: [] };

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;

export async function loadSchema(engine: Engine): Promise<SchemaInfo> {
  const cols = await query(
    engine,
    `SELECT m.name, m.type, p.name, p.type, p.pk, p."notnull"
     FROM sqlite_schema m JOIN pragma_table_info(m.name) p
     WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%'
     ORDER BY m.rowid, p.cid`,
    { maxRows: 5000 },
  );
  const fks = await query(
    engine,
    `SELECT m.name, f."from", f."table", f."to"
     FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`,
    { maxRows: 5000 },
  );
  const refs = new Map<string, { table: string; column: string }>();
  for (const [table, from, target, to] of fks.rows) {
    refs.set(`${table}.${from}`, { table: String(target), column: to === null ? "id" : String(to) });
  }

  const tables = new Map<string, { kind: "table" | "view"; columns: ColumnInfo[] }>();
  for (const [table, kind, name, type, pk, notNull] of cols.rows) {
    const key = String(table);
    if (!tables.has(key)) tables.set(key, { kind: kind === "view" ? "view" : "table", columns: [] });
    tables.get(key)!.columns.push({
      name: String(name),
      type: String(type ?? ""),
      pk: Number(pk) > 0,
      notNull: Number(notNull) === 1,
      ref: refs.get(`${key}.${name}`),
    });
  }

  const names = [...tables.keys()];
  const counts = new Map<string, number>();
  if (names.length > 0) {
    try {
      const r = await query(
        engine,
        names.map((n) => `SELECT ${literal(n)}, count(*) FROM ${quote(n)}`).join(" UNION ALL "),
        { maxRows: names.length },
      );
      for (const [name, n] of r.rows) counts.set(String(name), Number(n));
    } catch {
      // কোনো view ভাঙা থাকলে গোনা বাদ
    }
  }

  return {
    tables: names.map((name) => ({
      name,
      kind: tables.get(name)!.kind,
      rowCount: counts.get(name) ?? null,
      columns: tables.get(name)!.columns,
    })),
  };
}

export const allColumns = (schema: SchemaInfo): string[] => [
  ...new Set(schema.tables.flatMap((t) => t.columns.map((c) => c.name))),
];
