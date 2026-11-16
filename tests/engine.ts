/** টেস্টের Engine: worker ছাড়া, Node-এ সরাসরি sql.js আর একই runner.js দিয়ে। */
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import type { Engine, RunOptions, RunResult } from "@/lib/db/types";
import { COUNT_LIMIT, USER_MAX_ROWS } from "@/lib/db/types";

const require = createRequire(import.meta.url);
const runner = require("../public/sql/runner.js") as {
  runScript: (db: unknown, sql: string, maxRows: number, countLimit: number) => RunResult;
  loadDatabase: (SQL: unknown, dataset: string, log: readonly string[]) => { db: { close(): void } };
};

const SQL = await initSqlJs();

export class NodeEngine implements Engine {
  private db: { close(): void } | null = null;

  async load(dataset: string, log: readonly string[]): Promise<void> {
    this.db?.close();
    this.db = runner.loadDatabase(SQL, dataset, log).db;
  }

  async run(sql: string, options: RunOptions = {}): Promise<RunResult> {
    if (!this.db) throw new Error("database not loaded");
    return runner.runScript(this.db, sql, options.maxRows ?? USER_MAX_ROWS, options.countLimit ?? COUNT_LIMIT);
  }
}

export async function engineWith(dataset: string, log: readonly string[] = []): Promise<NodeEngine> {
  const engine = new NodeEngine();
  await engine.load(dataset, log);
  return engine;
}
