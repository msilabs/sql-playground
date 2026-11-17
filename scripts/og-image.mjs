// OG image (আর GitHub social preview) বানায়: public/og.png, মাপ ১২৮০×৬৪০।
// ১২৮০×৬৪০ GitHub-এর জন্য ঠিক মাপ; Facebook, X, WhatsApp ১.৯১:১ ধরে দুই পাশ থেকে সামান্য কাটে,
// তাই সব লেখা চার দিক থেকে অনেক ভেতরে (বাঁ-ডানে ১০৪px, উপর-নিচে ৮৮px) রাখা।
// logo msilabs-এর আসল logo (scripts/assets/msilabs-logo.png), নামের রং সাইটের মতো: msi সাদা, labs mint।
// ফন্ট Google Fonts থেকে আসে, তাই ছবি বানানোর সময় ইন্টারনেট লাগে। চালান: npm run og
// ব্রাউজার অন্য জায়গায় থাকলে: CHROMIUM_PATH=/path/to/chrome npm run og
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "public", "og.png");
const logo = (await readFile(join(import.meta.dirname, "assets", "msilabs-logo.png"))).toString("base64");

const html = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@500;600;700&family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px; height: 640px; overflow: hidden; position: relative;
    font-family: "Inter", "Hind Siliguri", sans-serif; color: #fff;
    background:
      radial-gradient(760px 420px at 92% 0%, rgba(30, 214, 168, 0.14), transparent 65%),
      linear-gradient(135deg, #14213d 0%, #0e182d 100%);
  }
  .strip { position: absolute; left: 0; right: 0; top: 0; height: 6px; background: linear-gradient(90deg, #1ed6a8, #ffb020); }

  .wrap { position: absolute; left: 104px; right: 104px; top: 88px; bottom: 88px; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; margin-top: 16px; }
  .brand img { width: 68px; height: 68px; display: block; }
  .wm { font-size: 40px; font-weight: 700; letter-spacing: -0.5px; }
  .wm b { color: #1ed6a8; font-weight: 800; }

  .main { display: flex; align-items: center; }
  .copy { width: 590px; }
  h1 { font-size: 70px; line-height: 1.05; font-weight: 800; letter-spacing: -2px; white-space: nowrap; }
  h1 em { font-style: normal; color: #1ed6a8; }
  .lead { margin-top: 24px; font-size: 40px; line-height: 1.3; font-weight: 600; font-family: "Hind Siliguri", "Inter", sans-serif; }
  .sub { margin-top: 12px; font-size: 25px; line-height: 1.45; font-weight: 500; color: #aab6d0; font-family: "Hind Siliguri", "Inter", sans-serif; }

  .card { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: 380px; border-radius: 18px; overflow: hidden; background: #131d33; box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 0 0 1.5px rgba(255,255,255,0.09); }
  .code { padding: 18px 22px; font: 500 20px/1.6 "JetBrains Mono", monospace; background: #0f1930; }
  .kw { color: #1ed6a8; } .fn { color: #8ab4ff; }
  table { width: 100%; border-collapse: collapse; font-size: 20px; font-family: "Hind Siliguri", "Inter", sans-serif; }
  th { text-align: left; padding: 8px 22px; font: 700 14px "JetBrains Mono", monospace; color: #9aa6c0; background: #1b2742; }
  td { padding: 9px 22px; font-weight: 500; }
  td.num { text-align: right; font-family: "JetBrains Mono", monospace; font-size: 18px; }
  tr.g1 td { background: rgba(30,214,168,0.15); } tr.g1 td:first-child { box-shadow: inset 5px 0 0 #1ed6a8; }
  tr.g2 td { background: rgba(111,104,255,0.22); } tr.g2 td:first-child { box-shadow: inset 5px 0 0 #6f68ff; }
  tr.g3 td { background: rgba(255,176,32,0.15); } tr.g3 td:first-child { box-shadow: inset 5px 0 0 #ffb020; }

  .url { font: 500 22px "JetBrains Mono", monospace; color: #7f8cab; margin-bottom: 26px; }
</style>
</head>
<body>
  <div class="strip"></div>
  <div class="wrap">
    <div class="brand"><img src="data:image/png;base64,${logo}" alt=""><span class="wm">msi<b>labs</b></span></div>

    <div class="main">
      <div class="copy">
        <h1>SQL <em>Playground</em></h1>
        <p class="lead">বাংলায় SQL শেখার জায়গা</p>
        <p class="sub">ব্রাউজারেই আসল SQLite, query-র ধাপ চোখে দেখুন</p>
      </div>

      <div class="card">
        <div class="code"><span class="kw">SELECT</span> category, <span class="fn">count</span>(*)<br><span class="kw">FROM</span> products<br><span class="kw">GROUP BY</span> category;</div>
        <table>
          <tr><th>category</th><th style="text-align:right">price</th></tr>
          <tr class="g1"><td>ইলেকট্রনিক্স</td><td class="num">1200</td></tr>
          <tr class="g1"><td>ইলেকট্রনিক্স</td><td class="num">1500</td></tr>
          <tr class="g2"><td>খাবার</td><td class="num">420</td></tr>
          <tr class="g2"><td>খাবার</td><td class="num">140</td></tr>
          <tr class="g3"><td>ঘরের জিনিস</td><td class="num">2800</td></tr>
        </table>
      </div>
    </div>

    <p class="url">msilabs.github.io/sql-playground</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await mkdir(join(root, "public"), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
