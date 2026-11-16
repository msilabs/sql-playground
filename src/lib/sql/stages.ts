/**
 * Query ধাপে ধাপে: SQLite আসলে যে ক্রমে কাজ করে (FROM → WHERE → GROUP BY → HAVING → SELECT →
 * ORDER BY → LIMIT), প্রতিটা ধাপের পরে table দেখতে কেমন, তা বের করে।
 *
 * নিজে কোনো SQL হিসাব করে না: প্রতিটা ধাপের জন্য মূল query-র টুকরো জুড়ে ছোট একটা SELECT বানায়
 * আর আসল SQLite-এ চালায়। WHERE আর HAVING-এর শর্ত একটা বাড়তি column হিসেবে হিসাব হয়
 * (`CASE WHEN … THEN 1 ELSE 0 END`), তাই কোন row টিকল আর কোনটা বাদ গেল দুটোই দেখানো যায়।
 */
import { bn } from "../bn";
import { query as runQuery, type Engine, type SqlValue, type StatementResult } from "../db/types";
import { groupTerms, resolveAliases, splitSelect, splitTopLevel, type ParsedSelect, type SplitFailure } from "./split";
import { isKeyword, significant, tokenize } from "./tokenize";

export type StageKey = "from" | "where" | "group" | "having" | "select" | "order" | "limit";

export interface Stage {
  readonly key: StageKey;
  /** যেমন `WHERE` */
  readonly label: string;
  /** বাংলায় এক কথায় কী হয় */
  readonly title: string;
  /** query-র কোন অংশ */
  readonly clause: string;
  readonly note: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlValue[])[];
  readonly total: number;
  readonly capped: boolean;
  /** WHERE/HAVING: প্রতিটা দেখানো row টিকল কি না */
  readonly marks?: readonly boolean[];
  /** GROUP BY: প্রতিটা দেখানো row কোন দলে (০ থেকে) */
  readonly groups?: readonly number[];
  /** এই ধাপের query চালাতে ভুল হলে */
  readonly error?: string;
}

export type StagesResult =
  | { readonly ok: true; readonly stages: readonly Stage[]; readonly written: readonly string[] }
  | { readonly ok: false; readonly reason: SplitFailure; readonly message: string };

export const STAGE_ROWS = 200;

const TITLES: Record<StageKey, [string, string]> = {
  from: ["FROM", "table থেকে row আনা"],
  where: ["WHERE", "শর্ত দিয়ে row ছাঁকা"],
  group: ["GROUP BY", "row-গুলো দলে ভাগ করা"],
  having: ["HAVING", "দল ছাঁকা"],
  select: ["SELECT", "column বাছাই আর হিসাব"],
  order: ["ORDER BY", "সাজানো"],
  limit: ["LIMIT", "কয়টা row থাকবে"],
};

const FAILURE_TEXT: Record<SplitFailure, string> = {
  "not-select": "ধাপে ধাপে দেখা যায় শুধু SELECT query-র। এটা DB বদলানোর query, তাই ফলটাই দেখুন।",
  compound: "UNION, INTERSECT বা EXCEPT দিয়ে জোড়া query-র ধাপ এখনো দেখানো যায় না। ফল ঠিকই এসেছে।",
  "window-clause": "WINDOW clause থাকা query-র ধাপ এখনো দেখানো যায় না। ফল ঠিকই এসেছে।",
  empty: "চালানোর মতো কোনো query নেই।",
};

const JOIN_WORDS = ["JOIN"];

interface Attempt {
  readonly result?: StatementResult;
  readonly error?: string;
}

