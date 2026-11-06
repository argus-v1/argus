import Link from "next/link";
import { Icon, ROLE_VAR } from "./Icons";
import { durationMs, fmtAgo, fmtDuration, investigationHref, STATE_WORDS, stateOf, type State } from "@/lib/derive";
import { STAGES, STAGE_ROLE, type Investigation } from "@/lib/types";

const STATE_ICON: Record<State, string> = {
  verified: "i-ok",
  "changes-needed": "i-no",
  "not-reproduced": "i-no",
  "needs-human": "i-hand",
  running: "i-dot",
  stopped: "i-dot",
};

export function StateBadge({ state, large = false }: { state: State; large?: boolean }) {
  return (
    <span className={`vb ${state}${large ? " lg" : ""}`}>
      <Icon id={STATE_ICON[state]} size={large ? 16 : 13} />
      {STATE_WORDS[state]}
    </span>
  );
}

/** Five segments in role colours: done, the one in progress, and what is left. */
export function StageBar({ inv }: { inv: Investigation }) {
  const at = STAGES.indexOf(inv.stage);
  return (
    <div className="sbar" role="img" aria-label={`Stage ${at + 1} of 5: ${inv.stage}`}>
      {STAGES.map((s, i) => {
        const cls = inv.status === "done" || i < at ? "done" : i === at && inv.status === "running" ? "now" : i === at ? "done" : "";
        return <i key={s} className={cls} style={{ "--c": ROLE_VAR[STAGE_ROLE[s]] } as React.CSSProperties} />;
      })}
    </div>
  );
}

export function Pair({ inv }: { inv: Pick<Investigation, "reproducer_model" | "skeptic_model"> }) {
  return (
    <span className="pair">
      <i style={{ "--c": "var(--rep)" } as React.CSSProperties} />
      {inv.reproducer_model ?? "?"}
      <span aria-hidden="true">×</span>
      <i style={{ "--c": "var(--skp)" } as React.CSSProperties} />
      {inv.skeptic_model ?? "?"}
    </span>
  );
}

export function InvestigationsTable({ rows, now }: { rows: Investigation[]; now: number }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Pull request</th>
            <th>Verdict</th>
            <th>Attempt</th>
            <th>Models</th>
            <th className="num">Took</th>
            <th className="num">Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="ttl">
                <Link href={investigationHref(r)}>
                  <span className="mono" style={{ color: "var(--faint)", fontSize: 12.5 }}>{r.repo} #{r.pr_number}</span>
                  <br />
                  {r.pr_title ?? "Untitled pull request"}
                </Link>
              </td>
              <td><StateBadge state={stateOf(r)} /></td>
              <td className="mono">{r.attempt}{r.trigger === "push" ? " · after push" : ""}</td>
              <td><Pair inv={r} /></td>
              <td className="num mono">{fmtDuration(durationMs(r, now))}</td>
              <td className="num mono">{fmtAgo(r.started_at, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadError({ what, message }: { what: string; message: string }) {
  return (
    <div className="empty" role="alert">
      <h3>Couldn&apos;t load {what}</h3>
      <p>The event log did not answer ({message}). Refresh in a moment; nothing on this page is lost.</p>
    </div>
  );
}
