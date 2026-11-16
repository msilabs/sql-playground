"use client";

import { useEffect, useState } from "react";
import { DATASETS, type DatasetId } from "@/lib/db/datasets";
import type { SchemaInfo } from "@/lib/db/schema";
import { ui } from "@/lib/ui-text";

interface Props {
  readonly schema: SchemaInfo;
  readonly dataset: DatasetId;
  readonly disabled: boolean;
  readonly onDataset: (id: DatasetId) => void;
  readonly onInsert: (text: string) => void;
  readonly onView: (table: string) => void;
}

export function SchemaPanel({ schema, dataset, disabled, onDataset, onInsert, onView }: Props) {
  // বড় পর্দায় খোলা, মোবাইলে বন্ধ দিয়ে শুরু (নাহলে editor অনেক নিচে চলে যায়)
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- পর্দার মাপ শুধু ব্রাউজারে জানা যায়
    if (!matchMedia("(min-width: 1024px)").matches) setOpen(false);
  }, []);
  const info = DATASETS.find((d) => d.id === dataset);

  return (
    <section aria-labelledby="schema-title" className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
      <label className="block text-xs font-semibold text-muted" htmlFor="dataset-select">
        {ui.datasetLabel}
      </label>
      <select
        id="dataset-select"
        value={dataset}
        disabled={disabled}
        onChange={(e) => onDataset(e.target.value as DatasetId)}
        className="mt-1 w-full rounded-lg bg-chip px-2.5 py-2 text-sm font-semibold text-fg ring-1 ring-line/15"
      >
        {DATASETS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      {info && <p className="mt-1.5 text-xs text-muted">{info.description}</p>}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="schema-list"
        title={ui.schemaToggle}
        className="mt-4 flex w-full items-center justify-between text-left"
      >
        <h2 id="schema-title" className="text-sm font-bold text-fg">
          {ui.schemaTitle} <span className="font-normal text-muted">({schema.tables.length})</span>
        </h2>
        <span aria-hidden className="text-muted">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <ul id="schema-list" className="mt-2 space-y-3">
          {schema.tables.map((t) => (
            <li key={t.name} className="rounded-xl bg-page p-2.5 ring-1 ring-line/5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onInsert(t.name)}
                  title={ui.insertName(t.name)}
                  className="truncate font-mono text-sm font-semibold text-fg hover:text-teal"
                >
                  {t.name}
                  {t.kind === "view" && <span className="ml-1.5 rounded bg-indigo/15 px-1 text-[10px] text-indigo">{ui.viewBadge}</span>}
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  {t.rowCount !== null && <span className="text-[11px] text-muted">{ui.rowCount(t.rowCount)}</span>}
                  <button
                    type="button"
                    onClick={() => onView(t.name)}
                    disabled={disabled}
                    aria-label={ui.viewTableLabel(t.name)}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-teal ring-1 ring-teal/30 hover:bg-teal/5 disabled:opacity-40"
                  >
                    {ui.viewTable}
                  </button>
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onInsert(c.name)}
                      title={ui.insertName(c.name)}
                      className="truncate font-mono text-fg hover:text-teal"
                    >
                      {c.name}
                    </button>
                    <span className="font-mono text-[10px] uppercase text-muted">{c.type}</span>
                    {c.pk && (
                      <span title={ui.pkTitle} className="rounded bg-sun/25 px-1 text-[10px] font-semibold text-fg">
                        {ui.pk}
                      </span>
                    )}
                    {c.ref && (
                      <span title={ui.fkTitle(c.ref.table, c.ref.column)} className="truncate rounded bg-indigo/15 px-1 font-mono text-[10px] text-indigo dark:text-[#a5b4fc]">
                        → {c.ref.table}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
