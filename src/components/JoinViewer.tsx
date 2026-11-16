"use client";

import { useMemo, useState } from "react";
import { displayColumns, type JoinSide, type JoinView } from "@/lib/sql/join";
import { ui } from "@/lib/ui-text";
import { Cell } from "./ResultTable";

const HEAD_H = 30;
const COLS_H = 24;
const ROW_H = 30;
const GAP_W = 76;
const MAX_LINES = 400;

type SideName = "left" | "right";
type RowState = "matched" | "null" | "none";

interface Focus {
  readonly side: SideName;
  readonly rid: number;
}

function SideTable({
  side,
  name,
  cols,
  states,
  focus,
  partners,
  onFocus,
}: {
  side: JoinSide;
  name: SideName;
  cols: number[];
  states: Map<number, RowState>;
  focus: Focus | null;
  partners: Set<string>;
  onFocus: (f: Focus | null) => void;
}) {
  return (
    <div className="min-w-[13rem] overflow-hidden rounded-xl bg-surface ring-1 ring-line/15">
      <div className="flex items-center gap-1.5 bg-ink px-3 font-mono text-xs font-semibold text-mint" style={{ height: HEAD_H }}>
        {side.name}
        {side.alias !== side.name && <span className="text-[#9aa6c0]">({side.alias})</span>}
      </div>
      <div className="flex items-center gap-3 bg-chip px-3 font-mono text-[11px] text-muted" style={{ height: COLS_H }}>
        {cols.map((c) => (
          <span key={c} className="min-w-[3ch] flex-1 truncate">
            {side.columns[c]}
          </span>
        ))}
      </div>
      {side.rows.map((row) => {
        const state = states.get(row.rid) ?? "none";
        const isFocus = focus?.side === name && focus.rid === row.rid;
        const isPartner = partners.has(`${name}:${row.rid}`);
        const faded = focus !== null && !isFocus && !isPartner;
        return (
          <button
            type="button"
            key={row.rid}
            onMouseEnter={() => onFocus({ side: name, rid: row.rid })}
            onMouseLeave={() => onFocus(null)}
            onFocus={() => onFocus({ side: name, rid: row.rid })}
            onBlur={() => onFocus(null)}
            title={state === "null" ? ui.joinNull : state === "none" ? ui.joinNoMatch : undefined}
            className={`flex w-full items-center gap-3 border-t border-line/5 px-3 text-left font-mono text-xs transition ${
              state === "null" ? "bg-warn-bg" : ""
            } ${state === "none" ? "text-muted line-through decoration-muted/40" : "text-fg"} ${
              isFocus || isPartner ? "bg-mint/20" : ""
            } ${faded ? "opacity-35" : ""}`}
            style={{ height: ROW_H }}
          >
            {cols.map((c) => (
              <span key={c} className="min-w-[3ch] flex-1 truncate">
                <Cell value={row.cells[c]} />
              </span>
            ))}
            {state === "null" && <span className="shrink-0 rounded bg-sun/30 px-1 text-[10px] text-fg">NULL</span>}
          </button>
        );
      })}
    </div>
  );
}

