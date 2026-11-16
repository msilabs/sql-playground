/**
 * SQLite-এর ইংরেজি ভুলের বার্তা বাংলায়, সাথে কী করলে ঠিক হবে তার ইঙ্গিত।
 * যেটা চেনা নেই, সেটার জন্য সাধারণ বার্তা; আসল ইংরেজি বার্তা UI সবসময় নিচে দেখায়।
 */
import { allColumns, type SchemaInfo } from "../db/schema";
import { bn } from "../bn";
import { KEYWORDS } from "./tokenize";

export interface FriendlyError {
  readonly title: string;
  readonly hint?: string;
}

/** দুই শব্দের মধ্যে কয়টা অক্ষর বদলালে একটা আরেকটা হয় */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[y.length];
}

/** সবচেয়ে কাছের নাম, যদি যথেষ্ট কাছে হয় */
export function closest(word: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = editDistance(word, c);
    if (d < bestScore && c.toLowerCase() !== word.toLowerCase()) {
      best = c;
      bestScore = d;
    }
  }
  const limit = word.length <= 4 ? 1 : word.length <= 8 ? 2 : 3;
  return bestScore <= limit ? best : undefined;
}

const FUNCTION_HINTS: Record<string, string> = {
  NOW: "SQLite-এ এখনকার সময়ের জন্য `datetime('now')` বা `date('now')` লিখুন।",
  CURDATE: "আজকের তারিখের জন্য `date('now')` লিখুন।",
  IF: "শর্তের জন্য `IIF(শর্ত, হ্যাঁ, না)` বা `CASE WHEN … THEN … ELSE … END` লিখুন।",
  ISNULL: "NULL হলে বিকল্প মানের জন্য `IFNULL(x, বিকল্প)` বা `COALESCE(x, বিকল্প)` লিখুন।",
  LEN: "লেখার দৈর্ঘ্যের জন্য `length(x)` লিখুন।",
  DATEDIFF: "দুই তারিখের দিনের পার্থক্যের জন্য `julianday(a) - julianday(b)` লিখুন।",
  YEAR: "বছর বের করতে `strftime('%Y', তারিখ)` লিখুন।",
  MONTH: "মাস বের করতে `strftime('%m', তারিখ)` লিখুন।",
};

