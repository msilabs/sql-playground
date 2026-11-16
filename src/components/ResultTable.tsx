import type { SqlValue } from "@/lib/db/types";
import { bn } from "@/lib/bn";
import { ui } from "@/lib/ui-text";

interface Props {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlValue[])[];
  /** WHERE/HAVING: কোন row টিকল */
  readonly marks?: readonly boolean[];
  /** GROUP BY: কোন row কোন দলে */
  readonly groups?: readonly number[];
  readonly maxHeight?: string;
  readonly label?: string;
}

export function Cell({ value }: { value: SqlValue }) {
  if (value === null) return <span className="italic text-muted">NULL</span>;
  if (value instanceof Uint8Array) return <span className="text-muted">[BLOB {bn(value.length)} byte]</span>;
  return <>{String(value)}</>;
}

/** ফলের table: উপরের সারি আটকে থাকে, সংখ্যা ডানে, NULL আলাদা করে চেনা যায় */
export function ResultTable({ columns, rows, marks, groups, maxHeight = "28rem", label }: Props) {
  const gutter = marks !== undefined || groups !== undefined;
  return (
    <div className="scroll-thin overflow-auto rounded-xl ring-1 ring-line/10" style={{ maxHeight }} tabIndex={0} aria-label={label}>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-[1] bg-chip">
          <tr>
            <th scope="col" className="w-10 px-2 py-2 text-right font-mono text-xs font-normal text-muted">
              #
            </th>
            {gutter && <th scope="col" className="px-2 py-2 text-xs font-semibold text-muted" />}
            {columns.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-fg">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const dropped = marks !== undefined && !marks[r];
            const group = groups?.[r];
            return (
              <tr
                key={r}
                className={`border-t border-line/5 ${group !== undefined ? `group-row group-${group % 8}` : ""} ${dropped ? "opacity-45" : ""}`}
              >
                <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">{bn(r + 1)}</td>
                {gutter && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs font-semibold">
                    {marks !== undefined &&
                      (marks[r] ? (
                        <span className="text-keep">✓ {ui.kept}</span>
                      ) : (
                        <span className="text-drop">✕ {ui.dropped}</span>
                      ))}
                    {group !== undefined && <span className="text-fg">{ui.group(group + 1)}</span>}
                  </td>
                )}
                {row.map((v, c) => (
                  <td
                    key={c}
                    title={typeof v === "string" && v.length > 40 ? v : undefined}
                    className={`max-w-[28ch] truncate px-3 py-1.5 ${typeof v === "number" ? "text-right font-mono tabular-nums" : ""} ${dropped ? "line-through" : ""}`}
                  >
                    <Cell value={v} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
