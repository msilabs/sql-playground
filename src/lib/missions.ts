/**
 * শেখার পথ: mission আর তাদের কাজ। সব mission চলে "অনলাইন দোকান" dataset-এ।
 *
 * কাজ পূর্ণ হয় ফল মিলিয়ে, হুবহু query মিলিয়ে নয়: `solution` এখনকার DB-তে চালিয়ে যে ফল আসে,
 * ব্যবহারকারীর শেষ SELECT-এর ফল তার সাথে মিললেই হলো (column-এর নাম নয়, শুধু মান)।
 * DB বদলানোর কাজে (`state`) `verify` query ১ ফেরত দিলে কাজ শেষ।
 *
 * অগ্রগতি একটা সংখ্যা (সব কাজ পরপর সাজালে কয়টা শেষ)। নতুন কাজ শুধু শেষে যোগ করুন,
 * নাহলে পুরোনো সেভের অগ্রগতি অন্য কাজে চলে যাবে।
 */
import type { DatasetId } from "./db/datasets";
import { query, type Engine, type SqlValue, type StatementResult } from "./db/types";

export interface Task {
  /** কী করতে হবে (`ব্যাকটিক` অংশ কোডের মতো দেখায়) */
  readonly label: string;
  readonly hint: string;
  readonly solution: string;
  /** rows: ক্রম যাই হোক; ordered: ক্রমও মিলতে হবে; state: DB-র অবস্থা দেখে */
  readonly check: "rows" | "ordered" | "state";
  /** state কাজে: এটা ১ ফেরত দিলে কাজ শেষ */
  readonly verify?: string;
}

export interface Mission {
  readonly title: string;
  readonly goal: string;
  readonly tasks: readonly Task[];
}

export const MISSION_DATASET: DatasetId = "dokan";

