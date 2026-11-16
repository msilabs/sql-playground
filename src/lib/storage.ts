/**
 * ব্রাউজারের localStorage-এ সেশন রাখা। প্রাইভেট উইন্ডো, ব্লক করা বা ভরা স্টোরেজে localStorage
 * exception দিতে পারে, তাই প্রতিটা read/write try/catch-এ মোড়ানো।
 */
import { DATASETS, isDatasetId, type DatasetId } from "./db/datasets";
import { MAX_HISTORY, MAX_LOG, freshSession, type Session } from "./session";

const KEY = "msilabs-sql-playground:v1";

export type LoadResult =
  | { readonly status: "empty" }
  | { readonly status: "ok"; readonly session: Session }
  | { readonly status: "corrupt" };

const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

export function parseSaved(raw: string | null): LoadResult {
  if (!raw) return { status: "empty" };
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return { status: "corrupt" };
    const data = d as Record<string, unknown>;
    if (data.v !== 1 || !isDatasetId(data.dataset) || typeof data.editor !== "string") return { status: "corrupt" };
    if (!isStringArray(data.history) || typeof data.logs !== "object" || data.logs === null) return { status: "corrupt" };
    const savedLogs = data.logs as Record<string, unknown>;
    const base = freshSession(data.dataset);
    const logs = { ...base.logs };
    for (const ds of DATASETS) {
      const log = savedLogs[ds.id];
      if (log === undefined) continue;
      if (!isStringArray(log)) return { status: "corrupt" };
      logs[ds.id as DatasetId] = log;
    }
    const step = typeof data.step === "number" && Number.isInteger(data.step) && data.step >= 0 ? data.step : 0;
    return {
      status: "ok",
      session: { dataset: data.dataset, logs, editor: data.editor, history: data.history.slice(-MAX_HISTORY), step },
    };
  } catch {
    return { status: "corrupt" };
  }
}

export function serialize(s: Session): string {
  return JSON.stringify({ v: 1, dataset: s.dataset, logs: s.logs, editor: s.editor, history: s.history, step: s.step });
}

export function loadSession(): LoadResult {
  try {
    return parseSaved(localStorage.getItem(KEY));
  } catch {
    return { status: "empty" };
  }
}

/** সেভ হলে true। বদলের তালিকা খুব লম্বা হলে বা স্টোরেজ না চললে false। */
export function saveSession(s: Session): boolean {
  if (Object.values(s.logs).some((log) => log.length > MAX_LOG)) return false;
  try {
    localStorage.setItem(KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // কিছু করার নেই
  }
}
