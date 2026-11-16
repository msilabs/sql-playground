/**
 * JOIN কীভাবে মেলে: FROM-এর প্রথম দুই table আর তাদের JOIN বের করে, তারপর SQLite-কে
 * জিজ্ঞেস করে কোন row কোন row-এর সাথে মিলল (দুই দিকের rowid-এর জোড়া)।
 * UI দুই table পাশাপাশি বসিয়ে জোড়াগুলো লাইন টেনে দেখায়।
 */
import { query as runQuery, type Engine, type SqlValue } from "../db/types";
import { splitSelect } from "./split";
import { identName, isKeyword, isNameToken, significant, tokenize, type Token } from "./tokenize";

export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS";

export interface TableRef {
  readonly name: string;
  /** query-তে যে নামে ডাকা হয় (alias না থাকলে table-এর নাম) */
  readonly alias: string;
}

export interface ParsedJoin {
  readonly left: TableRef;
  readonly right: TableRef;
  readonly type: JoinType;
  readonly natural: boolean;
  readonly on?: string;
  readonly using?: readonly string[];
  /** FROM-এ এর বেশি table আছে */
  readonly more: boolean;
}

export interface JoinSide extends TableRef {
  readonly columns: readonly string[];
  readonly rows: readonly { readonly rid: number; readonly cells: readonly SqlValue[] }[];
  readonly total: number;
}

export interface JoinView {
  readonly join: ParsedJoin;
  readonly left: JoinSide;
  readonly right: JoinSide;
  /** [বাঁয়ের rowid, ডানের rowid]; মিল না পেলে null */
  readonly pairs: readonly (readonly [number | null, number | null])[];
  readonly pairTotal: number;
}

export const JOIN_SIDE_ROWS = 30;
const PAIR_ROWS = 3000;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** `name [AS] alias` পড়ে; table-এর জায়গায় subquery থাকলে null */
function readTable(tokens: readonly Token[], i: number): { ref: TableRef; next: number } | null {
  const first = tokens[i];
  if (!first || !isNameToken(first)) return null;
  let name = identName(first);
  let j = i + 1;
  // schema.table
  if (tokens[j]?.text === "." && tokens[j + 1]) {
    name = identName(tokens[j + 1]);
    j += 2;
  }
  let alias = name;
  if (isKeyword(tokens[j], "AS") && isNameToken(tokens[j + 1])) {
    alias = identName(tokens[j + 1]);
    j += 2;
  } else if (isNameToken(tokens[j])) {
    alias = identName(tokens[j]);
    j += 1;
  }
  return { ref: { name, alias }, next: j };
}

/** depth 0-তে পরের JOIN-এর শুরু (কমা বা JOIN-এর আগের শব্দগুলো) */
function isJoinStart(tokens: readonly Token[], i: number): boolean {
  const t = tokens[i];
  return t?.text === "," || isKeyword(t, "JOIN", "NATURAL", "LEFT", "RIGHT", "FULL", "INNER", "CROSS");
}

export function parseJoin(from: string): ParsedJoin | null {
  const tokens = significant(tokenize(from));
  const left = readTable(tokens, 0);
  if (!left) return null;
  let i = left.next;
  if (i >= tokens.length) return null;

  let natural = false;
  let type: JoinType = "INNER";
  if (tokens[i].text === ",") {
    type = "CROSS";
    i++;
  } else {
    if (isKeyword(tokens[i], "NATURAL")) {
      natural = true;
      i++;
    }
    if (isKeyword(tokens[i], "LEFT", "RIGHT", "FULL")) {
      type = tokens[i].upper as JoinType;
      i++;
      if (isKeyword(tokens[i], "OUTER")) i++;
    } else if (isKeyword(tokens[i], "INNER")) i++;
    else if (isKeyword(tokens[i], "CROSS")) {
      type = "CROSS";
      i++;
    }
    if (!isKeyword(tokens[i], "JOIN")) return null;
    i++;
  }

  const right = readTable(tokens, i);
  if (!right) return null;
  i = right.next;

  let on: string | undefined;
  let using: string[] | undefined;
  if (isKeyword(tokens[i], "ON")) {
    const start = tokens[i + 1]?.start ?? from.length;
    let depth = 0;
    let j = i + 1;
    for (; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.text === "(") depth++;
      else if (t.text === ")") depth--;
      else if (depth === 0 && isJoinStart(tokens, j)) break;
    }
    on = from.slice(start, tokens[j]?.start ?? from.length).trim();
    i = j;
  } else if (isKeyword(tokens[i], "USING") && tokens[i + 1]?.text === "(") {
    using = [];
    let j = i + 2;
    for (; j < tokens.length && tokens[j].text !== ")"; j++) {
      if (isNameToken(tokens[j])) using.push(identName(tokens[j]));
    }
    i = j + 1;
  }
  if (type === "CROSS" && on) type = "INNER";

  return { left: left.ref, right: right.ref, type, natural, on, using, more: i < tokens.length };
}