export function JoinViewer({ view }: { view: JoinView }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const { join, left, right, pairs } = view;

  const data = useMemo(() => {
    const leftIndex = new Map(left.rows.map((r, i) => [r.rid, i]));
    const rightIndex = new Map(right.rows.map((r, i) => [r.rid, i]));
    const leftMatched = new Set<number>();
    const rightMatched = new Set<number>();
    const leftNull = new Set<number>();
    const rightNull = new Set<number>();
    const lines: { l: number; r: number; lrid: number; rrid: number }[] = [];
    for (const [l, r] of pairs) {
      if (l !== null && r !== null) {
        leftMatched.add(l);
        rightMatched.add(r);
        const li = leftIndex.get(l);
        const ri = rightIndex.get(r);
        if (li !== undefined && ri !== undefined) lines.push({ l: li, r: ri, lrid: l, rrid: r });
      } else if (l !== null) leftNull.add(l);
      else if (r !== null) rightNull.add(r);
    }
    const stateOf = (matched: Set<number>, nulls: Set<number>) => (rid: number): RowState =>
      matched.has(rid) ? "matched" : nulls.has(rid) ? "null" : "none";
    const leftState = stateOf(leftMatched, leftNull);
    const rightState = stateOf(rightMatched, rightNull);
    return {
      lines,
      leftStates: new Map(left.rows.map((r) => [r.rid, leftState(r.rid)])),
      rightStates: new Map(right.rows.map((r) => [r.rid, rightState(r.rid)])),
    };
  }, [left, right, pairs]);

  const partners = useMemo(() => {
    const set = new Set<string>();
    if (!focus) return set;
    for (const line of data.lines) {
      if (focus.side === "left" && line.lrid === focus.rid) set.add(`right:${line.rrid}`);
      if (focus.side === "right" && line.rrid === focus.rid) set.add(`left:${line.lrid}`);
    }
    return set;
  }, [focus, data.lines]);

  const leftCols = displayColumns(left, join);
  const rightCols = displayColumns(right, join);
  const tooMany = join.type === "CROSS" || data.lines.length > MAX_LINES;
  const height = HEAD_H + COLS_H + Math.max(left.rows.length, right.rows.length) * ROW_H;
  const y = (i: number) => HEAD_H + COLS_H + i * ROW_H + ROW_H / 2;

  const condition = join.on ? `ON ${join.on}` : join.using ? `USING (${join.using.join(", ")})` : "";

  return (
    <div>
      <p className="font-mono text-sm">
        <span className="rounded bg-ink px-1.5 py-0.5 text-mint">
          {join.natural ? "NATURAL " : ""}
          {join.type} JOIN {condition}
        </span>
      </p>
      <p className="mt-2 text-sm text-fg">{ui.joinSummary(view.pairTotal)}</p>
      <p className="mt-1 text-xs text-muted">{tooMany ? ui.crossTooMany : ui.joinHover}</p>

      <div className="scroll-thin mt-3 overflow-x-auto pb-2">
        <div className="flex min-w-max items-start">
          <SideTable side={left} name="left" cols={leftCols} states={data.leftStates} focus={focus} partners={partners} onFocus={setFocus} />
          <svg width={GAP_W} height={height} className="shrink-0" aria-hidden>
            {!tooMany &&
              data.lines.map((line, i) => {
                const active =
                  focus !== null &&
                  ((focus.side === "left" && focus.rid === line.lrid) || (focus.side === "right" && focus.rid === line.rrid));
                const y1 = y(line.l);
                const y2 = y(line.r);
                return (
                  <path
                    key={i}
                    d={`M0 ${y1} C ${GAP_W / 2} ${y1}, ${GAP_W / 2} ${y2}, ${GAP_W} ${y2}`}
                    fill="none"
                    stroke={active ? "#1ed6a8" : "currentColor"}
                    strokeWidth={active ? 2.5 : 1.25}
                    className={`text-teal transition-opacity ${focus && !active ? "opacity-10" : "opacity-70"}`}
                  />
                );
              })}
          </svg>
          <SideTable side={right} name="right" cols={rightCols} states={data.rightStates} focus={focus} partners={partners} onFocus={setFocus} />
        </div>
      </div>

      <ul className="mt-2 space-y-1 text-xs text-muted">
        <li>
          <span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-warn-bg align-middle ring-1 ring-sun/50" />
          {ui.joinNull}
        </li>
        <li>
          <span className="mr-1.5 inline-block w-6 align-middle line-through">abc</span>
          {ui.joinNoMatch}
        </li>
        {left.rows.length < left.total && <li>{left.name}: {ui.joinShown(left.rows.length, left.total)}</li>}
        {right.rows.length < right.total && <li>{right.name}: {ui.joinShown(right.rows.length, right.total)}</li>}
        {join.more && <li>{ui.joinMore}</li>}
      </ul>
    </div>
  );
}
