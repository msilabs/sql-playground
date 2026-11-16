# কাজের নিয়ম

## Commit
- Commit শুধু এই নামে ও ইমেইলে হবে: `msisaif <61042251+msisaif@users.noreply.github.com>`।
- Author ও committer দুটোই এই পরিচয়ে থাকবে।
- Commit মেসেজে কোনো attribution লাইন রাখা যাবে না, যেমন `Co-Authored-By`, `Claude-Session`, "Generated with Claude" বা কোনো মডেলের নাম।

## Push
- মালিক না বললে `git push` করা যাবে না।

## Stack
- Next.js (static export) + TypeScript + Tailwind v4। SQLite চলে sql.js দিয়ে, `public/sql/engine.worker.js`-এ।
- `public/sql/sql-wasm.js` আর `sql-wasm.wasm` হাতে বদলানো যাবে না; `scripts/copy-wasm.mjs` node_modules থেকে কপি করে (gitignore-এ আছে)।
- `public/sql/runner.js` সাধারণ JS, কারণ worker আর Vitest দুজনেই এটা লোড করে। এখানে import বা TypeScript চলবে না।
- `src/lib` React আর ব্রাউজার API ছাড়া থাকবে (ব্যতিক্রম: `db/client.ts`, `storage.ts`, `share.ts`)। বাকি সব কোড `Engine` interface দেখে, তাই Node-এ টেস্ট হয়।
- UI-এর বাংলা লেখা `src/lib/ui-text.ts`-এ। ব্যাখ্যা, ভুল আর ধাপের লেখা তাদের নিজের ফাইলে (`explain.ts`, `errors.ts`, `stages.ts`)। বাংলায় সংখ্যা লিখতে `bn()`।
- নমুনা ডেটা বদলাতে `scripts/gen-datasets.mjs` বদলে `node scripts/gen-datasets.mjs` চালান; `src/lib/db/datasets/*.ts` হাতে বদলাবেন না।
- মিশনে নতুন কাজ শুধু শেষে যোগ করুন, নাহলে পুরোনো সেভের অগ্রগতি সরে যাবে। প্রতিটা সমাধান `tests/missions.test.ts`-এ নিজে নিজে যাচাই হয়।

## যাচাই
- `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` সব ভুল ছাড়া শেষ হতে হবে।
- UI বদলালে `npm run build && npm run test:e2e`।
