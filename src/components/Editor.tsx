"use client";

import { useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { SchemaInfo } from "@/lib/db/schema";
import { applySuggestion, complete, type Completion, type Suggestion } from "@/lib/sql/complete";
import { tokenize } from "@/lib/sql/tokenize";
import { ui } from "@/lib/ui-text";

export interface EditorHandle {
  /** কার্সরের জায়গায় লেখা বসায় */
  insert(text: string): void;
  focus(): void;
  /** সিলেক্ট করা অংশ (বা পুরো লেখা) চালায় */
  run(): void;
}

interface Props {
  readonly value: string;
  readonly onChange: (text: string) => void;
  /** সিলেক্ট করা অংশ থাকলে শুধু সেটা, নাহলে পুরো লেখা */
  readonly onRun: (text: string) => void;
  readonly schema: SchemaInfo;
  readonly ref?: Ref<EditorHandle>;
}

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  keyword: "keyword",
  table: "table",
  column: "column",
  function: "ফাংশন",
};

/** রঙিন SQL: textarea-র ঠিক নিচে একই মাপে আঁকা হয়, textarea-র লেখা স্বচ্ছ */
function Highlighted({ text }: { text: string }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === "ws") return t.text;
        const isFunction = t.type === "ident" && tokens[i + 1]?.text === "(";
        return (
          <span key={i} className={`tok-${isFunction ? "function" : t.type}`}>
            {t.text}
          </span>
        );
      })}
      {/* শেষে নতুন লাইন থাকলে উচ্চতা ঠিক রাখতে */}
      {text.endsWith("\n") || text === "" ? " " : null}
    </>
  );
}

const isWordInput = (data: string | null) => data !== null && /^[\p{L}\p{N}_.]$/u.test(data);

export function Editor({ value, onChange, onRun, schema, ref }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [active, setActive] = useState(0);

  const setCursor = (pos: number) =>
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(pos, pos);
    });

  const runNow = () => {
    const el = textarea.current;
    const selected = el && el.selectionStart !== el.selectionEnd ? value.slice(el.selectionStart, el.selectionEnd) : "";
    setCompletion(null);
    onRun(selected.trim() ? selected : value);
  };

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const el = textarea.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + text + value.slice(end));
      setCursor(start + text.length);
    },
    focus() {
      textarea.current?.focus();
    },
    run() {
      runNow();
    },
  }));

  const accept = (item: Suggestion) => {
    if (!completion) return;
    const next = applySuggestion(value, completion, item);
    onChange(next.text);
    setCompletion(null);
    setCursor(next.cursor);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runNow();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === " ") {
      e.preventDefault();
      const el = e.currentTarget;
      setCompletion(complete(value, el.selectionStart, schema));
      setActive(0);
      return;
    }
    if (!completion) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = completion.items.length;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      accept(completion.items[active] ?? completion.items[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCompletion(null);
    }
  };

  return (
    <div>
      <div className="scroll-thin relative grid max-h-[55vh] min-h-[11rem] overflow-auto rounded-xl bg-ink ring-1 ring-ink-3 focus-within:ring-2 focus-within:ring-mint/70">
        <pre aria-hidden className="editor-layer pointer-events-none [grid-area:1/1] text-[#e6ebf5]">
          <Highlighted text={value} />
        </pre>
        <textarea
          ref={textarea}
          value={value}
          aria-label={ui.editorLabel}
          aria-autocomplete="list"
          aria-controls={completion ? "sql-completions" : undefined}
          aria-activedescendant={completion ? `sql-completion-${active}` : undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          onChange={(e) => {
            const text = e.target.value;
            onChange(text);
            const data = (e.nativeEvent as InputEvent).data ?? null;
            if (isWordInput(data)) {
              setCompletion(complete(text, e.target.selectionStart, schema));
              setActive(0);
            } else setCompletion(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setCompletion(null), 150)}
          className="editor-layer h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-mint outline-none [grid-area:1/1] selection:bg-mint/30"
        />
      </div>

      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1.5" aria-live="polite">
        {completion ? (
          <>
            <ul id="sql-completions" role="listbox" aria-label="পরামর্শ" className="flex flex-wrap gap-1.5">
              {completion.items.map((item, i) => (
                <li
                  key={`${item.kind}-${item.label}-${item.detail ?? ""}`}
                  id={`sql-completion-${i}`}
                  role="option"
                  aria-selected={i === active}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => accept(item)}
                    className={`rounded-lg px-2 py-1 font-mono text-xs ring-1 transition ${
                      i === active ? "bg-ink text-mint ring-mint/60" : "bg-chip text-fg ring-line/10 hover:ring-line/30"
                    }`}
                  >
                    {item.label}
                    <span className="ml-1.5 font-sans text-[10px] text-muted">
                      {item.detail ? `${item.detail}` : KIND_LABEL[item.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <span className="hidden text-[11px] text-muted sm:inline">{ui.completionHint}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
