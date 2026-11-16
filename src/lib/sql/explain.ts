/** একটা statement কী করল, তার বাংলা ব্যাখ্যা (`ব্যাকটিক` অংশ কোডের মতো দেখায়) */
import { bn } from "../bn";
import type { StatementResult } from "../db/types";
import { parseJoin, type JoinType } from "./join";
import { groupTerms, splitSelect, splitTopLevel } from "./split";
import { identName, isKeyword, isNameToken, significant, statementKind, tokenize, type Token } from "./tokenize";

export interface Explanation {
  readonly summary: string;
  /** SQLite যে ক্রমে কাজ করে, সেই ক্রমে */
  readonly steps: readonly string[];
  readonly warning?: string;
}

const JOIN_MEANING: Record<JoinType, string> = {
  INNER: "INNER JOIN: শুধু যেসব row-এর দুই দিকেই মিল আছে",
  LEFT: "LEFT JOIN: বাঁয়ের table-এর সব row থাকে, মিল না পেলে ডান দিকের ঘরে NULL",
  RIGHT: "RIGHT JOIN: ডানের table-এর সব row থাকে, মিল না পেলে বাঁ দিকের ঘরে NULL",
  FULL: "FULL JOIN: দুই দিকের সব row থাকে, মিল না পেলে অন্য দিকে NULL",
  CROSS: "CROSS JOIN: প্রতিটা row প্রতিটা row-এর সাথে",
};

const code = (s: string) => `\`${s.replace(/\s+/g, " ").trim()}\``;
const rowsText = (n: number, capped: boolean) => (capped ? `${bn(n)}টার বেশি row` : `${bn(n)}টা row`);

/** keyword-এর পরের নাম (IF NOT EXISTS, OR REPLACE ইত্যাদি বাদ দিয়ে) */
function nameAfter(tokens: readonly Token[], ...words: string[]): string | undefined {
  const i = tokens.findIndex((t) => isKeyword(t, ...words));
  if (i === -1) return undefined;
  let j = i + 1;
  while (isKeyword(tokens[j], "IF", "NOT", "EXISTS", "OR", "ROLLBACK", "ABORT", "REPLACE", "FAIL", "IGNORE", "ONLY")) j++;
  const t = tokens[j];
  if (!t || !isNameToken(t)) return undefined;
  // schema.name
  if (tokens[j + 1]?.text === "." && tokens[j + 2]) return identName(tokens[j + 2]);
  return identName(t);
}

const hasTopLevel = (tokens: readonly Token[], word: string) => {
  let depth = 0;
  for (const t of tokens) {
    if (t.text === "(") depth++;
    else if (t.text === ")") depth--;
    else if (depth === 0 && isKeyword(t, word)) return true;
  }
  return false;
};

export function explainStatement(sql: string, result: StatementResult): Explanation {
  const kind = statementKind(sql);
  const tokens = significant(tokenize(sql));
  const changes = result.changes;

  switch (kind) {
    case "select":
      return explainSelect(sql, result);
    case "insert": {
      const table = nameAfter(tokens, "INTO");
      return { summary: `${table ? `${code(table)} table-এ` : "table-এ"} ${bn(changes)}টা নতুন row যোগ হলো।`, steps: [] };
    }
    case "update": {
      const table = nameAfter(tokens, "UPDATE");
      const noWhere = !hasTopLevel(tokens, "WHERE");
      return {
        summary: `${table ? `${code(table)} table-এর` : "table-এর"} ${bn(changes)}টা row বদলানো হলো।`,
        steps: [],
        warning: noWhere && changes > 1 ? "WHERE নেই, তাই table-এর সব row বদলে গেছে। ভুল হলে ↶ (undo) চাপুন।" : undefined,
      };
    }
    case "delete": {
      const table = nameAfter(tokens, "FROM");
      const noWhere = !hasTopLevel(tokens, "WHERE");
      return {
        summary: `${table ? `${code(table)} table থেকে` : "table থেকে"} ${bn(changes)}টা row মুছে ফেলা হলো।`,
        steps: [],
        warning: noWhere && changes > 1 ? "WHERE নেই, তাই table-এর সব row মুছে গেছে। ভুল হলে ↶ (undo) চাপুন।" : undefined,
      };
    }
    case "create": {
      const what = tokens.find((t) => isKeyword(t, "TABLE", "INDEX", "VIEW", "TRIGGER"))?.upper;
      const name = what ? nameAfter(tokens, what) : undefined;
      const label = name ? code(name) : "";
      const text: Record<string, string> = {
        TABLE: `${label} নামে নতুন table বানানো হলো। বাঁয়ের তালিকায় দেখুন।`,
        INDEX: `${label} index বানানো হলো। এখন এই column দিয়ে খোঁজা দ্রুত হবে (বইয়ের সূচিপত্রের মতো)।`,
        VIEW: `${label} view বানানো হলো। view হলো নাম দেওয়া একটা query, table-এর মতো করে পড়া যায়।`,
        TRIGGER: `${label} trigger বানানো হলো। নির্দিষ্ট ঘটনায় এটা নিজে থেকে চলবে।`,
      };
      return { summary: (what && text[what]) || "নতুন জিনিস বানানো হলো।", steps: [] };
    }
    case "drop": {
      const what = tokens.find((t) => isKeyword(t, "TABLE", "INDEX", "VIEW", "TRIGGER"))?.upper;
      const name = what ? nameAfter(tokens, what) : undefined;
      return {
        summary: `${name ? code(name) : "এটা"} মুছে ফেলা হলো${what === "TABLE" ? ", সাথে তার সব ডেটাও" : ""}।`,
        steps: [],
        warning: what === "TABLE" ? "আসল DB-তে DROP TABLE ফেরানো যায় না। এখানে ↶ (undo) বা রিসেট চাপলে ফিরে আসবে।" : undefined,
      };
    }
    case "alter": {
      const name = nameAfter(tokens, "TABLE");
      return { summary: `${name ? code(name) : "table"}-এর গঠন বদলানো হলো।`, steps: [] };
    }
    case "pragma":
      return { summary: "PRAGMA দিয়ে SQLite-এর ভেতরের তথ্য বা সেটিং দেখা হলো।", steps: [] };
    case "transaction": {
      const word = tokens[0]?.upper;
      if (word === "BEGIN" || word === "SAVEPOINT") {
        return { summary: "transaction শুরু হলো। এখন থেকে বদলগুলো COMMIT না করা পর্যন্ত পাকা নয়; ROLLBACK দিলে সব বাতিল হবে।", steps: [] };
      }
      if (word === "ROLLBACK") return { summary: "transaction-এর সব বদল বাতিল হলো, DB আগের অবস্থায় ফিরল।", steps: [] };
      return { summary: "transaction-এর সব বদল পাকা (COMMIT) হলো।", steps: [] };
    }
    case "explain":
      return {
        summary: hasTopLevel(tokens, "PLAN")
          ? "SQLite query কীভাবে চালাবে, তার পরিকল্পনা। SCAN মানে পুরো table পড়া, SEARCH মানে index দিয়ে সরাসরি খোঁজা।"
          : "EXPLAIN দেখায় SQLite ভেতরে কোন কোন ছোট নির্দেশ দিয়ে query চালাবে।",
        steps: [],
      };
    default:
      return { summary: changes > 0 ? `${bn(changes)}টা row বদলেছে।` : "statement চলেছে।", steps: [] };
  }
}

