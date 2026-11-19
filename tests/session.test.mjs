import { describe, it } from 'node:test';
import { expect, engineWith, Session, Storage, Share } from './helpers.mjs';

const { applyRun, currentLog, freshSession, switchDataset, undoLast } = Session;
const { parseSaved, serialize } = Storage;
const { decodeShare, encodeShare } = Share;
describe("session", () => {
    it("শুধু DB বদলানো সফল statement log-এ যায়, আর log আবার চালালে একই DB", async () => {
        const engine = await engineWith('dokan');
        const text = "SELECT 1; INSERT INTO districts (name, division) VALUES ('ফেনী', 'চট্টগ্রাম'); SELECT * FROM nope; DELETE FROM districts";
        const result = await engine.run(text);
        expect(result.error).toBeDefined();
        const s = applyRun(freshSession(), text, result);
        expect(currentLog(s)).toEqual(["INSERT INTO districts (name, division) VALUES ('ফেনী', 'চট্টগ্রাম');"]);
        expect(s.history).toEqual([text]);
        const replayed = await engineWith('dokan', currentLog(s));
        const r = await replayed.run("SELECT count(*) FROM districts");
        expect(r.statements[0].rows[0][0]).toBe(13);
        expect(currentLog(undoLast(s))).toEqual([]);
    });
    it("dataset বদলালে আগের dataset-এর log থেকে যায়", () => {
        const s = { ...freshSession(), logs: { dokan: ["DELETE FROM orders"], school: [] } };
        const school = switchDataset(s, "school");
        expect(currentLog(school)).toEqual([]);
        expect(currentLog(switchDataset(school, "dokan"))).toEqual(["DELETE FROM orders"]);
    });
});
describe("storage", () => {
    it("সেভ করে আবার পড়া যায়", () => {
        const s = { ...freshSession(), step: 4, history: ["SELECT 1"] };
        expect(parseSaved(serialize(s))).toEqual({ status: "ok", session: s });
    });
    it("নষ্ট সেভ ধরা পড়ে", () => {
        expect(parseSaved(null)).toEqual({ status: "empty" });
        expect(parseSaved("{bad")).toEqual({ status: "corrupt" });
        expect(parseSaved(JSON.stringify({ v: 1, dataset: "x" }))).toEqual({ status: "corrupt" });
        expect(parseSaved(JSON.stringify({ v: 1, dataset: "dokan", editor: "", history: [], logs: { dokan: [1] } }))).toEqual({
            status: "corrupt",
        });
    });
});
describe("share", () => {
    it("বাংলা লেখাসহ query ফেরত আসে", () => {
        const q = "SELECT * FROM customers WHERE name LIKE '%ইসলাম';";
        expect(decodeShare(encodeShare(q, "dokan"))).toEqual({ query: q, dataset: "dokan" });
        expect(decodeShare("#q=abc&d=nope")).toBeNull();
    });
});
