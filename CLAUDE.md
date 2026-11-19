# কাজের নিয়ম

## Commit
- Commit শুধু এই নামে ও ইমেইলে হবে: `msisaif <61042251+msisaif@users.noreply.github.com>`।
- Author ও committer দুটোই এই পরিচয়ে থাকবে।
- Commit মেসেজে কোনো attribution লাইন রাখা যাবে না, যেমন `Co-Authored-By`, `Claude-Session`, "Generated with Claude" বা কোনো মডেলের নাম।

## Push
- মালিক না বললে `git push` করা যাবে না।

## Stack
- সাইট [Alo](https://github.com/msilabs/alo) (`@msilabs/alo`) দিয়ে বানানো। কোনো `.alo` ফাইল বদলানোর আগে `AGENTS.md` পড়তে হবে।
- `@msilabs/alo` আর `sql.js` ছাড়া কোনো npm package যোগ করা যাবে না।
- SQLite চলে sql.js দিয়ে, `public/sql/engine.worker.js`-এ। `public/sql/sql-wasm.js` আর `sql-wasm.wasm` হাতে বদলানো যাবে না; `scripts/copy-wasm.mjs` node_modules থেকে কপি করে (dev, build আর test-এর আগে নিজে চলে, gitignore-এ আছে)।
- `public/sql/runner.js` সাধারণ JS, কারণ worker আর টেস্ট দুজনেই এটা লোড করে।
- Alo `global/*.js` নামের ক্রমে জোড়ে। `01`–`16` engine: DOM ছাড়া চলে, Node-এও `require` করা যায়। DOM-এর কাজ শুধু `8x-`/`9x-` ফাইলে, আর সেগুলো নিজের পেজের element না পেলে কিছু করে না। যে ফাইল load-এর সময় অন্য ফাইল পড়ে, তার নম্বর সেই ফাইলের পরে হতে হবে।
- CSS `global/style.css`-এ। JS-এ বানানো HTML-এ scoped `<style>` পৌঁছায় না।
- UI-এর বাংলা লেখা `global/11-text.js`-এ। ব্যাখ্যা, ভুল আর ধাপের লেখা তাদের নিজের ফাইলে (`07-explain.js`, `08-errors.js`, `06-stages.js`)। বাংলায় সংখ্যা লিখতে `bn()`।
- নমুনা ডেটা বদলাতে `scripts/gen-datasets.mjs` বদলে `node scripts/gen-datasets.mjs` চালান; `public/sql/datasets.js` হাতে বদলাবেন না।
- পাঠ `data/learn/*.md`-এ। ```` ```sql ```` বাক্স চালানো যায় (দোকানের ডেটা), ```` ```sql-school ```` স্কুলের ডেটা, ```` ```syntax ```` শুধু রঙিন কোড। ইচ্ছা করে ভুল দেখানো বাক্সে `-- ভুল হবে` লিখুন।
- challenge `data/challenges/NN-slug.json`-এ। নতুন challenge শুধু শেষে যোগ করুন: আগের ভার্সনের অগ্রগতি (একটা সংখ্যা) প্রথম কয়টা challenge শেষ ধরে।
- `[slug]` পেজের ডেটা ফোল্ডারের নাম route-এর নামের সাথে মিলতে হয়: `pages/learn/[slug]` পড়ে `data/learn/`।

## যাচাই
- `npm test` আর `npm run build` দুটোই ভুল ছাড়া শেষ হতে হবে। `npm test`-এ engine, প্রতিটা পাঠের প্রতিটা SQL বাক্স, প্রতিটা challenge-এর সমাধান আর আসল Chrome-এ browser test চলে।
- `dist/` আর `.alo/` হাতে বদলানো যাবে না।
