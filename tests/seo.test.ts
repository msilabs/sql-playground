import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE, SITE_DESCRIPTION, SITE_TITLE, STRUCTURED_DATA } from "@/lib/site";

describe("og image", () => {
  const png = readFileSync(new URL("../public/og.png", import.meta.url));

  it("PNG, আর মাপ ১২৮০×৬৪০ (OG আর GitHub social preview দুটোর জন্য)", () => {
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(640);
  });

  it("GitHub-এর সীমা ১ MB-এর নিচে", () => {
    expect(png.length).toBeLessThan(1_000_000);
  });
});

describe("site info", () => {
  it("ছবির URL সাইটের নিজের পথে", () => {
    expect(SITE.image.startsWith(SITE.url)).toBe(true);
  });

  it("title আর description খুব লম্বা নয় (search-এ কাটা পড়ে না)", () => {
    expect(SITE_TITLE.length).toBeLessThanOrEqual(70);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(200);
  });

  it("structured data JSON হিসেবে ঠিক", () => {
    const parsed = JSON.parse(JSON.stringify(STRUCTURED_DATA));
    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.url).toBe(SITE.url);
  });
});