export const MISSIONS: readonly Mission[] = [
  {
    title: "প্রথম SELECT",
    goal: "table থেকে ডেটা পড়া। SELECT-এর পরে কোন column, FROM-এর পরে কোন table।",
    tasks: [
      {
        label: "`products` table-এর সব পণ্যের সব তথ্য দেখুন।",
        hint: "সব column বোঝাতে `*` লিখুন: `SELECT * FROM …`",
        solution: "SELECT * FROM products;",
        check: "rows",
      },
      {
        label: "এবার শুধু পণ্যের নাম (`name`) আর দাম (`price`) দেখুন।",
        hint: "`*`-এর জায়গায় column-এর নামগুলো কমা দিয়ে লিখুন।",
        solution: "SELECT name, price FROM products;",
        check: "rows",
      },
    ],
  },
  {
    title: "WHERE দিয়ে ছাঁকা",
    goal: "শর্ত দিয়ে শুধু দরকারি row রাখা। লেখা (text) দিতে হয় একক উদ্ধৃতিতে: 'paid'।",
    tasks: [
      {
        label: "১০০০ টাকার বেশি দামের পণ্যগুলোর নাম আর দাম দেখুন।",
        hint: "FROM-এর পরে `WHERE price > 1000`",
        solution: "SELECT name, price FROM products WHERE price > 1000;",
        check: "rows",
      },
      {
        label: "যেসব পণ্য স্টকে নেই (`stock` শূন্য), সেগুলোর শুধু নাম দেখুন।",
        hint: "সমান বোঝাতে SQL-এ একটা `=` লেখা হয়।",
        solution: "SELECT name FROM products WHERE stock = 0;",
        check: "rows",
      },
      {
        label: "যেসব অর্ডারের টাকা দেওয়া হয়েছে (`status` হলো `paid`) আর পরিশোধ হয়েছে `bkash` বা `nagad`-এ, সেগুলোর সব column দেখুন।",
        hint: "দুই শর্ত জুড়তে `AND`। কয়েকটা মানের যেকোনোটা বোঝাতে `payment IN ('bkash', 'nagad')`।",
        solution: "SELECT * FROM orders WHERE status = 'paid' AND payment IN ('bkash', 'nagad');",
        check: "rows",
      },
    ],
  },
  {
    title: "LIKE আর NULL",
    goal: "লেখার অংশ দিয়ে খোঁজা, আর ফাঁকা (NULL) ঘর চেনা।",
    tasks: [
      {
        label: "যেসব গ্রাহকের নাম 'ইসলাম' দিয়ে শেষ, তাদের নাম দেখুন।",
        hint: "`LIKE '%ইসলাম'`: `%` মানে যেকোনো কিছু, যত অক্ষরই হোক।",
        solution: "SELECT name FROM customers WHERE name LIKE '%ইসলাম';",
        check: "rows",
      },
      {
        label: "একজন গ্রাহকের জেলা জানা নেই (`district_id` ফাঁকা)। তার নাম বের করুন।",
        hint: "NULL-এর সাথে `=` কখনো সত্য হয় না। লিখতে হয় `IS NULL`।",
        solution: "SELECT name FROM customers WHERE district_id IS NULL;",
        check: "rows",
      },
    ],
  },
  {
    title: "ORDER BY আর LIMIT",
    goal: "ফল সাজানো, আর প্রথম কয়েকটা row নেওয়া।",
    tasks: [
      {
        label: "সবচেয়ে দামি ৫টা পণ্যের নাম আর দাম দেখুন, বড় থেকে ছোট।",
        hint: "`ORDER BY price DESC` দিয়ে সাজিয়ে `LIMIT 5`।",
        solution: "SELECT name, price FROM products ORDER BY price DESC LIMIT 5;",
        check: "ordered",
      },
      {
        label: "এবার সবচেয়ে সস্তা ৩টা পণ্যের নাম আর দাম, ছোট থেকে বড়।",
        hint: "`ASC` মানে ছোট থেকে বড়; না লিখলেও ASC ধরা হয়।",
        solution: "SELECT name, price FROM products ORDER BY price ASC LIMIT 3;",
        check: "ordered",
      },
    ],
  },
  {
    title: "গোনা আর হিসাব",
    goal: "COUNT, SUM, AVG, MAX, MIN: অনেক row মিলিয়ে একটা উত্তর।",
    tasks: [
      {
        label: "মোট কয়টা অর্ডার আছে?",
        hint: "`SELECT count(*) FROM …`",
        solution: "SELECT count(*) FROM orders;",
        check: "rows",
      },
      {
        label: "সব পণ্যের গড় দাম কত?",
        hint: "গড়ের জন্য `avg(price)`।",
        solution: "SELECT avg(price) FROM products;",
        check: "rows",
      },
      {
        label: "সবচেয়ে বেশি আর সবচেয়ে কম দাম একসাথে দেখুন (প্রথমে বেশি, তারপর কম)।",
        hint: "এক SELECT-এ দুটো: `max(price), min(price)`।",
        solution: "SELECT max(price), min(price) FROM products;",
        check: "rows",
      },
    ],
  },
  {
    title: "GROUP BY আর HAVING",
    goal: "row-গুলো দলে ভাগ করে প্রতিটা দলের হিসাব। \"ধাপে ধাপে\" ট্যাবে দলগুলো রঙে দেখা যাবে।",
    tasks: [
      {
        label: "প্রতিটা `category`-তে কয়টা পণ্য আছে? category আর সংখ্যা দেখুন।",
        hint: "`SELECT category, count(*) FROM products GROUP BY category`",
        solution: "SELECT category, count(*) FROM products GROUP BY category;",
        check: "rows",
      },
      {
        label: "কোন পরিশোধ পদ্ধতিতে (`payment`) কয়টা অর্ডার হয়েছে? পদ্ধতি আর সংখ্যা, বেশি থেকে কম সাজিয়ে।",
        hint: "GROUP BY payment, তারপর `ORDER BY count(*) DESC`।",
        solution: "SELECT payment, count(*) FROM orders GROUP BY payment ORDER BY count(*) DESC;",
        check: "rows",
      },
      {
        label: "যেসব গ্রাহক ৩টার বেশি অর্ডার দিয়েছেন, তাদের `customer_id` আর অর্ডারের সংখ্যা দেখুন।",
        hint: "দলের ওপর শর্ত WHERE-এ চলে না, লাগে `HAVING count(*) > 3`।",
        solution: "SELECT customer_id, count(*) FROM orders GROUP BY customer_id HAVING count(*) > 3;",
        check: "rows",
      },
    ],
  },
  {
    title: "INNER JOIN",
    goal: "দুই table জোড়া লাগানো। \"JOIN\" ট্যাবে দেখুন কোন row কোনটার সাথে মিলল।",
    tasks: [
      {
        label: "প্রতিটা অর্ডারের id-এর পাশে গ্রাহকের নাম দেখুন।",
        hint: "`FROM orders o JOIN customers c ON c.id = o.customer_id`, তারপর `SELECT o.id, c.name`।",
        solution: "SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id;",
        check: "rows",
      },
      {
        label: "প্রতিটা গ্রাহকের নামের পাশে তার জেলার নাম দেখুন। কয়জন এল, খেয়াল করুন।",
        hint: "`customers` আর `districts` জোড়া লাগান: `ON d.id = c.district_id`।",
        solution: "SELECT c.name, d.name FROM customers c JOIN districts d ON d.id = c.district_id;",
        check: "rows",
      },
    ],
  },
  {
    title: "LEFT JOIN",
    goal: "মিল না পেলেও বাঁয়ের table-এর row রাখা। মিল না পেলে ডান দিকে NULL বসে।",
    tasks: [
      {
        label: "সব গ্রাহকের নাম আর জেলার নাম দেখুন। জেলা জানা না থাকলেও গ্রাহক যেন বাদ না পড়েন।",
        hint: "আগের query-তে `JOIN`-এর জায়গায় `LEFT JOIN`।",
        solution: "SELECT c.name, d.name FROM customers c LEFT JOIN districts d ON d.id = c.district_id;",
        check: "rows",
      },
      {
        label: "যেসব গ্রাহক কখনো অর্ডার দেননি, তাদের নাম দেখুন।",
        hint: "`customers` LEFT JOIN `orders`, তারপর যেখানে অর্ডার মেলেনি: `WHERE o.id IS NULL`।",
        solution: "SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;",
        check: "rows",
      },
      {
        label: "কোন জেলা থেকে একজন গ্রাহকও নেই? জেলার নাম দেখুন।",
        hint: "এবার বাঁয়ে `districts`, ডানে `customers`।",
        solution: "SELECT d.name FROM districts d LEFT JOIN customers c ON c.district_id = d.id WHERE c.id IS NULL;",
        check: "rows",
      },
    ],
  },
  {
    title: "Subquery",
    goal: "query-র ভেতরে query: ভেতরেরটা আগে চলে, তার ফল বাইরেরটা ব্যবহার করে।",
    tasks: [
      {
        label: "গড় দামের চেয়ে দামি পণ্যগুলোর নাম আর দাম দেখুন।",
        hint: "`WHERE price > (SELECT avg(price) FROM products)`",
        solution: "SELECT name, price FROM products WHERE price > (SELECT avg(price) FROM products);",
        check: "rows",
      },
      {
        label: "ঢাকা জেলার (`district_id` = 1) গ্রাহকদের সব অর্ডার দেখুন, সব column।",
        hint: "`WHERE customer_id IN (SELECT id FROM customers WHERE …)`",
        solution: "SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE district_id = 1);",
        check: "rows",
      },
    ],
  },
  {
    title: "ডেটা বদলানো",
    goal: "INSERT, UPDATE, DELETE। ভয় নেই: ভুল হলে ↶ বা রিসেট চাপলেই আগের অবস্থা।",
    tasks: [
      {
        label: "নতুন পণ্য যোগ করুন: নাম 'গামছা', category 'পোশাক', দাম 200, stock 50।",
        hint: "`INSERT INTO products (name, category, price, stock) VALUES (…)`। id না দিলে SQLite নিজেই দেয়।",
        solution: "INSERT INTO products (name, category, price, stock) VALUES ('গামছা', 'পোশাক', 200, 50);",
        check: "state",
        verify: "SELECT count(*) > 0 FROM products WHERE name = 'গামছা' AND price = 200",
      },
      {
        label: "গামছার দাম বাড়িয়ে 220 করুন। শুধু গামছার, অন্য কোনো পণ্যের নয়!",
        hint: "`UPDATE products SET price = 220 WHERE name = 'গামছা'`। WHERE ভুললে সব পণ্যের দাম 220 হয়ে যাবে।",
        solution: "UPDATE products SET price = 220 WHERE name = 'গামছা';",
        check: "state",
        verify:
          "SELECT (SELECT count(*) FROM products WHERE name = 'গামছা' AND price = 220) > 0 AND (SELECT count(*) FROM products WHERE price = 220) = 1",
      },
      {
        label: "বাতিল (`cancelled`) হওয়া অর্ডারগুলোর সব পণ্য `order_items` থেকে মুছে ফেলুন।",
        hint: "`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled')`",
        solution: "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');",
        check: "state",
        verify:
          "SELECT (SELECT count(*) FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled')) = 0 AND (SELECT count(*) FROM order_items) > 0",
      },
    ],
  },
  {
    title: "শেষ চ্যালেঞ্জ",
    goal: "চাকরির interview-তে প্রায়ই আসে এমন প্রশ্ন। যা শিখেছেন সব একসাথে।",
    tasks: [
      {
        label: "পণ্যের দ্বিতীয় সর্বোচ্চ দাম কত? উত্তর শুধু একটা সংখ্যা।",
        hint: "সবচেয়ে বেশি দামের চেয়ে কম দামগুলোর মধ্যে সবচেয়ে বেশি: subquery দিয়ে `max`।",
        solution: "SELECT max(price) FROM products WHERE price < (SELECT max(price) FROM products);",
        check: "rows",
      },
      {
        label: "একই ফোন নম্বর একাধিক গ্রাহকের নামে আছে। সেই নম্বর আর কতজনের নামে, তা দেখুন।",
        hint: "`GROUP BY phone`, তারপর `HAVING count(*) > 1`।",
        solution: "SELECT phone, count(*) FROM customers GROUP BY phone HAVING count(*) > 1;",
        check: "rows",
      },
      {
        label: "সবচেয়ে বেশি কেনাকাটা করা ৩ জন গ্রাহকের নাম আর মোট টাকা দেখুন, বেশি থেকে কম। শুধু `paid` অর্ডার ধরুন; টাকা = `quantity * unit_price`-এর যোগফল।",
        hint: "`customers` → `orders` → `order_items` তিন table জোড়া, `WHERE o.status = 'paid'`, `GROUP BY c.id`, `ORDER BY` মোট `DESC`, `LIMIT 3`।",
        solution:
          "SELECT c.name, sum(oi.quantity * oi.unit_price) AS total\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nJOIN order_items oi ON oi.order_id = o.id\nWHERE o.status = 'paid'\nGROUP BY c.id\nORDER BY total DESC\nLIMIT 3;",
        check: "ordered",
      },
    ],
  },
];

