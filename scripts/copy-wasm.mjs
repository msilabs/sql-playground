// sql.js-এর loader আর WASM ফাইল public/sql/-এ কপি করে, যাতে worker সেগুলো একই ফোল্ডার থেকে পায়।
// dev, build আর test-এর আগে নিজে থেকেই চলে (package.json-এর pre-script)।
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("sql.js"));
const target = join(import.meta.dirname, "..", "public", "sql");

await mkdir(target, { recursive: true });
for (const file of ["sql-wasm.js", "sql-wasm.wasm"]) {
  await copyFile(join(dist, file), join(target, file));
}
