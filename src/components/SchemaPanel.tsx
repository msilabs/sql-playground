"use client";

import { useMemo, useState } from "react";
import { DEFAULT_DATASET, datasetById, type DatasetId } from "@/lib/db/datasets";
import type { SchemaInfo, TableInfo } from "@/lib/db/schema";
import { aliasMap } from "@/lib/sql/complete";
import { ui } from "@/lib/ui-text";

interface Props {
  readonly schema: SchemaInfo;
  readonly dataset: DatasetId;
  /** editor-এর লেখা: এখানে যে table-এর নাম আছে, সেটা নিজে থেকে খোলা থাকে */
  readonly editorText: string;
  readonly disabled: boolean;
  readonly onDataset: (id: DatasetId) => void;
  readonly onInsert: (text: string) => void;
  readonly onView: (table: string) => void;
}

function Columns({ table, disabled, onInsert, onView }: { table: TableInfo } & Pick<Props, "disabled" | "onInsert" | "onView">) {
  return (
    <div className="pop-in border-t border-line/5 px-2.5 pt-1.5 pb-2.5">
      <ul className="space-y-0.5">
        {table.columns.map((c) => (
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
              <span
                title={ui.fkTitle(c.ref.table, c.ref.column)}
                className="truncate rounded bg-indigo/15 px-1 font-mono text-[10px] text-indigo dark:text-[#a5b4fc]"
              >
                → {c.ref.table}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onView(table.name)}
          disabled={disabled}
          aria-label={ui.viewTableLabel(table.name)}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-teal ring-1 ring-teal/30 hover:bg-teal/5 disabled:opacity-40"
        >
          {ui.viewTable}
        </button>
        <button
          type="button"
          onClick={() => onInsert(table.name)}
          title={ui.insertName(table.name)}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line/15 hover:text-fg"
        >
          {ui.insertTable}
        </button>
      </div>
    </div>
  );
}

export function SchemaPanel({ schema, dataset, editorText, disabled, onDataset, onInsert, onView }: Props) {
  /** নিজে খোলা বা বন্ধ করা table; না ছুঁলে query দেখে ঠিক হয় */
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const used = useMemo(() => new Set(aliasMap(editorText, schema).values()), [editorText, schema]);
  const isDefault = dataset === DEFAULT_DATASET;

  return (
    <section aria-labelledby="schema-title" className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="schema-title" className="text-sm font-bold text-fg">
          {ui.schemaTitle}
        </h2>
        {!isDefault && <span className="text-xs font-semibold text-indigo dark:text-[#a5b4fc]">{datasetById(dataset).title}</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">{ui.schemaHint}</p>

      <ul className="mt-3 space-y-1.5">
        {schema.tables.map((t) => {
          const open = manual[t.name] ?? used.has(t.name);
          const panelId = `table-${t.name}`;
          return (
            <li key={t.name} className="overflow-hidden rounded-xl bg-page ring-1 ring-line/5">
              <button
                type="button"
                onClick={() => setManual((m) => ({ ...m, [t.name]: !open }))}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-chip"
              >
                <span aria-hidden className="w-3 text-xs text-muted">
                  {open ? "▾" : "▸"}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-fg">{t.name}</span>
                {t.kind === "view" && <span className="rounded bg-indigo/15 px-1 text-[10px] text-indigo">{ui.viewBadge}</span>}
                {t.rowCount !== null && <span className="shrink-0 text-[11px] text-muted">{ui.rowCount(t.rowCount)}</span>}
              </button>
              {open && (
                <div id={panelId}>
                  <Columns table={t} disabled={disabled} onInsert={onInsert} onView={onView} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onDataset(isDefault ? "school" : DEFAULT_DATASET)}
        disabled={disabled}
        className="mt-4 text-xs text-muted underline decoration-line/30 underline-offset-2 hover:text-fg disabled:opacity-40"
      >
        {isDefault ? ui.tryOtherDataset : ui.backToMainDataset}
      </button>
    </section>
  );
}
