import { writeFileSync } from "node:fs";
// নমুনা ডেটা বানায়: node scripts/gen-datasets.mjs (seed ঠিক করা, তাই প্রতিবার হুবহু একই ডেটা)
const outDir = new URL("../src/lib/db/datasets", import.meta.url).pathname;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const q = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, cols, rows) =>
  `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` + rows.map((r) => `  (${r.map(q).join(", ")})`).join(",\n") + ";";
const pad = (n) => String(n).padStart(2, "0");

function writeTs(name, constName, sql) {
  if (sql.includes("`") || sql.includes("${")) throw new Error("bad char");
  writeFileSync(`${outDir}/${name}.ts`, `// scripts/gen-datasets.mjs দিয়ে তৈরি নমুনা ডেটা। হাতে বদলালে mission-এর উত্তরও মিলিয়ে দেখুন (npm test)।\nexport const ${constName} = \`${sql}\n\`;\n`);
}

/* ---------- দোকান ---------- */
{
  const r = rng(20261117);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const districts = [
    [1, "ঢাকা", "ঢাকা"], [2, "চট্টগ্রাম", "চট্টগ্রাম"], [3, "সিলেট", "সিলেট"], [4, "রাজশাহী", "রাজশাহী"],
    [5, "খুলনা", "খুলনা"], [6, "বরিশাল", "বরিশাল"], [7, "রংপুর", "রংপুর"], [8, "ময়মনসিংহ", "ময়মনসিংহ"],
    [9, "গাজীপুর", "ঢাকা"], [10, "কুমিল্লা", "চট্টগ্রাম"], [11, "বগুড়া", "রাজশাহী"], [12, "কক্সবাজার", "চট্টগ্রাম"],
  ];
  const products = [
    ["লুঙ্গি", "পোশাক", 450, 40], ["শাড়ি", "পোশাক", 2500, 12], ["পাঞ্জাবি", "পোশাক", 1800, 20], ["টি-শার্ট", "পোশাক", 550, 60],
    ["চাল (৫ কেজি)", "খাবার", 420, 100], ["মসুর ডাল (১ কেজি)", "খাবার", 140, 80], ["সরিষার তেল (১ লিটার)", "খাবার", 260, 50],
    ["চা পাতা", "খাবার", 180, 0], ["মধু", "খাবার", 650, 15],
    ["হেডফোন", "ইলেকট্রনিক্স", 1200, 25], ["পাওয়ার ব্যাংক", "ইলেকট্রনিক্স", 1500, 18], ["মোবাইল চার্জার", "ইলেকট্রনিক্স", 450, 35],
    ["স্মার্ট ওয়াচ", "ইলেকট্রনিক্স", 3500, 6], ["ব্লুটুথ স্পিকার", "ইলেকট্রনিক্স", 2200, 0],
    ["প্রোগ্রামিং শিখি", "বই", 380, 30], ["গণিত অলিম্পিয়াড", "বই", 300, 22], ["গল্পগুচ্ছ", "বই", 250, 40],
    ["প্রেশার কুকার", "ঘরের জিনিস", 2800, 9], ["রাইস কুকার", "ঘরের জিনিস", 3200, 7], ["বেডশিট", "ঘরের জিনিস", 1100, 28],
  ].map((p, i) => [i + 1, ...p]);
  const names = ["রহিম উদ্দিন", "করিম মিয়া", "ফাতেমা বেগম", "নুসরাত জাহান", "তানভীর আহমেদ", "সাকিব হাসান", "মিম আক্তার",
    "আরিফ হোসেন", "জান্নাতুল ফেরদৌস", "রাকিব খান", "সুমাইয়া ইসলাম", "ইমরান হোসেন", "শারমিন সুলতানা", "মাহমুদুল হাসান",
    "তাসনিম রহমান", "নাঈম ইসলাম", "রুমানা আফরোজ", "শফিকুল আলম", "লামিয়া চৌধুরী", "জুবায়ের আহমেদ", "সাদিয়া আফরিন",
    "মেহেদী হাসান", "নাদিয়া ইসলাম", "রিয়াদ মাহমুদ", "তানজিলা আক্তার", "হাসিবুল ইসলাম", "পারভীন আক্তার", "আসিফ ইকবাল",
    "ফারহানা ইয়াসমিন", "সজীব দাস"];
  // বরিশাল (৬) থেকে কোনো গ্রাহক নেই
  const districtPool = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 7, 8, 9, 9, 10, 11, 12];
  const phones = new Set();
  const customers = names.map((name, i) => {
    let phone;
    do phone = `01${pick([3, 5, 6, 7, 8, 9])}${String(Math.floor(r() * 1e8)).padStart(8, "0")}`; while (phones.has(phone));
    phones.add(phone);
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const year = i < 18 ? 2024 : 2025;
    return [i + 1, name, phone, pick(districtPool), `${year}-${pad(month)}-${pad(day)}`];
  });
  customers[21][2] = customers[6][2]; // একই ফোন নম্বর দুইবার (duplicate খোঁজার mission)
  customers[13][3] = null; // জেলা জানা নেই (LEFT JOIN-এ NULL)
  const orders = [];
  const items = [];
  let itemId = 1;
  for (let id = 1; id <= 60; id++) {
    const customer = 1 + Math.floor(r() * 25); // ২৬-৩০ নম্বর গ্রাহক কখনো অর্ডার দেননি
    const month = 1 + Math.floor(((id - 1) / 60) * 10);
    const day = 1 + Math.floor(r() * 28);
    const s = r();
    const status = s < 0.7 ? "paid" : s < 0.85 ? "pending" : "cancelled";
    const p = r();
    const payment = p < 0.45 ? "bkash" : p < 0.65 ? "nagad" : p < 0.9 ? "cash" : "card";
    orders.push([id, customer, `2025-${pad(month)}-${pad(day)}`, status, payment]);
    const count = 1 + Math.floor(r() * 4);
    const used = new Set();
    for (let k = 0; k < count; k++) {
      let prod;
      do prod = 1 + Math.floor(r() * products.length); while (used.has(prod));
      used.add(prod);
      items.push([itemId++, id, prod, 1 + Math.floor(r() * 3), products[prod - 1][3]]);
    }
  }
  const sql = `PRAGMA foreign_keys = ON;

CREATE TABLE districts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  division TEXT NOT NULL
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  district_id INTEGER REFERENCES districts(id),
  joined_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_date TEXT NOT NULL,
  status TEXT NOT NULL,
  payment TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL
);

${insert("districts", ["id", "name", "division"], districts)}

${insert("customers", ["id", "name", "phone", "district_id", "joined_at"], customers)}

${insert("products", ["id", "name", "category", "price", "stock"], products)}

${insert("orders", ["id", "customer_id", "order_date", "status", "payment"], orders)}

${insert("order_items", ["id", "order_id", "product_id", "quantity", "unit_price"], items)}`;
  writeTs("dokan", "DOKAN_SQL", sql);
}

