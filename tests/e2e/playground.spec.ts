import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.getByRole("textbox", { name: "SQL লিখুন" });

/** SQLite চালু হয়ে চালান বোতাম সক্রিয় হওয়া পর্যন্ত */
async function waitReady(page: Page) {
  await expect(page.getByText("SQLite চালু হচ্ছে…")).toBeHidden({ timeout: 15000 });
  // মোবাইলে অন্য tab খোলা থাকলে বোতাম লুকানো, তাই role দিয়ে নয় (role লুকানো element খোঁজে না)
  await expect(page.locator("button").filter({ hasText: "চালান" })).toBeEnabled({ timeout: 15000 });
}

/** Next.js-এর নিজের route announcer-ও role="alert", তাই লেখা দিয়ে আলাদা করি */
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

/** ছোট পর্দায় নিচের tab বদলায়; বড় পর্দায় tab নেই, সব অংশ দেখাই যায় */
async function openTab(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "অংশ বদলান" });
  if (await nav.isVisible()) await nav.getByRole("button", { name, exact: true }).click();
}

/** table-এর তালিকায় খোলা-বন্ধের বোতাম (নাম: "orders ৬০টা row") */
const tableToggle = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}\\b.*row$`) });

async function runSql(page: Page, sql: string) {
  await editor(page).fill(sql);
  await page.getByRole("button", { name: /চালান/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitReady(page);
});

test("query চালালে ফল, বাংলা ব্যাখ্যা আর ধাপ আসে", async ({ page }) => {
  await page.getByRole("button", { name: /চালান/ }).click();
  await expect(page.getByText("ফল: ৯টা row।")).toBeVisible();
  await expect(page.getByRole("cell", { name: "স্মার্ট ওয়াচ" }).first()).toBeVisible();
  await openTab(page, "কীভাবে চলে");
  await page.getByRole("button", { name: "২. WHERE" }).click();
  await expect(page.getByText(/২০টা row-এর মধ্যে ৯টা শর্ত মেনেছে/)).toBeVisible();
});

test("ভুল query-তে বাংলায় ভুল আর ইঙ্গিত", async ({ page }) => {
  await runSql(page, "SELECT custmer_id FROM orders");
  const alert = alertWith(page, "custmer_id নামে কোনো column নেই");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("customer_id বোঝাতে চেয়েছেন");
});

test("JOIN-এর ছবি", async ({ page }) => {
  await runSql(page, "SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id");
  await openTab(page, "কীভাবে চলে");
  await page.getByRole("tab", { name: "JOIN" }).click();
  await expect(page.getByText("LEFT JOIN ON o.customer_id = c.id")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("NULL", { exact: true }).first()).toBeVisible();
});

test("mission-এর কাজ শেষ হলে অগ্রগতি বাড়ে", async ({ page }) => {
  await runSql(page, "SELECT * FROM products;");
  await openTab(page, "মিশন ও ডেটা");
  await expect(page.getByText("ঠিক হয়েছে! পরের কাজ খুলেছে।")).toBeVisible();
  await expect(page.getByText("১ / ২৮টা কাজ শেষ")).toBeVisible();
});

test("রিলোডের পর DB-র বদল আর editor ফিরে আসে, undo কাজ করে", async ({ page }) => {
  await runSql(page, "INSERT INTO districts (name, division) VALUES ('ফেনী', 'চট্টগ্রাম');");
  await expect(page.getByText("১টা নতুন row যোগ হলো")).toBeVisible();
  await page.reload();
  await waitReady(page);
  await expect(editor(page)).toHaveValue(/ফেনী/);
  await runSql(page, "SELECT count(*) FROM districts;");
  await expect(page.getByRole("cell", { name: "13", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "শেষ বদলটা বাতিল করুন" }).click();
  await waitReady(page);
  await runSql(page, "SELECT count(*) FROM districts;");
  await expect(page.getByRole("cell", { name: "12", exact: true }).first()).toBeVisible();
});

test("শেষ না হওয়া query থামে, তারপর আবার কাজ করে", async ({ page }) => {
  await runSql(page, "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n;");
  await expect(alertWith(page, "অনেক সময় নিচ্ছিল")).toBeVisible({ timeout: 10000 });
  await waitReady(page);
  await runSql(page, "SELECT count(*) FROM orders;");
  await expect(page.getByText("ফল: ১টা row।")).toBeVisible();
});

test("editor-এর রঙিন লেখা আর textarea-র লেখা একই প্রস্থের (cursor ঠিক জায়গায় থাকে)", async ({ page }) => {
  await editor(page).fill("SELECT * FROM t;");
  const { textareaWidth, layerWidth, family } = await page.evaluate(() => {
    const ta = document.querySelector("textarea") as HTMLTextAreaElement;
    const layer = document.querySelector("pre.editor-layer") as HTMLElement;
    const spans = [...layer.querySelectorAll("span")];
    const first = spans[0].getBoundingClientRect();
    const last = spans[spans.length - 1].getBoundingClientRect();
    const probe = document.createElement("span");
    const style = getComputedStyle(ta);
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontVariantLigatures = "none";
    probe.textContent = ta.value;
    document.body.append(probe);
    const textareaWidth = probe.getBoundingClientRect().width;
    probe.remove();
    return { textareaWidth, layerWidth: last.right - first.left, family: getComputedStyle(layer).fontFamily };
  });
  expect(family).toContain("mono");
  expect(Math.abs(textareaWidth - layerWidth)).toBeLessThan(1);
});

test("table ভাঁজ করা থাকে, query-তে নাম থাকলে খোলে, চাপলে খোলে-বন্ধ হয়", async ({ page }) => {
  await openTab(page, "মিশন ও ডেটা");
  const orders = tableToggle(page, "orders");
  await expect(orders).toHaveAttribute("aria-expanded", "false");
  // শুরুর query-তে products আছে, তাই সেটা খোলা
  await expect(tableToggle(page, "products")).toHaveAttribute("aria-expanded", "true");
  await orders.click();
  await expect(orders).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "customer_id" }).first()).toBeVisible();
  await orders.click();
  await expect(orders).toHaveAttribute("aria-expanded", "false");
});

test("স্কুলের ডেটায় গিয়ে আবার দোকানে ফেরা যায়", async ({ page }) => {
  await openTab(page, "মিশন ও ডেটা");
  await page.getByRole("button", { name: "স্কুলের ডেটায় অনুশীলন করুন" }).click();
  await waitReady(page);
  await openTab(page, "মিশন ও ডেটা");
  await expect(tableToggle(page, "students")).toBeVisible();
  await page.getByRole("button", { name: "অনলাইন দোকানের ডেটায় ফিরুন" }).click();
  await waitReady(page);
  await openTab(page, "মিশন ও ডেটা");
  await expect(tableToggle(page, "customers")).toBeVisible();
});