export const TOTAL_TASKS = MISSIONS.reduce((n, m) => n + m.tasks.length, 0);

/** অগ্রগতির সংখ্যা থেকে: কোন mission, তার কয়টা কাজ শেষ */
export function missionAt(step: number): { index: number; done: number } {
  let rest = step;
  for (let i = 0; i < MISSIONS.length; i++) {
    if (rest < MISSIONS[i].tasks.length) return { index: i, done: rest };
    rest -= MISSIONS[i].tasks.length;
  }
  return { index: MISSIONS.length, done: 0 };
}

export function taskAt(step: number): Task | null {
  const at = missionAt(step);
  return MISSIONS[at.index]?.tasks[at.done] ?? null;
}

export type CheckOutcome =
  | { readonly status: "pass" }
  | { readonly status: "skip" }
  | {
      readonly status: "fail";
      readonly reason: "columns" | "rows" | "order" | "state";
      readonly expectedColumns?: number;
      readonly actualColumns?: number;
      readonly extra: number;
      readonly missing: number;
      /** উদাহরণ: যে row আসার কথা কিন্তু আসেনি */
      readonly sampleMissing?: readonly SqlValue[];
    };

const cellKey = (v: SqlValue) =>
  v === null ? "∅" : typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : typeof v === "string" ? `s:${v}` : "blob";
