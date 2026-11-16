"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WorkerEngine } from "@/lib/db/client";
import { datasetById, type DatasetId } from "@/lib/db/datasets";
import { EMPTY_SCHEMA, loadSchema, type SchemaInfo } from "@/lib/db/schema";
import { TimeoutError, type RunResult, type StatementResult } from "@/lib/db/types";
import { MISSIONS, MISSION_DATASET, checkTask, missionAt, taskAt } from "@/lib/missions";
import {
  applyRun,
  currentLog,
  freshSession,
  mutationsOf,
  resetDataset,
  switchDataset,
  undoLast,
  type Session,
} from "@/lib/session";
import { decodeShare, encodeShare } from "@/lib/share";
import { TIMEOUT_ERROR, friendlyError } from "@/lib/sql/errors";
import { explainStatement } from "@/lib/sql/explain";
import { buildJoinView, parseJoin } from "@/lib/sql/join";
import { splitSelect } from "@/lib/sql/split";
import { runStages } from "@/lib/sql/stages";
import { splitStatements, statementKind } from "@/lib/sql/tokenize";
import { clearSession, loadSession, saveSession } from "@/lib/storage";
import { ui } from "@/lib/ui-text";
import { Editor, type EditorHandle } from "./Editor";
import { InsightPanel, type Insight } from "./InsightPanel";
import { MissionPanel, type Feedback } from "./MissionPanel";
import { ResultPanel, type Output } from "./ResultPanel";
import { SchemaPanel } from "./SchemaPanel";
import { ThemeToggle } from "./ThemeToggle";

type DbStatus = "loading" | "ready" | "running" | "failed";

const buttonOutline =
  "rounded-lg px-2.5 py-2 text-sm font-semibold text-teal ring-1 ring-teal/30 transition hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:px-3";

/** ভুলের বার্তায় দেখানোর জন্য বাকি লেখার প্রথম statement */
const firstStatement = (sql: string) => splitStatements(sql)[0]?.text ?? sql;

/** এবারের চালানোয় শেষ যে statement row দিয়েছে */
const lastWithRows = (result: RunResult): StatementResult | null =>
  [...result.statements].reverse().find((s) => s.columns.length > 0) ?? null;