function explainSelect(sql: string, result: StatementResult): Explanation {
  const outcome = result.total === 0 ? "কোনো row মেলেনি।" : `ফল: ${rowsText(result.total, result.capped)}।`;
  const split = splitSelect(sql);
  if (!split.ok) {
    if (split.reason === "compound") return { summary: `কয়েকটা SELECT-এর ফল এক করা হলো (UNION/INTERSECT/EXCEPT)। ${outcome}`, steps: [] };
    return { summary: outcome, steps: [] };
  }
  const q = split.query;
  const steps: string[] = [];

  if (q.with) steps.push("WITH: আগে নাম দেওয়া একটা অস্থায়ী ফল (CTE) বানানো হলো, মূল query সেটাকে table-এর মতো পড়ে।");
  if (q.from) {
    const join = parseJoin(q.from);
    if (join) {
      const cond = join.on ? ` ${code(join.on)} শর্তে` : join.using ? ` ${code(join.using.join(", "))} column মিলিয়ে` : "";
      steps.push(
        `FROM: ${code(join.left.name)} আর ${code(join.right.name)} table জোড়া লাগানো হলো${cond} (${JOIN_MEANING[join.type]})।${join.more ? " এর পরে আরও table জোড়া হয়েছে।" : ""}`,
      );
    } else {
      const first = significant(tokenize(q.from))[0];
      steps.push(
        first && isNameToken(first)
          ? `FROM: ${code(identName(first))} table থেকে row আনা হলো।`
          : "FROM: subquery-র ফলকে table হিসেবে নেওয়া হলো।",
      );
    }
  }
  if (q.where) steps.push(`WHERE: যেসব row-এ ${code(q.where)} সত্য, শুধু সেগুলো রাখা হলো।`);
  const terms = groupTerms(q);
  if (terms.length) steps.push(`GROUP BY: ${terms.map(code).join(" আর ")} অনুযায়ী row-গুলো দলে ভাগ হলো, প্রতিটা দল একটা row।`);
  else if (q.hasAggregate && !q.hasWindow) steps.push("GROUP BY নেই, কিন্তু aggregate ফাংশন আছে, তাই সব row মিলে একটা দল।");
  if (q.having) steps.push(`HAVING: যেসব দলে ${code(q.having)} সত্য, শুধু সেগুলো রাখা হলো।`);
  const star = q.items.length === 1 && q.items[0].expr === "*";
  steps.push(
    star
      ? "SELECT: সব column দেখানো হলো।"
      : `SELECT: ${q.items.map((i) => (i.alias ? `${code(i.expr)} (নাম ${code(i.alias)})` : code(i.expr))).join(", ")} দেখানো হলো।`,
  );
  if (q.hasWindow) steps.push("OVER: window ফাংশন প্রতিটা row রেখেই আশপাশের row-এর হিসাব করে।");
  if (q.distinct) steps.push("DISTINCT: একই রকম row একবারই রাখা হলো।");
  if (q.orderBy) {
    const parts = splitTopLevel(q.orderBy).map((term) => {
      const desc = significant(tokenize(term)).some((t) => isKeyword(t, "DESC"));
      return `${code(term.replace(/\s+(ASC|DESC)\b.*$/i, ""))} ${desc ? "বড় থেকে ছোট" : "ছোট থেকে বড়"}`;
    });
    steps.push(`ORDER BY: ${parts.join(", তারপর ")} সাজানো হলো।`);
  }
  if (q.limit) steps.push(`LIMIT: ${code(`LIMIT ${q.limit}`)} অনুযায়ী কয়েকটা row রাখা হলো।`);

  return { summary: outcome, steps };
}