/** SELECT statement-এ JOIN থাকলে তার ছবি বানানোর ডেটা; না থাকলে null */
export async function buildJoinView(engine: Engine, statement: string): Promise<JoinView | null> {
  const split = splitSelect(statement);
  if (!split.ok || !split.query.from) return null;
  const join = parseJoin(split.query.from);
  if (!join) return null;
  const W = split.query.with ? `${split.query.with} ` : "";

  const ref = (t: TableRef) => (t.alias === t.name ? quote(t.name) : `${quote(t.name)} AS ${quote(t.alias)}`);
  const op = `${join.natural ? "NATURAL " : ""}${join.type === "INNER" ? "" : `${join.type} `}JOIN`;
  const condition = join.on ? ` ON ${join.on}` : join.using ? ` USING (${join.using.map(quote).join(", ")})` : "";

  try {
    const pairs = await runQuery(
      engine,
      `${W}SELECT ${quote(join.left.alias)}.rowid, ${quote(join.right.alias)}.rowid FROM ${ref(join.left)} ${op} ${ref(join.right)}${condition}`,
      { maxRows: PAIR_ROWS },
    );
    const side = async (t: TableRef): Promise<JoinSide> => {
      const r = await runQuery(engine, `${W}SELECT rowid, * FROM ${quote(t.name)}`, { maxRows: JOIN_SIDE_ROWS });
      return {
        ...t,
        columns: r.columns.slice(1),
        rows: r.rows.map((row) => ({ rid: Number(row[0]), cells: row.slice(1) })),
        total: r.total,
      };
    };
    const left = await side(join.left);
    const right = await side(join.right);
    return {
      join,
      left,
      right,
      pairs: pairs.rows.map((row) => [row[0] === null ? null : Number(row[0]), row[1] === null ? null : Number(row[1])] as const),
      pairTotal: pairs.total,
    };
  } catch {
    // view, subquery বা rowid নেই এমন table: ছবি দেখানো যায় না
    return null;
  }
}

/**
 * প্রতিটা দিকে কোন column-গুলো দেখাবে: JOIN-এর শর্তে যেগুলো আছে, সাথে নাম বোঝার মতো একটা column।
 * সব column দেখালে লাইন টানার জায়গা থাকে না।
 */
export function displayColumns(side: JoinSide, join: ParsedJoin, maxColumns = 3): number[] {
  const lower = side.columns.map((c) => c.toLowerCase());
  const picked = new Set<number>();
  const mention = (name: string) => {
    const i = lower.indexOf(name.toLowerCase());
    if (i !== -1) picked.add(i);
  };
  if (join.on) {
    const tokens = significant(tokenize(join.on));
    tokens.forEach((t, i) => {
      if (!isNameToken(t)) return;
      const qualifier = tokens[i - 1]?.text === "." ? tokens[i - 2] : undefined;
      if (qualifier && isNameToken(qualifier)) {
        if (identName(qualifier).toLowerCase() === side.alias.toLowerCase()) mention(identName(t));
      } else if (tokens[i + 1]?.text !== ".") mention(identName(t));
    });
  }
  join.using?.forEach(mention);
  if (join.natural) {
    lower.forEach((_, i) => picked.add(i));
  }
  const nameCol = lower.findIndex((c) => c === "name" || c === "title");
  if (nameCol !== -1) picked.add(nameCol);
  for (let i = 0; picked.size < 2 && i < lower.length; i++) picked.add(i);
  return [...picked].sort((a, b) => a - b).slice(0, maxColumns);
}
