"use client";

import { useState } from "react";
import type { Stage, StagesResult } from "@/lib/sql/stages";
import { bn } from "@/lib/bn";
import { ui } from "@/lib/ui-text";
import { ResultTable } from "./ResultTable";
import { RichText } from "./RichText";

const codeClass = "rounded bg-chip px-1 font-mono text-[0.9em] text-fg ring-1 ring-line/10";

function OrderStrip({ label, items, arrows }: { label: string; items: readonly string[]; arrows: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="flex items-center gap-1.5">
          <span className="rounded-md bg-chip px-1.5 py-0.5 font-mono font-semibold text-fg ring-1 ring-line/10">{item}</span>
          {i < items.length - 1 && <span className="text-muted" aria-hidden>{arrows ? "→" : "·"}</span>}
        </span>
      ))}
    </div>
  );
}

function StageBody({ stage }: { stage: Stage }) {
  return (
    <div className="pop-in">
      <p className="font-mono text-sm text-fg">
        <span className="rounded bg-ink px-1.5 py-0.5 text-mint">{stage.clause}</span>
      </p>
      <p className="mt-2 text-sm text-fg">
        <RichText text={stage.note} codeClassName={codeClass} />
      </p>
      {stage.error ? (
        <p className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-xs text-fg">
          {ui.stageFailed} <code className="font-mono">{stage.error}</code>
        </p>
      ) : (
        <div className="mt-3">
          <ResultTable
            columns={stage.columns}
            rows={stage.rows}
            marks={stage.marks}
            groups={stage.groups}
            maxHeight="24rem"
            label={stage.label}
          />
          {stage.rows.length < stage.total && <p className="mt-2 text-xs text-muted">{ui.shownRows(stage.rows.length)}</p>}
        </div>
      )}
    </div>
  );
}

export function StageViewer({ result }: { result: StagesResult }) {
  const [index, setIndex] = useState(0);
  if (!result.ok) return <p className="text-sm text-muted">{result.message}</p>;
  const { stages, written } = result;
  const current = stages[Math.min(index, stages.length - 1)];
  if (!current) return null;

  return (
    <div>
      <div className="space-y-1.5 rounded-xl bg-page p-3 ring-1 ring-line/5">
        <OrderStrip label={ui.writtenOrder} items={written} arrows={false} />
        <OrderStrip label={ui.runOrder} items={stages.map((s) => s.label)} arrows />
      </div>

      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={ui.runOrder}>
        {stages.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition ${
                i === index ? "bg-ink text-mint ring-ink" : "bg-surface text-fg ring-line/15 hover:ring-line/35"
              } ${s.error ? "line-through decoration-drop" : ""}`}
            >
              {bn(i + 1)}. {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-3 rounded-xl p-0.5">
        <p className="text-xs text-muted">
          {ui.stepOf(index + 1, stages.length)} · <span className="font-semibold text-fg">{current.title}</span>
        </p>
        <div className="mt-2">
          <StageBody key={current.key} stage={current} />
        </div>
      </div>

      <div className="mt-3 flex justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-teal ring-1 ring-teal/30 hover:bg-teal/5 disabled:opacity-40"
        >
          {ui.prev}
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(stages.length - 1, i + 1))}
          disabled={index >= stages.length - 1}
          className="rounded-lg bg-fg px-3 py-1.5 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-40"
        >
          {ui.next}
        </button>
      </div>
    </div>
  );
}
