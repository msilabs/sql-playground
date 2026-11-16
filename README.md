# SQL Playground

[![CI](https://github.com/msilabs/sql-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/msilabs/sql-playground/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)

ব্রাউজারে SQL শেখার জায়গা। query লিখলে আসল SQLite চালায়, তারপর বাংলায় বলে দেয় কী হলো। query ভেতরে কোন ক্রমে চলে (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT), প্রতিটা ধাপের পরে table দেখতে কেমন, আর JOIN-এ কোন row কোন row-এর সাথে মিলল, সব চোখে দেখা যায়।

**লাইভ:** https://msilabs.github.io/sql-playground/

![GROUP BY ধাপে row-গুলো রঙে রঙে দলে ভাগ হয়েছে](docs/screenshot.png)

কোনো সার্ভার, লগইন বা ডেটাবেস নেই। SQLite চলে আপনার ব্রাউজারে ([sql.js](https://github.com/sql-js/sql.js), WebAssembly), আর আপনার কাজ সেভ থাকে এই ব্রাউজারের `localStorage`-এ।

## যা যা আছে

- **আসল SQLite:** JOIN, subquery, CTE, window ফাংশন, INSERT/UPDATE/DELETE, CREATE TABLE, সব চলে। একসাথে কয়েকটা statement দিলে প্রতিটার ফল আলাদা দেখায়।
- **বাংলায় ব্যাখ্যা:** প্রতিটা query-র পরে ধাপে ধাপে কী হলো। WHERE ছাড়া UPDATE বা DELETE দিলে সতর্কবার্তা।
- **বাংলায় ভুল আর ইঙ্গিত:** `no such column: custmer_id` এলে বলে দেয় "আপনি কি `customer_id` বোঝাতে চেয়েছেন?"। আসল ইংরেজি বার্তাও দেখা যায়।
- **ধাপে ধাপে:** প্রতিটা clause-এর পরের table। WHERE-এ কোন row টিকল আর কোনটা বাদ গেল, GROUP BY-তে কোন row কোন দলে (রঙে), HAVING-এ কোন দল টিকল।
- **JOIN-এর ছবি:** দুই table পাশাপাশি, মিলে যাওয়া row-গুলো লাইনে জোড়া। LEFT JOIN-এ কোথায় NULL বসল তা আলাদা রঙে।
- **১১টা মিশন, ২৮টা কাজ:** প্রথম SELECT থেকে interview-এর প্রশ্ন পর্যন্ত। উত্তর মেলানো হয় ফল দেখে, হুবহু query মিলিয়ে নয়। ইঙ্গিত আর সমাধানও আছে।
- **বাংলাদেশি ডেটা:** "অনলাইন দোকান" (জেলা, গ্রাহক, পণ্য, অর্ডার, bKash/Nagad পেমেন্ট) আর "স্কুল" (শ্রেণি, শিক্ষার্থী, বিষয়, নম্বর)।
- **নিরাপদে ভুল করা:** Undo দিয়ে শেষ বদল বাতিল, রিসেট দিয়ে শুরুর অবস্থা। শেষ না হওয়া query ৩ সেকেন্ডে থেমে যায়, পেজ আটকায় না।
- **Editor:** রঙিন SQL, table/column/keyword-এর autocomplete (`Ctrl + Space`), `Ctrl + Enter` দিয়ে চালানো, সিলেক্ট করা অংশ আলাদা চালানো।
- **শেয়ার লিংক:** query আর dataset লিংকের `#` অংশে থাকে, সার্ভারে কিছু যায় না।
- আলো/অন্ধকার থিম, মোবাইলে চলে, কীবোর্ড দিয়ে পুরোটা চালানো যায়।

## চালানো

Node.js 22 বা নতুন ভার্সন লাগবে।

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest (Node-এ আসল sql.js দিয়ে)
npm run lint
npm run build      # out/ ফোল্ডারে স্ট্যাটিক সাইট
npm run test:e2e   # Playwright, build-এর ওপর (desktop আর phone)
```

GitHub Pages-এর মতো sub-path-এর জন্য: `BASE_PATH=/sql-playground npm run build`, তারপর দেখতে `BASE_PATH=/sql-playground node scripts/serve.mjs`।

## কীভাবে কাজ করে

```
public/sql/engine.worker.js   Web Worker: sql.js লোড করে, query চালায়
public/sql/runner.js          statement ভাগ করে চালানো (worker আর টেস্ট দুজনেই ব্যবহার করে)
src/lib/db/                   worker-এর সাথে কথা (client.ts), dataset, schema পড়া
src/lib/sql/tokenize.ts       ছোট SQL tokenizer: highlight, autocomplete, statement ভাগ
src/lib/sql/split.ts          SELECT-কে clause-এ ভাগ করা
src/lib/sql/stages.ts         ধাপে ধাপে: প্রতিটা ধাপের জন্য ছোট query বানিয়ে আসল SQLite-এ চালানো
src/lib/sql/join.ts           JOIN-এর rowid জোড়া
src/lib/sql/explain.ts        বাংলা ব্যাখ্যা
src/lib/sql/errors.ts         SQLite-এর ভুল বাংলায়
src/lib/missions.ts           মিশন, কাজ আর উত্তর যাচাই
src/lib/session.ts            অবস্থা: dataset + DB বদলানো statement-এর তালিকা
src/components/               React UI
scripts/gen-datasets.mjs      নমুনা ডেটা বানায় (seed ঠিক করা, প্রতিবার হুবহু একই)
```

কয়েকটা সিদ্ধান্ত:

- **visualizer নিজে SQL হিসাব করে না।** প্রতিটা ধাপের জন্য মূল query-র টুকরো জুড়ে একটা ছোট SELECT বানিয়ে আসল SQLite-এ চালায়। WHERE-এর শর্ত একটা বাড়তি column হিসেবে হিসাব হয় (`CASE WHEN … THEN 1 ELSE 0 END`), তাই কোন row টিকল আর কোনটা বাদ গেল দুটোই দেখানো যায়। UNION বা WINDOW clause থাকলে ধাপ দেখায় না, তবে ফল ঠিকই আসে।
- **পুরো DB সেভ হয় না।** সেভ হয় dataset-এর নাম আর DB বদলানো statement-গুলো। রিলোডে সেগুলো আবার চালালে একই DB ফিরে আসে। undo মানে শেষটা বাদ দিয়ে আবার চালানো।
- **worker-এ SQLite।** WASM-এর ভেতরের লুপ থামানোর উপায় নেই, তাই সময় পেরোলে worker-টাই বন্ধ করে নতুন একটা চালু হয়, আর আগের বদলগুলো আবার চালানো হয়।

## লাইসেন্স

MIT। [msilabs](https://msilabs.github.io)-এর অংশ।
