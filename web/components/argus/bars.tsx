"use client";

import { motion, useReducedMotion } from "motion/react";
import { fmtDuration } from "@/lib/derive";

type Row = { key: string; label: string; value: number | null; note?: string; tag?: React.ReactNode; count?: boolean };

/** Horizontal bars in one neutral tone; they grow in once, and settle under reduced motion. */
export function Bars({ rows }: { rows: Row[] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{r.tag ?? r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.i
              className="block h-full rounded-full bg-foreground/45"
              initial={reduce ? false : { width: 0 }}
              whileInView={{ width: `${((r.value ?? 0) / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : i * 0.06, ease: [0.16, 1, 0.3, 1] }}
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