const rowKey = (row: readonly SqlValue[]) => JSON.stringify(row.map(cellKey));

/** দুই ফলের তুলনা (column-এর নাম নয়, শুধু মান) */
export function compareRows(
  actual: StatementResult,
  expected: StatementResult,
  ordered: boolean,
): CheckOutcome {
  if (actual.columns.length !== expected.columns.length) {
    return {
      status: "fail",
      reason: "columns",
      expectedColumns: expected.columns.length,
      actualColumns: actual.columns.length,
      extra: 0,
      missing: 0,
    };
  }
  const a = actual.rows.map(rowKey);
  const e = expected.rows.map(rowKey);
  const counts = new Map<string, number>();
  for (const k of e) counts.set(k, (counts.get(k) ?? 0) + 1);
  let extra = 0;
  for (const k of a) {
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1);
    else extra++;
  }
  const missingKeys = [...counts.entries()].filter(([, n]) => n > 0);
  const missing = missingKeys.reduce((s, [, n]) => s + n, 0);
  if (extra > 0 || missing > 0 || actual.total !== expected.total) {
    const sampleIndex = missingKeys.length ? e.indexOf(missingKeys[0][0]) : -1;
    return {
      status: "fail",
      reason: "rows",
      extra,
      missing,
      sampleMissing: sampleIndex >= 0 ? expected.rows[sampleIndex] : undefined,
    };
  }
  if (ordered && a.some((k, i) => k !== e[i])) return { status: "fail", reason: "order", extra: 0, missing: 0 };
  return { status: "pass" };
}

/**
 * এখনকার কাজ পূর্ণ হলো কি না। `lastRows`: এবারের চালানোয় শেষ যে statement row দিয়েছে
 * (SELECT); না থাকলে null।
 */
export async function checkTask(
  engine: Engine,
  task: Task,
  lastRows: StatementResult | null,
  changedDb: boolean,
): Promise<CheckOutcome> {
  if (task.check === "state") {
    const r = await query(engine, task.verify!);
    if (r.rows[0]?.[0] === 1) return { status: "pass" };
    return changedDb ? { status: "fail", reason: "state", extra: 0, missing: 0 } : { status: "skip" };
  }
  if (!lastRows) return { status: "skip" };
  const expected = await query(engine, task.solution);
  return compareRows(lastRows, expected, task.check === "ordered");
}
