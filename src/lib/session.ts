/**
 * Playground-এর অবস্থা (pure, React ছাড়া)।
 *
 * DB-র পুরো অবস্থা সেভ করা হয় না। রাখা হয় dataset আর তার ওপর চালানো DB-বদলানো statement-এর
 * তালিকা (`logs`)। রিলোডে dataset বসিয়ে statement-গুলো আবার চালালে একই DB ফিরে আসে।
 * undo মানে তালিকার শেষটা বাদ দিয়ে আবার চালানো।
 */
import { DATASETS, DEFAULT_DATASET, datasetById, type DatasetId } from "./db/datasets";
import type { RunResult } from "./db/types";
import { isReadOnly } from "./sql/tokenize";

export interface Session {
  readonly dataset: DatasetId;
  /** প্রতিটা dataset-এর জন্য আলাদা বদলের তালিকা */
  readonly logs: Readonly<Record<DatasetId, readonly string[]>>;
  readonly editor: string;
  /** আগে চালানো query, নতুনটা শেষে */
  readonly history: readonly string[];
  /** mission-এর অগ্রগতি (কয়টা কাজ শেষ) */
  readonly step: number;
}

export const MAX_HISTORY = 30;
/** এর বেশি বদল জমলে আর সেভ হয় না (রিসেট করলে আবার হয়) */
export const MAX_LOG = 400;

const emptyLogs = (): Record<DatasetId, string[]> =>
  Object.fromEntries(DATASETS.map((d) => [d.id, []])) as unknown as Record<DatasetId, string[]>;

export function freshSession(dataset: DatasetId = DEFAULT_DATASET): Session {
  return { dataset, logs: emptyLogs(), editor: datasetById(dataset).starter, history: [], step: 0 };
}

export const currentLog = (s: Session): readonly string[] => s.logs[s.dataset] ?? [];

/** এবার যে statement-গুলো DB বদলেছে (সফলগুলো) */
export const mutationsOf = (result: RunResult): string[] =>
  result.statements.filter((st) => !isReadOnly(st.sql)).map((st) => st.sql);

export function applyRun(s: Session, text: string, result: RunResult): Session {
  const mutations = mutationsOf(result);
  const trimmed = text.trim();
  const history = trimmed ? [...s.history.filter((h) => h !== trimmed), trimmed].slice(-MAX_HISTORY) : s.history;
  return {
    ...s,
    history,
    logs: mutations.length ? { ...s.logs, [s.dataset]: [...currentLog(s), ...mutations] } : s.logs,
  };
}

export function undoLast(s: Session): Session {
  const log = currentLog(s);
  if (log.length === 0) return s;
  return { ...s, logs: { ...s.logs, [s.dataset]: log.slice(0, -1) } };
}

export function resetDataset(s: Session): Session {
  return { ...s, logs: { ...s.logs, [s.dataset]: [] } };
}

export function switchDataset(s: Session, dataset: DatasetId): Session {
  if (dataset === s.dataset) return s;
  return { ...s, dataset, editor: datasetById(dataset).starter };
}
