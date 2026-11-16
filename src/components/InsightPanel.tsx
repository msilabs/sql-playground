"use client";

import { useState } from "react";
import type { JoinView } from "@/lib/sql/join";
import type { StagesResult } from "@/lib/sql/stages";
import { ui } from "@/lib/ui-text";
import { JoinViewer } from "./JoinViewer";
import { StageViewer } from "./StageViewer";

export type Insight =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly id: number; readonly stages: StagesResult; readonly join: JoinView | null; readonly hasJoin: boolean };

type Tab = "stages" | "join";

export function InsightPanel({ insight }: { insight: Insight }) {
  const [tab, setTab] = useState<Tab>("stages");
  const tabClass = (t: Tab) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      tab === t ? "bg-ink text-mint" : "text-muted hover:text-fg"
    }`;

  return (
    <section aria-labelledby="insight-title" className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="insight-title" className="text-sm font-bold text-fg">
          {ui.insightTitle}
        </h2>
        <div role="tablist" aria-label={ui.insightTitle} className="flex gap-1 rounded-xl bg-chip p-1">
          <button type="button" role="tab" aria-selected={tab === "stages"} onClick={() => setTab("stages")} className={tabClass("stages")}>
            {ui.stagesTab}
          </button>
          <button type="button" role="tab" aria-selected={tab === "join"} onClick={() => setTab("join")} className={tabClass("join")}>
            {ui.joinTab}
          </button>
        </div>
      </div>

      <div role="tabpanel">
        {insight.status === "idle" && <p className="text-sm text-muted">{ui.insightEmpty}</p>}
        {insight.status === "loading" && <p className="animate-pulse text-sm text-muted">{ui.insightLoading}</p>}
        {insight.status === "ready" && tab === "stages" && <StageViewer key={insight.id} result={insight.stages} />}
        {insight.status === "ready" && tab === "join" &&
          (insight.join ? (
            <JoinViewer key={insight.id} view={insight.join} />
          ) : (
            <p className="text-sm text-muted">{insight.hasJoin ? ui.joinUnavailable : ui.noJoin}</p>
          ))}
      </div>
    </section>
  );
}
