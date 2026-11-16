"use client";

import { useState } from "react";
import { MISSIONS, TOTAL_TASKS, missionAt, type CheckOutcome } from "@/lib/missions";
import { ui } from "@/lib/ui-text";
import { RichText } from "./RichText";
import { Cell } from "./ResultTable";

export type Feedback =
  | { readonly kind: "pass"; readonly missionTitle?: string }
  | { readonly kind: "fail"; readonly outcome: Extract<CheckOutcome, { status: "fail" }> };

interface Props {
  readonly step: number;
  readonly onMissionDataset: boolean;
  readonly feedback: Feedback | null;
  readonly onUseSolution: (sql: string) => void;
  readonly onSkip: () => void;
  readonly onRestart: () => void;
  readonly onSwitchDataset: () => void;
}

const codeClass = "rounded bg-chip px-1 font-mono text-[0.9em] text-fg ring-1 ring-line/10";

function FeedbackView({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === "pass") {
    return (
      <p role="status" className="pop-in rounded-xl bg-keep/10 px-3 py-2 text-sm font-semibold text-keep ring-1 ring-keep/30">
        ✓ {feedback.missionTitle ? ui.missionPassed(feedback.missionTitle) : ui.passed}
      </p>
    );
  }
  const o = feedback.outcome;
  const text =
    o.reason === "columns"
      ? ui.failColumns(o.actualColumns ?? 0, o.expectedColumns ?? 0)
      : o.reason === "order"
        ? ui.failOrder
        : o.reason === "state"
          ? ui.failState
          : ui.failRows(o.extra, o.missing);
  return (
    <div role="status" className="pop-in rounded-xl bg-warn-bg px-3 py-2 text-sm text-fg ring-1 ring-sun/40">
      <p>{text}</p>
      {o.sampleMissing && (
        <p className="mt-1 text-xs text-muted">
          {ui.sampleMissing}{" "}
          <span className="font-mono text-fg">
            (
            {o.sampleMissing.map((v, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <Cell value={v} />
              </span>
            ))}
            )
          </span>
        </p>
      )}
    </div>
  );
}

export function MissionPanel({ step, onMissionDataset, feedback, onUseSolution, onSkip, onRestart, onSwitchDataset }: Props) {
  const at = missionAt(step);
  const mission = MISSIONS[at.index];
  // কাজ বদলালে ইঙ্গিত আর সমাধান আবার লুকানো (key দিয়ে)
  return (
    <section aria-labelledby="mission-title" className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
      <div className="flex items-center justify-between gap-2">
        <h2 id="mission-title" className="text-sm font-bold text-fg">
          {ui.missionTitle}
        </h2>
        <span className="text-xs text-muted">{ui.progress(Math.min(step, TOTAL_TASKS), TOTAL_TASKS)}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL_TASKS}
        aria-valuenow={Math.min(step, TOTAL_TASKS)}
        aria-label={ui.missionTitle}
      >
        <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${(Math.min(step, TOTAL_TASKS) / TOTAL_TASKS) * 100}%` }} />
      </div>

      {!mission ? (
        <div className="mt-3 space-y-3">
          {feedback && <FeedbackView feedback={feedback} />}
          <p className="text-sm text-fg">{ui.allDone}</p>
          <button type="button" onClick={onRestart} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-teal ring-1 ring-teal/30 hover:bg-teal/5">
            {ui.restart}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs font-semibold text-teal">{ui.missionOf(at.index + 1, MISSIONS.length)}</p>
          <h3 className="text-base font-bold text-fg">{mission.title}</h3>
          <p className="mt-1 text-xs text-muted">{mission.goal}</p>

          {!onMissionDataset ? (
            <div className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-sm text-fg">
              <p>{ui.missionWrongDataset}</p>
              <button type="button" onClick={onSwitchDataset} className="mt-2 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-surface">
                {ui.switchToMission}
              </button>
            </div>
          ) : (
            <ol className="mt-3 space-y-2">
              {mission.tasks.map((task, i) => {
                const done = i < at.done;
                const current = i === at.done;
                return (
                  <li
                    key={i}
                    aria-current={current ? "step" : undefined}
                    className={`rounded-xl px-3 py-2 text-sm ${current ? "bg-page ring-1 ring-mint/50" : ""} ${done ? "text-muted" : "text-fg"}`}
                  >
                    <div className="flex gap-2">
                      <span aria-hidden className={done ? "text-keep" : current ? "text-teal" : "text-muted"}>
                        {done ? "✓" : current ? "▸" : "○"}
                      </span>
                      <span className={done ? "line-through decoration-muted/40" : ""}>
                        <RichText text={task.label} codeClassName={codeClass} />
                      </span>
                    </div>
                    {current && <TaskHelp key={step} hint={task.hint} solution={task.solution} onUse={onUseSolution} onSkip={onSkip} />}
                  </li>
                );
              })}
            </ol>
          )}
          {feedback && onMissionDataset && (
            <div className="mt-3">
              <FeedbackView feedback={feedback} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskHelp({ hint, solution, onUse, onSkip }: { hint: string; solution: string; onUse: (sql: string) => void; onSkip: () => void }) {
  const [show, setShow] = useState<"none" | "hint" | "solution">("none");
  const button = "rounded-md px-2 py-1 text-xs font-semibold ring-1 transition";
  return (
    <div className="mt-2 pl-5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setShow(show === "hint" ? "none" : "hint")}
          aria-expanded={show === "hint"}
          className={`${button} text-teal ring-teal/30 hover:bg-teal/5`}
        >
          {ui.hint}
        </button>
        <button
          type="button"
          onClick={() => setShow(show === "solution" ? "none" : "solution")}
          aria-expanded={show === "solution"}
          className={`${button} text-muted ring-line/15 hover:text-fg`}
        >
          {ui.showSolution}
        </button>
        <button type="button" onClick={onSkip} className={`${button} text-muted ring-line/15 hover:text-fg`}>
          {ui.skipTask}
        </button>
      </div>
      {show === "hint" && (
        <p className="pop-in mt-2 text-xs text-fg">
          <RichText text={hint} codeClassName={codeClass} />
        </p>
      )}
      {show === "solution" && (
        <div className="pop-in mt-2">
          <pre className="scroll-thin overflow-x-auto rounded-lg bg-ink p-2.5 font-mono text-xs text-[#e6ebf5]">{solution}</pre>
          <button
            type="button"
            onClick={() => onUse(solution)}
            className="mt-1.5 rounded-md bg-fg px-2 py-1 text-xs font-semibold text-surface hover:opacity-90"
          >
            {ui.useSolution}
          </button>
        </div>
      )}
    </div>
  );
}