export function friendlyError(message: string, schema?: SchemaInfo): FriendlyError {
  const tables = schema?.tables.map((t) => t.name) ?? [];
  const columns = schema ? allColumns(schema) : [];
  let m: RegExpMatchArray | null;

  if ((m = message.match(/no such table: (?:main\.)?(.+)$/))) {
    const name = m[1].trim();
    const near = closest(name, tables);
    return {
      title: `\`${name}\` নামে কোনো table নেই।`,
      hint: near ? `আপনি কি \`${near}\` বোঝাতে চেয়েছেন?` : tables.length ? `যে table-গুলো আছে: ${tables.map((t) => `\`${t}\``).join(", ")}।` : undefined,
    };
  }
  if ((m = message.match(/no such column: (.+)$/))) {
    const full = m[1].trim();
    const name = full.includes(".") ? full.slice(full.lastIndexOf(".") + 1) : full;
    const near = closest(name, columns);
    const quoteHint =
      /[ঀ-৿]/.test(name) || /^[a-z]+$/i.test(name)
        ? " লেখা (text) বোঝাতে চাইলে একক উদ্ধৃতি দিন, যেমন `'paid'`। দ্বৈত উদ্ধৃতি (\") দিয়ে SQL column-এর নাম বোঝায়।"
        : "";
    return {
      title: `\`${full}\` নামে কোনো column নেই।`,
      hint: near ? `আপনি কি \`${near}\` বোঝাতে চেয়েছেন?${quoteHint}` : quoteHint.trim() || "বাঁয়ের table-এর তালিকায় column-এর নাম দেখে নিন।",
    };
  }
  if ((m = message.match(/near "(.+?)": syntax error/))) {
    const word = m[1];
    const keyword = /^[a-z_]+$/i.test(word) && !KEYWORDS.has(word.toUpperCase()) ? closest(word, [...KEYWORDS]) : undefined;
    return {
      title: `\`${word}\`-এর কাছে SQL-এর গঠনে ভুল আছে।`,
      hint: keyword
        ? `\`${word}\` কি আসলে \`${keyword}\`? বানানটা দেখুন।`
        : "এর ঠিক আগে কোনো কমা বাদ পড়েছে, বেশি পড়েছে, বা clause-এর ক্রম উল্টো হয়েছে কি না দেখুন। ক্রম হলো SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT।",
    };
  }
  if (/incomplete input/.test(message)) {
    return {
      title: "query অসম্পূর্ণ।",
      hint: "কোনো বন্ধনী `(` বা উদ্ধৃতিচিহ্ন `'` খোলা রয়ে গেছে কি না, বা শেষে কিছু বাদ পড়েছে কি না দেখুন।",
    };
  }
  if ((m = message.match(/unrecognized token: "(.+)"/))) {
    return { title: `\`${m[1]}\` চিহ্নটা SQL চেনে না।`, hint: "উদ্ধৃতিচিহ্ন ঠিকমতো বন্ধ হয়েছে কি না দেখুন। লেখা দিতে হয় একক উদ্ধৃতিতে: `'ঢাকা'`।" };
  }
  if ((m = message.match(/ambiguous column name: (.+)$/))) {
    const name = m[1].trim();
    return {
      title: `\`${name}\` একাধিক table-এ আছে, তাই SQLite বুঝতে পারছে না কোনটা।`,
      hint: `table-এর নাম বা alias আগে লিখে দিন, যেমন \`orders.${name}\` বা \`o.${name}\`।`,
    };
  }
  if (/misuse of aggregate/.test(message)) {
    return {
      title: "aggregate ফাংশন (COUNT, SUM, AVG…) এখানে ব্যবহার করা যায় না।",
      hint: "WHERE চলে দলে ভাগ করার আগে, তাই সেখানে COUNT/SUM চলে না। দলের হিসাবে শর্ত দিতে চাইলে GROUP BY-এর পরে HAVING লিখুন।",
    };
  }
  if (/a GROUP BY clause is required before HAVING/.test(message)) {
    return { title: "HAVING-এর আগে GROUP BY লাগবে।", hint: "সাধারণ row ছাঁকতে চাইলে WHERE লিখুন।" };
  }
  if ((m = message.match(/UNIQUE constraint failed: (.+)$/))) {
    return { title: `\`${m[1]}\`-এ এই মান আগে থেকেই আছে, একই মান দুইবার রাখা যায় না।`, hint: "PRIMARY KEY বা UNIQUE column-এ নতুন মান দিন, বা id বাদ দিন, SQLite নিজেই দেবে।" };
  }
  if ((m = message.match(/NOT NULL constraint failed: (.+)$/))) {
    return { title: `\`${m[1]}\` ফাঁকা (NULL) রাখা যায় না।`, hint: "INSERT-এ এই column-এর জন্য একটা মান দিন।" };
  }
  if (/FOREIGN KEY constraint failed/.test(message)) {
    return {
      title: "foreign key মিলছে না।",
      hint: "যে row-কে নির্দেশ করছেন (যেমন customer_id = 99) সেটা অন্য table-এ নেই, বা অন্য row এখনো এই row-কে নির্দেশ করছে বলে মোছা যাচ্ছে না।",
    };
  }
  if ((m = message.match(/table (.+) already exists/))) {
    return { title: `\`${m[1]}\` নামে table আগেই আছে।`, hint: "অন্য নাম দিন, বা `CREATE TABLE IF NOT EXISTS` লিখুন।" };
  }
  if ((m = message.match(/table (\S+) has (\d+) columns but (\d+) values were supplied/))) {
    return { title: `\`${m[1]}\`-এ column আছে ${bn(m[2])}টা, কিন্তু মান দেওয়া হয়েছে ${bn(m[3])}টা।`, hint: "INSERT INTO table (col1, col2) VALUES (…) লিখে কোন কোন column-এ মান দিচ্ছেন তা বলে দিন।" };
  }
  if (/values for \d+ columns/.test(message)) {
    return { title: "column-এর সংখ্যা আর মানের সংখ্যা মিলছে না।", hint: "বন্ধনীর ভেতরে যতগুলো column, VALUES-এ ঠিক ততগুলো মান দিন।" };
  }
  if ((m = message.match(/no such function: (.+)$/))) {
    const name = m[1].trim();
    return { title: `\`${name}\` নামে কোনো ফাংশন SQLite-এ নেই।`, hint: FUNCTION_HINTS[name.toUpperCase()] ?? "MySQL বা PostgreSQL-এর অনেক ফাংশন SQLite-এ অন্য নামে থাকে।" };
  }
  if ((m = message.match(/wrong number of arguments to function (.+)\(\)/))) {
    return { title: `\`${m[1]}()\` ফাংশনে ভুল সংখ্যক মান দেওয়া হয়েছে।` };
  }
  if (/(ORDER|GROUP) BY term out of range/.test(message)) {
    return { title: "ORDER BY বা GROUP BY-তে দেওয়া নম্বরটা column-এর সংখ্যার চেয়ে বেশি।", hint: "`ORDER BY 2` মানে SELECT-এর দ্বিতীয় column।" };
  }
  if (/sub-select returns \d+ columns - expected 1/.test(message) || /row value misused/.test(message)) {
    return { title: "subquery একটার বেশি column দিচ্ছে, এখানে একটাই লাগবে।", hint: "subquery-র SELECT-এ একটা column রাখুন।" };
  }
  if (/SELECTs to the left and right of (UNION|INTERSECT|EXCEPT)/.test(message)) {
    return { title: "UNION-এর দুই পাশের SELECT-এ column-এর সংখ্যা সমান হতে হবে।" };
  }
  if (/cannot start a transaction within a transaction/.test(message)) {
    return { title: "একটা transaction চলছে, তার ভেতরে আরেকটা শুরু করা যায় না।", hint: "আগে COMMIT বা ROLLBACK করুন।" };
  }
  if (/cannot (commit|rollback) - no transaction is active/.test(message)) {
    return { title: "কোনো transaction চলছে না।", hint: "আগে BEGIN দিয়ে শুরু করুন।" };
  }
  if (/no such index/.test(message)) return { title: "এই নামে কোনো index নেই।" };
  if (/(may not be dropped|may not be modified)/.test(message)) return { title: "এই table SQLite-এর নিজের, বদলানো যায় না।" };
  if (/(too many|out of memory|string or blob too big)/i.test(message)) {
    return { title: "query-টা খুব বড় বা খুব বেশি ডেটা বানাচ্ছে।", hint: "LIMIT দিন, বা JOIN-এর শর্ত দেখুন, শর্ত বাদ পড়লে প্রতিটা row প্রতিটা row-এর সাথে জোড়া লাগে।" };
  }
  return { title: "SQLite একটা ভুল জানিয়েছে।", hint: "নিচের ইংরেজি বার্তাটা দেখুন; সাধারণত কোন শব্দে ভুল তা সেখানে লেখা থাকে।" };
}

export const TIMEOUT_ERROR: FriendlyError = {
  title: "query অনেক সময় নিচ্ছিল, তাই থামিয়ে দেওয়া হয়েছে।",
  hint: "অসীম লুপ (যেমন শেষ না হওয়া recursive CTE) বা শর্ত ছাড়া বড় JOIN হয়েছে কি না দেখুন। DB আগের অবস্থায় ফিরিয়ে আনা হয়েছে।",
};