export function Playground() {
  const [session, setSession] = useState<Session>(() => freshSession());
  const sessionRef = useRef(session);
  const [saveFailed, setSaveFailed] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus>("loading");
  const [schema, setSchema] = useState<SchemaInfo>(EMPTY_SCHEMA);
  const [output, setOutput] = useState<Output | null>(null);
  const [insight, setInsight] = useState<Insight>({ status: "idle" });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const engineRef = useRef<WorkerEngine | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const runId = useRef(0);
  // সেভ করা অবস্থা পড়ার আগে সেভ করলে পুরোনো কাজ মুছে যেত
  const loadedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  /** session বদলানোর একমাত্র পথ, যাতে async কাজের ভেতরেও সবসময় সর্বশেষ অবস্থা পাওয়া যায় */
  const update = useCallback((fn: (s: Session) => Session): Session => {
    const next = fn(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
    if (loadedRef.current) setSaveFailed(!saveSession(next));
    return next;
  }, []);

  /** dataset আর বদলের তালিকা দিয়ে DB নতুন করে বানায় */
  const loadDb = useCallback(async (s: Session) => {
    const engine = engineRef.current;
    if (!engine) return;
    setDbStatus("loading");
    try {
      await engine.load(datasetById(s.dataset).sql, currentLog(s));
      setSchema(await loadSchema(engine));
      setDbStatus("ready");
    } catch {
      setDbStatus("failed");
    }
  }, []);

  // প্রথমবার: সেভ করা অবস্থা বা শেয়ার লিংক, তারপর worker চালু
  useEffect(() => {
    const engine = new WorkerEngine();
    engineRef.current = engine;
    const saved = loadSession();
    if (saved.status === "corrupt") clearSession();
    let initial = saved.status === "ok" ? saved.session : freshSession();
    const shared = decodeShare(window.location.hash);
    if (shared) {
      initial = { ...switchDataset(initial, shared.dataset), editor: shared.query };
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    sessionRef.current = initial;
    loadedRef.current = true;
    if (shared) saveSession(initial);
    /* eslint-disable react-hooks/set-state-in-effect -- বাইরের স্টোরেজ আর URL-এর সাথে একবার মেলানো */
    setSession(initial);
    if (shared) setNotice(ui.sharedLoaded);
    /* eslint-enable react-hooks/set-state-in-effect */
    void loadDb(initial);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [loadDb]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** SELECT হলে ধাপ আর JOIN-এর ছবি */
  const analyze = async (sql: string, id: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    setInsight({ status: "loading" });
    try {
      const stages = await runStages(engine, sql);
      const split = splitSelect(sql);
      const hasJoin = split.ok && split.query.from !== undefined && parseJoin(split.query.from) !== null;
      const join = hasJoin ? await buildJoinView(engine, sql) : null;
      if (runId.current === id) setInsight({ status: "ready", id, stages, join, hasJoin });
    } catch (e) {
      if (runId.current === id) setInsight({ status: "idle" });
      if (e instanceof TimeoutError) await loadDb(sessionRef.current);
    }
  };

  const checkMission = async (text: string, result: RunResult, changedDb: boolean) => {
    const s = sessionRef.current;
    // শুরুর নমুনা query mission-এর চেষ্টা নয়; সেটায় "মেলেনি" দেখানো ঠিক না
    const isStarter = text.trim() === datasetById(s.dataset).starter.trim();
    const task = taskAt(s.step);
    const engine = engineRef.current;
    if (!engine || !task || s.dataset !== MISSION_DATASET) return;
    if (result.error && !(changedDb && task.check === "state")) return;
    try {
      const outcome = await checkTask(engine, task, lastWithRows(result), changedDb);
      if (outcome.status === "pass") {
        const before = missionAt(s.step);
        const next = update((cur) => ({ ...cur, step: cur.step + 1 }));
        const after = missionAt(next.step);
        setFeedback({ kind: "pass", missionTitle: after.index !== before.index ? MISSIONS[before.index].title : undefined });
      } else if (outcome.status === "fail" && !isStarter) setFeedback({ kind: "fail", outcome });
      else setFeedback(null);
    } catch {
      // ব্যবহারকারী table মুছে ফেললে সমাধানও চলবে না; তখন চুপ থাকি
    }
  };

  const run = async (text: string) => {
    const engine = engineRef.current;
    if (!engine || dbStatus !== "ready" || !text.trim()) return;
    const id = ++runId.current;
    setDbStatus("running");
    setNotice(null);

    let result: RunResult;
    try {
      result = await engine.run(text);
    } catch (e) {
      const friendly = e instanceof TimeoutError ? TIMEOUT_ERROR : friendlyError(e instanceof Error ? e.message : String(e), schema);
      setOutput({ id, statements: [], error: { sql: "", message: e instanceof TimeoutError ? "" : String(e), friendly } });
      setInsight({ status: "idle" });
      setFeedback(null);
      await loadDb(sessionRef.current);
      return;
    }

    update((s) => applyRun(s, text, result));
    const changedDb = mutationsOf(result).length > 0;
    let currentSchema = schema;
    if (changedDb) {
      try {
        currentSchema = await loadSchema(engine);
        setSchema(currentSchema);
      } catch {
        // schema না এলেও ফল দেখাই
      }
    }

    const last = result.statements.at(-1);
    setOutput({
      id,
      statements: result.statements,
      error: result.error
        ? {
            sql: firstStatement(result.error.sql),
            message: result.error.message,
            friendly: friendlyError(result.error.message, currentSchema),
          }
        : undefined,
      explanation: last && !result.error ? explainStatement(last.sql, last) : undefined,
    });
    setDbStatus("ready");

    if (!result.error && last && statementKind(last.sql) === "select") void analyze(last.sql, id);
    else if (!result.error && last) {
      const stages = await runStages(engine, last.sql);
      setInsight({ status: "ready", id, stages, join: null, hasJoin: false });
    } else setInsight({ status: "idle" });

    await checkMission(text, result, changedDb);
  };

  const rebuild = async (next: Session, message: string | null) => {
    runId.current++;
    setOutput(null);
    setInsight({ status: "idle" });
    setFeedback(null);
    await loadDb(next);
    setNotice(message);
  };

  const undo = () => {
    const log = currentLog(sessionRef.current);
    const lastSql = log[log.length - 1];
    if (!lastSql) return;
    void rebuild(update(undoLast), ui.undone(lastSql));
  };

  const reset = () => {
    setConfirmReset(false);
    void rebuild(update(resetDataset), ui.resetDone);
  };

  const changeDataset = (id: DatasetId) => {
    if (id === sessionRef.current.dataset) return;
    void rebuild(update((s) => switchDataset(s, id)), null);
  };

  const share = async () => {
    const s = sessionRef.current;
    const url = `${window.location.origin}${window.location.pathname}${encodeShare(s.editor, s.dataset)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(ui.shareCopied);
    } catch {
      setNotice(ui.shareFailed);
    }
  };

  const setEditor = (text: string) => update((s) => ({ ...s, editor: text }));

  const applySolution = (sql: string) => {
    setEditor(sql);
    editorRef.current?.focus();
  };

  const viewTable = (table: string) => {
    const sql = `SELECT * FROM ${/^[a-z_][a-z0-9_]*$/i.test(table) ? table : `"${table}"`} LIMIT 50;`;
    setEditor(sql);
    void run(sql);
  };

  // মোডাল খোলা থাকলে Tab শুধু মোডালের বোতামগুলোর মধ্যেই ঘোরে
  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") setConfirmReset(false);
    if (e.key !== "Tab" || !dialogRef.current) return;
    const buttons = [...dialogRef.current.querySelectorAll("button")];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const log = currentLog(session);
  const lastChange = log[log.length - 1];
  const busy = dbStatus !== "ready";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/10 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink font-mono text-lg font-bold text-mint dark:ring-1 dark:ring-mint/40"
              aria-hidden
            >
              m
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-fg sm:text-lg">{ui.appTitle}</h1>
              <p className="hidden text-xs text-muted sm:block">{ui.tagline}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!lastChange || busy}
              title={lastChange ? ui.undoTitle(lastChange) : ui.undoNone}
              aria-label={ui.undoLabel}
              className={buttonOutline}
            >
              ↶<span className="hidden sm:inline"> {ui.undo}</span>
            </button>
            <button type="button" onClick={share} aria-label={ui.shareLabel} title={ui.shareLabel} className={buttonOutline}>
              <span aria-hidden className="sm:hidden">
                ⤴
              </span>
              <span className="hidden sm:inline">{ui.share}</span>
            </button>
            <ThemeToggle className={buttonOutline} />
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={busy}
              aria-label={ui.reset}
              title={ui.reset}
              className="rounded-lg bg-fg px-2.5 py-2 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-40 sm:px-3"
            >
              <span aria-hidden className="sm:hidden">
                ↺
              </span>
              <span className="hidden sm:inline">{ui.reset}</span>
            </button>
          </div>
        </div>
        {saveFailed && (
          <p role="status" className="border-t border-sun/40 bg-warn-bg px-4 py-1.5 text-center text-xs text-fg">
            ⚠ {ui.saveFailed}
          </p>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 items-start gap-4 p-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_minmax(0,30rem)]">
        <aside className="flex min-w-0 flex-col gap-4 lg:row-span-2 xl:row-span-1">
          <MissionPanel
            step={session.step}
            onMissionDataset={session.dataset === MISSION_DATASET}
            feedback={feedback}
            onUseSolution={applySolution}
            onSkip={() => {
              update((s) => ({ ...s, step: s.step + 1 }));
              setFeedback(null);
            }}
            onRestart={() => {
              update((s) => ({ ...s, step: 0 }));
              setFeedback(null);
            }}
            onSwitchDataset={() => changeDataset(MISSION_DATASET)}
          />
          <SchemaPanel
            schema={schema}
            dataset={session.dataset}
            disabled={busy}
            onDataset={changeDataset}
            onInsert={(text) => editorRef.current?.insert(text)}
            onView={viewTable}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label={ui.editorLabel} className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => editorRef.current?.run()}
                  disabled={busy}
                  className="rounded-lg bg-mint px-4 py-2 text-sm font-bold text-ink shadow-sm transition hover:brightness-95 disabled:opacity-50"
                >
                  ▶ {dbStatus === "running" ? ui.running : ui.run}
                </button>
                <kbd className="hidden rounded-md bg-chip px-1.5 py-0.5 font-mono text-[11px] text-muted ring-1 ring-line/10 sm:inline">
                  {ui.runShortcut}
                </kbd>
              </div>
              <select
                aria-label={ui.history}
                value=""
                onChange={(e) => e.target.value && setEditor(e.target.value)}
                className="max-w-[12rem] rounded-lg bg-chip px-2 py-1.5 text-xs text-fg ring-1 ring-line/15"
              >
                <option value="">{session.history.length ? ui.history : ui.historyEmpty}</option>
                {[...session.history].reverse().map((h) => (
                  <option key={h} value={h}>
                    {h.replace(/\s+/g, " ").slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>
            <Editor ref={editorRef} value={session.editor} onChange={setEditor} onRun={run} schema={schema} />
            {dbStatus === "loading" && <p className="mt-1 animate-pulse text-xs text-muted">{ui.loadingDb}</p>}
            {dbStatus === "failed" && (
              <p role="alert" className="mt-1 text-sm font-semibold text-drop">
                {ui.loadFailed}
              </p>
            )}
            {notice && (
              <p role="status" className="pop-in mt-2 rounded-lg bg-chip px-3 py-2 font-mono text-xs text-fg">
                {notice}
              </p>
            )}
          </section>
          <ResultPanel output={output} busy={dbStatus === "running"} />
        </div>

        <div className="min-w-0 lg:col-start-2 xl:col-start-3">
          <InsightPanel insight={insight} />
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-muted">
        {ui.footer} ·{" "}
        <a className="underline hover:text-fg" href="https://github.com/msilabs/sql-playground">
          {ui.github}
        </a>
      </footer>

      {confirmReset && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          aria-describedby="reset-body"
          onKeyDown={trapFocus}
        >
          <div ref={dialogRef} className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
            <h2 id="reset-title" className="text-lg font-bold text-fg">
              {ui.resetTitle}
            </h2>
            <p id="reset-body" className="mt-2 text-sm text-muted">
              {ui.resetBody}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmReset(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-fg ring-1 ring-line/20 hover:bg-chip"
              >
                {ui.resetCancel}
              </button>
              <button type="button" onClick={reset} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                {ui.resetConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
