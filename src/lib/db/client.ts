/**
 * ব্রাউজারের Engine: SQLite চলে public/sql/engine.worker.js-এ।
 *
 * কোনো কাজ TIMEOUT_MS-এর বেশি সময় নিলে worker বন্ধ করে দেওয়া হয় (WASM-এর ভেতরের লুপ অন্যভাবে
 * থামানো যায় না) আর TimeoutError ছোড়া হয়। পরের `load` নতুন worker চালু করে।
 */
import { COUNT_LIMIT, TimeoutError, USER_MAX_ROWS, type Engine, type RunOptions, type RunResult } from "./types";

const TIMEOUT_MS = 3000;
/** dataset বড় হলে প্রথমবার WASM লোডসহ একটু বেশি সময় লাগতে পারে */
const LOAD_TIMEOUT_MS = 15000;
/** নতুন deploy-এর পর পুরোনো worker cache থেকে না আসার জন্য */
const WORKER_VERSION = "1";

const workerUrl = () => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sql/engine.worker.js?v=${WORKER_VERSION}`;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

type Reply = { id: number; ok: true; result?: RunResult; failed?: number } | { id: number; ok: false; error: string };

export class WorkerEngine implements Engine {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(workerUrl());
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = this.pending.get(reply.id);
      if (!entry) return;
      this.pending.delete(reply.id);
      clearTimeout(entry.timer);
      if (reply.ok) entry.resolve(reply.result ?? reply.failed ?? null);
      else entry.reject(new Error(reply.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.kill(new Error(event.message || "worker error"));
    };
    this.worker = worker;
    return worker;
  }

  /** worker বন্ধ করে, অপেক্ষায় থাকা সব কাজ বাতিল করে */
  private kill(error: Error) {
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private send<T>(message: Record<string, unknown>, timeout: number): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.kill(new TimeoutError()), timeout);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      worker.postMessage({ ...message, id });
    });
  }

  async load(dataset: string, log: readonly string[]): Promise<void> {
    await this.send<number>({ type: "load", dataset, log: [...log] }, LOAD_TIMEOUT_MS);
  }

  run(sql: string, options: RunOptions = {}): Promise<RunResult> {
    return this.send<RunResult>(
      {
        type: "run",
        sql,
        maxRows: options.maxRows ?? USER_MAX_ROWS,
        countLimit: options.countLimit ?? COUNT_LIMIT,
      },
      TIMEOUT_MS,
    );
  }

  dispose() {
    this.kill(new Error("disposed"));
  }
}