/* ---------- স্কুল ---------- */
{
  const r = rng(1971);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const teachers = ["আনোয়ার হোসেন", "সেলিনা পারভীন", "মোস্তফা কামাল", "রোকসানা খাতুন", "জাহিদুল ইসলাম", "নাসরিন সুলতানা"];
  const classes = [];
  let cid = 1;
  for (const grade of [6, 7, 8]) {
    for (const section of ["ক", "খ"]) {
      classes.push([cid, grade, section, teachers[cid - 1]]);
      cid++;
    }
  }
  const subjects = [[1, "বাংলা", 100], [2, "ইংরেজি", 100], [3, "গণিত", 100], [4, "বিজ্ঞান", 100], [5, "বাংলাদেশ ও বিশ্বপরিচয়", 100]];
  const first = ["আয়েশা", "তাহমিদ", "রাইসা", "ফাহিম", "নাফিসা", "সিয়াম", "অর্পিতা", "তাওসিফ", "মারিয়া", "রাফি", "ইশরাত", "আদনান",
    "সামিয়া", "জিহাদ", "প্রিয়াঙ্কা", "শাহরিয়ার", "তাসফিয়া", "ইফতেখার", "মাইশা", "আবির", "নাবিলা", "সাদমান", "অদিতি", "রাহাত",
    "সুমাইয়া", "তানিম", "ফারিহা", "নাহিদ", "লাবিবা", "মুনতাসির", "রিয়া", "সাজ্জাদ", "তৃষা", "আরাফাত", "মেহজাবিন", "ইয়াসির"];
  const last = ["রহমান", "ইসলাম", "হোসেন", "আহমেদ", "চৌধুরী", "খান", "আক্তার", "সরকার", "তালুকদার", "মিয়া"];
  const girls = new Set(["আয়েশা", "রাইসা", "নাফিসা", "অর্পিতা", "মারিয়া", "ইশরাত", "সামিয়া", "প্রিয়াঙ্কা", "তাসফিয়া", "মাইশা", "নাবিলা", "অদিতি", "সুমাইয়া", "ফারিহা", "লাবিবা", "রিয়া", "তৃষা", "মেহজাবিন"]);
  const towns = ["ঢাকা", "চট্টগ্রাম", "সিলেট", "রাজশাহী", "খুলনা", "বরিশাল", "রংপুর", "কুমিল্লা"];
  const students = first.map((f, i) => {
    const classId = 1 + Math.floor(i / 6);
    const grade = classes[classId - 1][1];
    const year = 2026 - grade - 6 + (r() < 0.3 ? -1 : 0);
    return [i + 1, `${f} ${pick(last)}`, classId, i === 20 ? null : (i % 6) + 1, girls.has(f) ? "মেয়ে" : "ছেলে", `${year}-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 28))}`, pick(towns)];
  });
  const results = [];
  let rid = 1;
  const exams = ["প্রথম সাময়িক", "বার্ষিক"];
  for (const s of students) {
    const skill = 45 + Math.floor(r() * 45);
    for (const exam of exams) for (const sub of subjects) {
      if (s[0] === 11 && exam === "বার্ষিক" && sub[0] === 3) continue; // অনুপস্থিত
      if (s[0] === 29 && exam === "বার্ষিক") continue; // পুরো বার্ষিক পরীক্ষায় অনুপস্থিত
      const marks = Math.max(18, Math.min(100, skill + Math.floor(r() * 30) - 15));
      results.push([rid++, s[0], sub[0], exam, marks]);
    }
  }
  const sql = `PRAGMA foreign_keys = ON;

CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  grade INTEGER NOT NULL,
  section TEXT NOT NULL,
  class_teacher TEXT NOT NULL
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  roll INTEGER,
  gender TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  hometown TEXT NOT NULL
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  full_marks INTEGER NOT NULL
);

CREATE TABLE results (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  exam TEXT NOT NULL,
  marks INTEGER NOT NULL
);

${insert("classes", ["id", "grade", "section", "class_teacher"], classes)}

${insert("students", ["id", "name", "class_id", "roll", "gender", "birth_date", "hometown"], students)}

${insert("subjects", ["id", "name", "full_marks"], subjects)}

${insert("results", ["id", "student_id", "subject_id", "exam", "marks"], results)}`;
  writeTs("school", "SCHOOL_SQL", sql);
}
