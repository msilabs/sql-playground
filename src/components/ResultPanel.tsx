"use client";

import { useState } from "react";
import type { StatementResult } from "@/lib/db/types";
import type { FriendlyError } from "@/lib/sql/errors";
import type { Explanation } from "@/lib/sql/explain";
import { bn } from "@/lib/bn";
import { ui } from "@/lib/ui-text";
import { ResultTable } from "./ResultTable";
import { RichText } from "./RichText";

export interface Output {
  readonly id: number;
  readonly statements: readonly StatementResult[];
  readonly error?: { readonly sql: string; readonly message: string; readonly friendly: FriendlyError };
  readonly explanation?: Explanation;
}

const codeClass = "rounded bg-chip px-1 font-mono text-[0.9em] text-fg ring-1 ring-line/10";

function StatementView({ st }: { st: StatementResult }) {
  if (st.columns.length === 0) {
    return <p className="rounded-xl bg-chip px-4 py-3 text-sm font-semibold text-keep">{st.changes > 0 ? ui.changed(st.changes) : ui.ranOk}</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs text-muted">{ui.rowsMeta(st.total, st.capped, st.ms)}</p>
      {st.total === 0 ? (
        <p className="rounded-xl bg-chip px-4 py-3 text-sm text-muted">{ui.noRows}</p>
      ) : (
        <ResultTable columns={st.columns} rows={st.rows} label={ui.resultTitle} />
      )}
      {st.rows.length < st.total && <p className="mt-2 text-xs text-muted">{ui.shownRows(st.rows.length)}</p>}
    </div>
  );
}

export function ResultPanel({ output, busy }: { output: Output | null; busy: boolean }) {
  // নতুন ফল এলে শেষ statement দেখায় (key দিয়ে অবস্থা নতুন করে শুরু হয়)
  return <ResultPanelInner key={output?.id ?? 0} output={output} busy={busy} />;
}

function ResultPanelInner({ output, busy }: { output: Output | null; busy: boolean }) {
  const count = output?.statements.length ?? 0;
  const [selected, setSelected] = useState(Math.max(0, count - 1));

  return (
    <section aria-labelledby="result-title" aria-busy={busy} className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
      <h2 id="result-title" className="mb-3 text-sm font-bold text-fg">
        {ui.resultTitle}
      </h2>
      {!output && <p className="text-sm text-muted">{ui.resultEmpty}</p>}

      {output && count > 1 && (
        <div role="tablist" aria-label={ui.resultTitle} className="mb-3 flex flex-wrap gap-1.5">
          {output.statements.map((st, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={`max-w-[16rem] truncate rounded-lg px-2.5 py-1 font-mono text-xs ring-1 ${
                i === selected ? "bg-ink text-mint ring-ink" : "bg-chip text-fg ring-line/10 hover:ring-line/30"
              }`}
              title={st.sql}
            >
              {bn(i + 1)}. {st.sql}
            </button>
          ))}
        </div>
      )}

      {output && output.statements[selected] && (
        <div className="pop-in">
          <StatementView st={output.statements[selected]} />
        </div>
      )}

      {output?.error && (
        <div role="alert" className="pop-in mt-3 rounded-xl bg-error-bg p-4 text-sm ring-1 ring-drop/25">
          <p className="font-bold text-drop">
            <RichText text={output.error.friendly.title} codeClassName={codeClass} />
          </p>
          {output.error.friendly.hint && (
            <p className="mt-1.5 text-fg">
              <RichText text={output.error.friendly.hint} codeClassName={codeClass} />
            </p>
          )}
          {output.error.sql && (
            <p className="mt-2 text-xs text-muted">
              {ui.errorIn} <code className="font-mono text-fg">{output.error.sql}</code>
            </p>
          )}
          {output.error.message && (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">{ui.originalError}</summary>
              <code className="mt-1 block font-mono">{output.error.message}</code>
            </details>
          )}
        </div>
      )}

      {output?.explanation && (
        <div className="pop-in mt-4 rounded-xl bg-chip p-4 text-sm">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-teal">{ui.explainTitle}</h3>
          {output.explanation.steps.length > 0 && (
            <ol className="mb-2 list-decimal space-y-1 pl-5 text-fg">
              {output.explanation.steps.map((s, i) => (
                <li key={i}>
                  <RichText text={s} codeClassName={codeClass} />
                </li>
              ))}
            </ol>
          )}
          <p className="font-semibold text-fg">
            <RichText text={output.explanation.summary} codeClassName={codeClass} />
          </p>
          {output.explanation.warning && (
            <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-fg ring-1 ring-sun/40">⚠ {output.explanation.warning}</p>
          )}
        </div>
      )}
    </section>
  );
}