export async function runStages(engine: Engine, statement: string): Promise<StagesResult> {
  const split = splitSelect(statement);
  if (!split.ok) return { ok: false, reason: split.reason, message: FAILURE_TEXT[split.reason] };
  const q = split.query;
  const W = q.with ? `${q.with} ` : "";

  /** চালায়; "no such column" হলে alias বদলে আরেকবার চেষ্টা করে */
  const attempt = async (build: (fix: (s: string) => string) => string, rows = STAGE_ROWS): Promise<Attempt> => {
    try {
      return { result: await runQuery(engine, W + build((s) => s), { maxRows: rows }) };
    } catch (first) {
      const message = first instanceof Error ? first.message : String(first);
      if (!message.includes("no such column")) return { error: message };
      try {
        return { result: await runQuery(engine, W + build((s) => resolveAliases(s, q.items)), { maxRows: rows }) };
      } catch {
        return { error: message };
      }
    }
  };
  const count = async (build: (fix: (s: string) => string) => string): Promise<number | null> => {
    const a = await attempt(build, 1);
    const v = a.result?.rows[0]?.[0];
    return typeof v === "number" ? v : null;
  };

  const from = (fix: (s: string) => string) => (q.from ? ` FROM ${fix(q.from)}` : "");
  const where = (fix: (s: string) => string) => (q.where ? ` WHERE ${fix(q.where)}` : "");
  const terms = groupTerms(q);
  const group = (fix: (s: string) => string) => (terms.length ? ` GROUP BY ${terms.map(fix).join(", ")}` : "");
  const having = (fix: (s: string) => string) => (q.having ? ` HAVING ${fix(q.having)}` : "");
  const selectPart = (fix: (s: string) => string) =>
    `SELECT ${q.distinct ? "DISTINCT " : ""}${q.select}${from(fix)}${where(fix)}${group(fix)}${having(fix)}`;

  const stages: Stage[] = [];
  const base = (key: StageKey, clause: string) => ({ key, label: TITLES[key][0], title: TITLES[key][1], clause });
  const failed = (key: StageKey, clause: string, error: string): Stage => ({
    ...base(key, clause),
    note: "এই ধাপের table বানানো গেল না।",
    columns: [],
    rows: [],
    total: 0,
    capped: false,
    error,
  });

  // ১. FROM (আর JOIN)
  if (q.from) {
    const clause = `FROM ${q.from}`;
    const a = await attempt((fix) => `SELECT *${from(fix)}`);
    if (a.result) {
      const r = a.result;
      stages.push({ ...base("from", clause), note: fromNote(q, r.total, r.capped), ...table(r) });
    } else stages.push(failed("from", clause, a.error!));
  }

  // ২. WHERE: প্রতিটা row-এর পাশে শর্ত সত্য কি না
  if (q.where && q.from) {
    const clause = `WHERE ${q.where}`;
    const a = await attempt((fix) => `SELECT *, CASE WHEN (${fix(q.where!)}) THEN 1 ELSE 0 END${from(fix)}`);
    if (a.result) {
      const { columns, rows, flags } = takeLastColumn(a.result);
      let kept = flags.filter(Boolean).length;
      if (a.result.capped || a.result.total > rows.length) {
        kept = (await count((fix) => `SELECT count(*)${from(fix)}${where(fix)}`)) ?? kept;
      }
      const all = a.result.total;
      stages.push({
        ...base("where", clause),
        note: `${bn(all)}টা row-এর মধ্যে ${bn(kept)}টা শর্ত মেনেছে, তাই থাকল। বাকি ${bn(all - kept)}টা বাদ গেল।`,
        columns,
        rows,
        total: all,
        capped: a.result.capped,
        marks: flags,
      });
    } else stages.push(failed("where", clause, a.error!));
  }

  // ৩. GROUP BY: একই দলের row পাশাপাশি, দলের নম্বরসহ
  if (terms.length && q.from) {
    const clause = `GROUP BY ${q.groupBy}`;
    const keys = terms.map((_, i) => `__g${i}`);
    const a = await attempt(
      (fix) =>
        `SELECT *, ${terms.map((t, i) => `${fix(t)} AS ${keys[i]}`).join(", ")}${from(fix)}${where(fix)} ORDER BY ${keys.join(", ")}`,
    );
    if (a.result) {
      const r = a.result;
      const n = terms.length;
      const groups: number[] = [];
      let last = "";
      let id = -1;
      for (const row of r.rows) {
        const key = JSON.stringify(row.slice(-n));
        if (key !== last) {
          id++;
          last = key;
        }
        groups.push(id);
      }
      let groupCount = id + 1;
      if (r.capped || r.total > r.rows.length) {
        groupCount =
          (await count((fix) => `SELECT count(*) FROM (SELECT 1${from(fix)}${where(fix)}${group(fix)})`)) ?? groupCount;
      }
      stages.push({
        ...base("group", clause),
        note: `${bn(r.total)}টা row ${terms.map((t) => `\`${t}\``).join(" আর ")} অনুযায়ী ${bn(groupCount)}টা দলে ভাগ হলো। একই রঙের row একই দলে; প্রতিটা দল শেষে একটা row হয়ে যাবে।`,
        columns: r.columns.slice(0, -n),
        rows: r.rows.map((row) => row.slice(0, -n)),
        total: r.total,
        capped: r.capped,
        groups,
      });
    } else stages.push(failed("group", clause, a.error!));
  }

  // ৪. HAVING: প্রতিটা দলের পাশে শর্ত সত্য কি না
  if (q.having && q.from) {
    const clause = `HAVING ${q.having}`;
    const keyCols = terms.length ? `${terms.join(", ")}, ` : "";
    const a = await attempt(
      (fix) =>
        `SELECT ${keyCols}count(*) AS "row সংখ্যা", CASE WHEN (${fix(q.having!)}) THEN 1 ELSE 0 END${from(fix)}${where(fix)}${group(fix)}`,
    );
    if (a.result) {
      const { columns, rows, flags } = takeLastColumn(a.result);
      const kept = flags.filter(Boolean).length;
      stages.push({
        ...base("having", clause),
        note: `${bn(rows.length)}টা দলের মধ্যে ${bn(kept)}টা শর্ত মেনেছে। WHERE ছাঁকে row, আর HAVING ছাঁকে দল; তাই এখানে COUNT, SUM-এর মতো হিসাব ব্যবহার করা যায়।`,
        columns,
        rows,
        total: a.result.total,
        capped: a.result.capped,
        marks: flags,
      });
    } else stages.push(failed("having", clause, a.error!));
  }

  // ৫. SELECT
  {
    const clause = `SELECT ${q.distinct ? "DISTINCT " : ""}${q.select}`;
    const a = await attempt(selectPart);
    if (a.result) {
      const r = a.result;
      let note = selectNote(q, r.total);
      if (q.distinct && q.from) {
        const before = await count(
          (fix) => `SELECT count(*) FROM (SELECT ${q.select}${from(fix)}${where(fix)}${group(fix)}${having(fix)})`,
        );
        if (before !== null && before > r.total) note += ` DISTINCT একই রকম ${bn(before - r.total)}টা row বাদ দিয়েছে।`;
      }
      stages.push({ ...base("select", clause), note, ...table(r) });
    } else stages.push(failed("select", clause, a.error!));
  }

  // ৬. ORDER BY
  if (q.orderBy) {
    const clause = `ORDER BY ${q.orderBy}`;
    const a = await attempt((fix) => `${selectPart(fix)} ORDER BY ${q.orderBy}`);
    if (a.result) stages.push({ ...base("order", clause), note: orderNote(q.orderBy), ...table(a.result) });
    else stages.push(failed("order", clause, a.error!));
  }

  // ৭. LIMIT: পুরো query
  if (q.limit) {
    const clause = `LIMIT ${q.limit}`;
    const order = q.orderBy ? ` ORDER BY ${q.orderBy}` : "";
    const a = await attempt((fix) => `${selectPart(fix)}${order} LIMIT ${q.limit}`);
    if (a.result) stages.push({ ...base("limit", clause), note: limitNote(q.limit, Boolean(q.orderBy)), ...table(a.result) });
    else stages.push(failed("limit", clause, a.error!));
  }

  return { ok: true, stages, written: writtenOrder(q) };
}

function table(r: StatementResult) {
  return { columns: r.columns, rows: r.rows, total: r.total, capped: r.capped };
}

function takeLastColumn(r: StatementResult) {
  return {
    columns: r.columns.slice(0, -1),
    rows: r.rows.map((row) => row.slice(0, -1)),
    flags: r.rows.map((row) => row[row.length - 1] === 1),
  };
}

/** query লেখার ক্রমে clause-গুলো */
export function writtenOrder(q: ParsedSelect): string[] {
  const order: string[] = ["SELECT"];
  if (q.from) order.push("FROM");
  if (q.where) order.push("WHERE");
  if (q.groupBy) order.push("GROUP BY");
  if (q.having) order.push("HAVING");
  if (q.orderBy) order.push("ORDER BY");
  if (q.limit) order.push("LIMIT");
  return order;
}

function fromNote(q: ParsedSelect, total: number, capped: boolean): string {
  const count = capped ? `${bn(total)}টার বেশি` : `${bn(total)}টা`;
  const tokens = significant(tokenize(q.from ?? ""));
  const joins = tokens.filter((t) => isKeyword(t, ...JOIN_WORDS)).length;
  const commas = (() => {
    let depth = 0;
    let n = 0;
    for (const t of tokens) {
      if (t.text === "(") depth++;
      else if (t.text === ")") depth--;
      else if (t.text === "," && depth === 0) n++;
    }
    return n;
  })();
  if (joins + commas > 0) {
    return `সবার আগে চলে FROM। ${bn(joins + commas + 1)}টা table জোড়া লাগিয়ে ${count} row হলো। JOIN কীভাবে মেলে, তা "JOIN" ট্যাবে দেখুন।`;
  }
  return `সবার আগে চলে FROM, যদিও লেখা হয় SELECT-এর পরে। table থেকে ${count} row আনা হলো।`;
}

function selectNote(q: ParsedSelect, total: number): string {
  const star = q.items.length === 1 && q.items[0].expr === "*";
  const cols = star ? "সব column রাখা হলো" : `${bn(q.items.length)}টা column বানানো হলো: ${q.items.map((i) => `\`${i.alias ?? i.expr}\``).join(", ")}`;
  if (q.hasAggregate && !q.groupBy) {
    return `${cols}। GROUP BY নেই কিন্তু aggregate ফাংশন আছে, তাই সব row মিলে একটাই row হলো।`;
  }
  if (q.groupBy) return `${cols}। প্রতিটা দল থেকে একটা করে, মোট ${bn(total)}টা row।`;
  return `${cols}। মোট ${bn(total)}টা row।`;
}

function orderNote(orderBy: string): string {
  const parts = splitTopLevel(orderBy).map((term) => {
    const tokens = significant(tokenize(term));
    const desc = tokens.some((t) => isKeyword(t, "DESC"));
    const expr = term.replace(/\s+(ASC|DESC)\b.*$/i, "").replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "");
    return `\`${expr}\` অনুযায়ী ${desc ? "বড় থেকে ছোট (DESC)" : "ছোট থেকে বড় (ASC)"}`;
  });
  const joined = parts.length > 1 ? `আগে ${parts[0]}, সমান হলে ${parts.slice(1).join(", তারপর ")}` : parts[0];
  return `${joined} সাজানো হলো। ORDER BY না দিলে row-এর ক্রম নিশ্চিত নয়।`;
}

function limitNote(limit: string, ordered: boolean): string {
  const tokens = significant(tokenize(limit));
  const nums = tokens.filter((t) => t.type === "number").map((t) => Number(t.text));
  let what = `\`LIMIT ${limit}\` অনুযায়ী row রাখা হলো।`;
  if (tokens.length === 1 && nums.length === 1) what = `প্রথম ${bn(nums[0])}টা row রাখা হলো, বাকিগুলো বাদ।`;
  else if (nums.length === 2 && tokens.some((t) => isKeyword(t, "OFFSET"))) {
    what = `প্রথম ${bn(nums[1])}টা row বাদ দিয়ে পরের ${bn(nums[0])}টা রাখা হলো।`;
  } else if (nums.length === 2 && tokens.some((t) => t.text === ",")) {
    what = `প্রথম ${bn(nums[0])}টা row বাদ দিয়ে পরের ${bn(nums[1])}টা রাখা হলো।`;
  }
  return ordered ? `${what} এটাই শেষ ধাপ।` : `${what} ORDER BY নেই, তাই কোন row-গুলো আসবে তা নিশ্চিত নয়।`;
}
