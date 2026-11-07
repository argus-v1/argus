import { fmtDuration } from "@/lib/derive";

type Row = { key: string; label: string; value: number | null; note?: string; tag?: React.ReactNode; count?: boolean };

/** Horizontal bars in one neutral tone. The bar is drawn at its real width on the server; a CSS grow-in plays
 *  on top only when motion is allowed (see .bar-grow in app/globals.css), so it never renders empty. */
export function Bars({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{r.tag ?? r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <i
              className="bar-grow block h-full rounded-full bg-foreground/45"
              style={{ width: `${((r.value ?? 0) / max) * 100}%`, animationDelay: `${i * 60}ms` }}
            />
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {r.count ? r.value : fmtDuration(r.value)}{r.note ? ` · ${r.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
