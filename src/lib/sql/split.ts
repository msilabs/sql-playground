/**
 * একটা SELECT statement-কে clause-এ ভাগ করে (visualizer-এর জন্য)। পুরো parser নয়:
 * শুধু বন্ধনীর বাইরের (depth 0) keyword দেখে কোথায় কোন clause শুরু, তা বের করে।
 * প্রতিটা clause-এর লেখা মূল query থেকে হুবহু কেটে নেওয়া হয়, তাই আবার SQLite-এ চালানো যায়।
 */
import { identName, isKeyword, isNameToken, significant, tokenize, type Token } from "./tokenize";

export interface SelectItem {
  /** পুরো লেখা, যেমন `count(*) AS total` */
  readonly text: string;
  /** alias বাদে, যেমন `count(*)` */
  readonly expr: string;
  readonly alias?: string;
}

export interface ParsedSelect {
  /** `WITH …` অংশ (মূল SELECT-এর আগে পর্যন্ত), না থাকলে "" */
  readonly with: string;
  readonly distinct: boolean;
  readonly select: string;
  readonly items: readonly SelectItem[];
  readonly from?: string;
  readonly where?: string;
  readonly groupBy?: string;
  readonly having?: string;
  readonly orderBy?: string;
  /** LIMIT-এর পরের লেখা (OFFSET সহ) */
  readonly limit?: string;
  /** SELECT বা HAVING-এ COUNT/SUM/… আছে */
  readonly hasAggregate: boolean;
  readonly hasWindow: boolean;
}

export type SplitFailure = "not-select" | "compound" | "window-clause" | "empty";

export type SplitResult = { readonly ok: true; readonly query: ParsedSelect } | { readonly ok: false; readonly reason: SplitFailure };

export const AGGREGATES: ReadonlySet<string> = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "TOTAL", "GROUP_CONCAT", "STRING_AGG"]);

type ClauseKey = "from" | "where" | "groupBy" | "having" | "window" | "orderBy" | "limit";

/** depth 0-তে clause-এর শুরু চেনা: কোন keyword, আর clause-এর লেখা কোন token থেকে শুরু */
function clauseAt(tokens: readonly Token[], i: number): { key: ClauseKey; bodyIndex: number } | null {
  const t = tokens[i];
  if (t.type !== "keyword") return null;
  const by = isKeyword(tokens[i + 1], "BY");
  switch (t.upper) {
    case "FROM":
      return { key: "from", bodyIndex: i + 1 };
    case "WHERE":
      return { key: "where", bodyIndex: i + 1 };
    case "GROUP":
      return by ? { key: "groupBy", bodyIndex: i + 2 } : null;
    case "HAVING":
      return { key: "having", bodyIndex: i + 1 };
    case "WINDOW":
      return { key: "window", bodyIndex: i + 1 };
    case "ORDER":
      return by ? { key: "orderBy", bodyIndex: i + 2 } : null;
    case "LIMIT":
      return { key: "limit", bodyIndex: i + 1 };
    default:
      return null;
  }
}

/** depth 0-র কমা দিয়ে ভাগ */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (const t of tokenize(text)) {
    if (t.text === "(") depth++;
    else if (t.text === ")") depth--;
    else if (t.text === "," && t.type === "punct" && depth === 0) {
      parts.push(text.slice(start, t.start).trim());
      start = t.end;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((p) => p.length > 0);
}

function parseItem(text: string): SelectItem {
  const tokens = significant(tokenize(text));
  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];
  if (tokens.length >= 3 && isNameToken(last) && isKeyword(prev, "AS")) {
    return { text, expr: text.slice(0, prev.start).trim(), alias: identName(last) };
  }
  // AS ছাড়া alias: `price p`, `count(*) total`
  const prevAllows =
    prev !== undefined &&
    prev.type !== "op" &&
    !(prev.type === "punct" && prev.text !== ")") &&
    !(prev.type === "keyword" && prev.upper !== "END");
  if (tokens.length >= 2 && isNameToken(last) && prevAllows) {
    return { text, expr: text.slice(0, last.start).trim(), alias: identName(last) };
  }
  return { text, expr: text };
}

const hasAggregateCall = (tokens: readonly Token[]) =>
  tokens.some((t, i) => t.type === "ident" && AGGREGATES.has(t.upper) && tokens[i + 1]?.text === "(");

