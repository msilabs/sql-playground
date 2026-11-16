/** SQLite থেকে আসা একটা ঘরের মান */
export type SqlValue = number | string | Uint8Array | null;

/** একটা statement চালানোর ফল */
export interface StatementResult {
  readonly sql: string;
  readonly columns: readonly string[];
  /** প্রথম `maxRows`টা row */
  readonly rows: readonly (readonly SqlValue[])[];
  /** মোট কত row এল (`capped` হলে এর বেশিও হতে পারে) */
  readonly total: number;
  readonly capped: boolean;
  /** কতগুলো row যোগ, বদল বা মোছা হলো */
  readonly changes: number;
  readonly ms: number;
}

export interface RunError {
  readonly message: string;
  readonly sql: string;
}

/** এক টুকরো লেখা (এক বা একাধিক statement) চালানোর ফল */
export interface RunResult {
  readonly statements: readonly StatementResult[];
  readonly error?: RunError;
}

export interface RunOptions {
  readonly maxRows?: number;
  readonly countLimit?: number;
}

/**
 * DB-র সাথে কথা বলার উপায়। ব্রাউজারে worker (client.ts), টেস্টে সরাসরি sql.js।
 * বাকি সব কোড (schema, visualizer, mission) শুধু এটাই দেখে।
 */
export interface Engine {
  /** নতুন DB-তে dataset বসিয়ে `log`-এর statement-গুলো আবার চালায় */
  load(dataset: string, log: readonly string[]): Promise<void>;
  run(sql: string, options?: RunOptions): Promise<RunResult>;
}

/** সময়ের মধ্যে query শেষ হয়নি; DB আবার load করতে হবে */
export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

export const USER_MAX_ROWS = 1000;
export const COUNT_LIMIT = 100_000;

/** ভুল না হলে প্রথম statement-এর ফল; ভুল হলে Error ছোড়ে। ভেতরের ছোট query-র জন্য। */
export async function query(engine: Engine, sql: string, options?: RunOptions): Promise<StatementResult> {
  const result = await engine.run(sql, options);
  if (result.error) throw new Error(result.error.message);
  const first = result.statements[0];
  if (!first) throw new Error("no statement");
  return first;
}
