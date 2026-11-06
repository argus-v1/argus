import Link from "next/link";
import { investigationHref, STATE_WORDS, stateOf, type State } from "@/lib/derive";
import type { Investigation } from "@/lib/types";

const SLOTS = 100;

const IRIS: Record<State, string> = {
  verified: "var(--ok)",
  "changes-needed": "var(--bad)",
  "not-reproduced": "var(--bad)",
  "needs-human": "var(--amb)",
  running: "var(--amb)",
  stopped: "var(--faint)",
};

/** One eye per run, oldest first, out of Argus's hundred. Open when the proof landed, blinking while agents work. */
export function EyeField({ rows }: { rows: Investigation[] }) {
  const runs = [...rows].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)).slice(-SLOTS);
  const empty = Math.max(0, SLOTS - runs.length);
  return (
    <div className="eyes" role="list" aria-label={`${runs.length} of ${SLOTS} eyes open`}>
      {runs.map((r) => {
        const st = stateOf(r);
        const label = `${r.repo} #${r.pr_number} attempt ${r.attempt}: ${STATE_WORDS[st]}`;
        return (
          <Link key={r.id} role="listitem" href={investigationHref(r)} className={`eye ${st}`} aria-label={label} title={label} style={{ "--iris": IRIS[st] } as React.CSSProperties}>
            <svg viewBox="0 0 32 20" aria-hidden="true">
              <path className="lid" d="M2 10C6.5 3.8 11 1.5 16 1.5S25.5 3.8 30 10C25.5 16.2 21 18.5 16 18.5S6.5 16.2 2 10Z" />
              <g className="ball">
                <circle cx="16" cy="10" r="5.6" fill="var(--iris)" />
                <circle cx="16" cy="10" r="2.3" fill="var(--bg)" />
              </g>
            </svg>
          </Link>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} className="eye shut" aria-hidden="true">
          <svg viewBox="0 0 32 20"><path className="lid" d="M3 10c4.3 3.4 8.6 5 13 5s8.7-1.6 13-5" /></svg>
        </span>
      ))}
    </div>
  );
}