export function splitSelect(statement: string): SplitResult {
  const sql = statement.trim().replace(/;\s*$/, "");
  const tokens = significant(tokenize(sql));
  if (tokens.length === 0) return { ok: false, reason: "empty" };

  // WITH থাকলে মূল SELECT কোথায়
  let selectIndex = 0;
  if (isKeyword(tokens[0], "WITH")) {
    let depth = 0;
    selectIndex = -1;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.text === "(") depth++;
      else if (t.text === ")") depth--;
      else if (depth === 0 && isKeyword(t, "SELECT")) {
        selectIndex = i;
        break;
      } else if (depth === 0 && isKeyword(t, "INSERT", "UPDATE", "DELETE", "REPLACE", "VALUES")) break;
    }
    if (selectIndex === -1) return { ok: false, reason: "not-select" };
  }
  if (!isKeyword(tokens[selectIndex], "SELECT")) return { ok: false, reason: "not-select" };

  let bodyStart = selectIndex + 1;
  let distinct = false;
  if (isKeyword(tokens[bodyStart], "DISTINCT", "ALL")) {
    distinct = tokens[bodyStart].upper === "DISTINCT";
    bodyStart++;
  }

  const marks: { key: ClauseKey; keywordStart: number; bodyStart: number }[] = [];
  let depth = 0;
  for (let i = bodyStart; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === "(") depth++;
    else if (t.text === ")") depth--;
    else if (depth === 0) {
      if (isKeyword(t, "UNION", "INTERSECT", "EXCEPT")) return { ok: false, reason: "compound" };
      const clause = clauseAt(tokens, i);
      if (clause) {
        const body = tokens[clause.bodyIndex];
        marks.push({ key: clause.key, keywordStart: t.start, bodyStart: body ? body.start : sql.length });
      }
    }
  }
  if (marks.some((m) => m.key === "window")) return { ok: false, reason: "window-clause" };

  const selectEnd = marks[0]?.keywordStart ?? sql.length;
  const selectText = tokens[bodyStart] ? sql.slice(tokens[bodyStart].start, selectEnd).trim() : "";
  const clauses: Partial<Record<ClauseKey, string>> = {};
  marks.forEach((m, i) => {
    const end = marks[i + 1]?.keywordStart ?? sql.length;
    clauses[m.key] = sql.slice(m.bodyStart, end).trim();
  });

  const selectTokens = significant(tokenize(selectText));
  const havingTokens = significant(tokenize(clauses.having ?? ""));
  return {
    ok: true,
    query: {
      with: selectIndex > 0 ? sql.slice(0, tokens[selectIndex].start).trim() : "",
      distinct,
      select: selectText,
      items: splitTopLevel(selectText).map(parseItem),
      from: clauses.from,
      where: clauses.where,
      groupBy: clauses.groupBy,
      having: clauses.having,
      orderBy: clauses.orderBy,
      limit: clauses.limit,
      hasAggregate: hasAggregateCall(selectTokens) || hasAggregateCall(havingTokens),
      hasWindow: selectTokens.some((t) => isKeyword(t, "OVER")),
    },
  };
}

/**
 * `GROUP BY 1`-এর মতো সংখ্যাকে SELECT-এর সেই column-এর expression দিয়ে বদলায়
 * (SQLite-এর নিয়মও তাই)। ফেরত দেয় প্রতিটা term আলাদা করে।
 */
export function groupTerms(query: ParsedSelect): string[] {
  if (!query.groupBy) return [];
  return splitTopLevel(query.groupBy).map((term) => {
    if (/^\d+$/.test(term)) {
      const item = query.items[Number(term) - 1];
      if (item && item.expr !== "*") return item.expr;
    }
    return term;
  });
}

/**
 * SELECT-এর alias-কে তার expression দিয়ে বদলায় (`HAVING total > 5` → `HAVING (count(*)) > 5`)।
 * SQLite নিজে কিছু জায়গায় alias বোঝে, কিন্তু ধাপের query-তে SELECT অংশ থাকে না, তাই এটা লাগে।
 */
export function resolveAliases(text: string, items: readonly SelectItem[]): string {
  const aliases = new Map(items.filter((i) => i.alias).map((i) => [i.alias!.toLowerCase(), i.expr]));
  if (aliases.size === 0) return text;
  const tokens = tokenize(text);
  let out = "";
  tokens.forEach((t, i) => {
    const prevSig = tokens.slice(0, i).reverse().find((p) => p.type !== "ws" && p.type !== "comment");
    const nextSig = tokens.slice(i + 1).find((p) => p.type !== "ws" && p.type !== "comment");
    const expr = isNameToken(t) ? aliases.get(identName(t).toLowerCase()) : undefined;
    const qualified = prevSig?.text === "." || nextSig?.text === "." || nextSig?.text === "(";
    out += expr && !qualified ? `(${expr})` : t.text;
  });
  return out;
}
