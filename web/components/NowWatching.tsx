import Link from "next/link";
import { StageRail, StateBadge } from "./console";
import { Icon, ROLE_ICON, ROLE_VAR } from "./Icons";
import { durationMs, fmtAgo, fmtDuration, investigationHref, isRelayNote, ROLE_NAME, stateOf } from "@/lib/derive";
import type { Event, Investigation } from "@/lib/types";

/** The run in progress (or the latest one), big: its stages and its last few steps, updating live. */
export function NowWatching({ inv, events, now }: { inv: Investigation; events: Event[]; now: number }) {
  const live = inv.status === "running";
  const steps = events.filter((e) => e.kind !== "banner" && !isRelayNote(e)).slice(-5).reverse();
  return (
    <div className="watch">
      <div className="watch-top">
        <div>
          <div className="watch-k">
            <span className={`pulse${live ? " on" : ""}`} aria-hidden="true" />
            {live ? "Now watching" : "Latest run"}
            <span className="mono">· {inv.repo} #{inv.pr_number} · attempt {inv.attempt}</span>
          </div>
          <h2 className="watch-t">
            <Link href={investigationHref(inv)}>{inv.pr_title ?? `Pull request #${inv.pr_number}`}</Link>
          </h2>
          <div className="watch-m">
            <StateBadge state={stateOf(inv)} />
            <span>by {inv.contributor ?? "unknown"}</span>
            <span>{live ? "running for" : "took"} {fmtDuration(durationMs(inv, now))}</span>
            <span>{fmtAgo(inv.started_at, now)}</span>
          </div>
        </div>
        <Link className="btn btn-light btn-sm" href={investigationHref(inv)}>
          Open the investigation <Icon id="i-arrow" size={14} />
        </Link>
      </div>
      <StageRail inv={inv} events={events} style={{ marginTop: 24 }} />
      {steps.length > 0 && (
        <ol className="watch-steps" aria-label="Latest steps">
          {steps.map((e) => (
            <li key={e.id} style={{ "--c": e.kind === "error" ? "var(--bad)" : ROLE_VAR[e.role] } as React.CSSProperties}>
              <Icon id={e.kind === "error" ? "i-no" : ROLE_ICON[e.role]} size={15} />
              <b>{ROLE_NAME[e.role]}</b>
              <span className="x">
                {e.kind === "test_run"
                  ? `${e.data.test ?? ""} @ ${e.data.ref} → ${String(e.data.outcome ?? "").toUpperCase()}`
                  : e.kind === "comment"
                    ? "posted the evidence comment on GitHub"
                    : e.message}
              </span>
              <time>{new Date(e.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })}</time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
