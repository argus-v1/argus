import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadError, Pair, StageRail, StateBadge } from "@/components/console";
import { Icon, ROLE_ICON, ROLE_VAR } from "@/components/Icons";
import { LiveRefresh } from "@/components/LiveRefresh";
import {
  durationMs, fmtDuration, fmtTime, investigationHref, isRelayNote, ROLE_NAME, short, skepticCaught, skepticFindings, stageDurations, stateOf,
} from "@/lib/derive";
import { getAttempts, getEvents } from "@/lib/supabase";
import { AGENTS, STAGES, STAGE_ROLE, type Event, type Investigation } from "@/lib/types";
import "@/app/console.css";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; pr: string; attempt: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: `${p.owner}/${p.repo} #${p.pr} · attempt ${p.attempt}` };
}

const v = (c: string) => ({ "--c": c }) as React.CSSProperties;

export default async function InvestigationPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const repo = `${p.owner}/${p.repo}`;
  const pr = Number(p.pr), attempt = Number(p.attempt);
  if (!Number.isInteger(pr) || !Number.isInteger(attempt)) notFound();

  let attempts: Investigation[], events: Event[];
  try {
    attempts = await getAttempts(repo, pr);
    const inv0 = attempts.find((a) => a.attempt === attempt);
    events = inv0 ? await getEvents([inv0.id]) : [];
  } catch (e) {
    return <main className="con"><div className="wrap"><div className="sect"><LoadError what="this investigation" message={(e as Error).message} /></div></div></main>;
  }
  const inv = attempts.find((a) => a.attempt === attempt);
  if (!inv) notFound();

  const now = Date.now();
  const state = stateOf(inv);
  const durs = stageDurations(events);
  const runs = events.filter((e) => e.kind === "test_run");
  const caught = skepticCaught(events);
  const findings = skepticFindings(events);
  const failedProbes = runs.filter((e) => e.role === "skeptic" && e.data.outcome === "failed" && e.data.ref !== "main");
  const at = STAGES.indexOf(inv.stage);
  const base = investigationHref(inv);
  const scribeMsg = events.find((e) => e.role === "scribe" && e.kind === "message");
  const newer = attempts.filter((a) => a.attempt > attempt).at(-1);
  const github = events.filter((e) => e.kind === "label" || e.kind === "comment");
  const reason = scribeMsg?.message.match(/^verdict:\s*[^·]+·\s*(.+)$/i)?.[1];

  return (
    <main className="con">
      <section className="phero ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/velazquez.webp" alt="" style={{ objectPosition: "80% 40%" }} />
        <div className="wrap">
        <header className="ihead">
          <div className="crumbs">
            <Link href="/investigations">Investigations</Link><span>/</span>
            <Link href={`/console?repo=${encodeURIComponent(repo)}`}>{repo}</Link><span>/</span>
            <span>PR #{pr}</span><span>/</span><span>attempt {attempt}</span>
          </div>
          <h1>{inv.pr_title ?? `Pull request #${pr}`}</h1>
          <div className="imeta">
            <span>by <b>{inv.contributor ?? "unknown"}</b></span>
            <span>head <b>{short(inv.head_sha)}</b> on base <b>{short(inv.base_sha)}</b></span>
            <span>{inv.trigger === "push" ? "re-verified after a push" : "started by the argus label"}</span>
            <span>started <b>{fmtTime(inv.started_at)}</b></span>
            <span>took <b>{fmtDuration(durationMs(inv, now))}</b></span>
          </div>
          <div className="iacts">
            <StateBadge state={state} large />
            {reason && <span style={{ color: "var(--muted)", fontSize: 15 }}>{reason}</span>}
          </div>
          <div className="iacts">
            {inv.pr_url && <a className="btn btn-line btn-sm" href={inv.pr_url}>Pull request on GitHub <Icon id="i-out" size={13} /></a>}
            {inv.comment_url && <a className="btn btn-line btn-sm" href={inv.comment_url}>The Argus comment <Icon id="i-out" size={13} /></a>}
            <Link className="btn btn-light btn-sm" href={`${base}/bundle`}>Verify it yourself <Icon id="i-arrow" size={14} /></Link>
            <LiveRefresh investigationIds={[inv.id]} running={inv.status === "running"} />
          </div>
          {attempts.length > 1 && (
            <nav className="attempts" aria-label="Attempts">
              {attempts.map((a) => (
                <Link key={a.id} href={investigationHref(a)} aria-current={a.attempt === attempt ? "page" : undefined}>
                  Attempt {a.attempt} <StateBadge state={stateOf(a)} />
                </Link>
              ))}
            </nav>
          )}
          {newer && (
            <div className="newer" role="status">
              <span><b>Attempt {newer.attempt}</b> {newer.status === "running" ? "is running now" : "has finished"} on the author&apos;s new push.</span>
              <Link className="btn btn-light btn-sm" href={investigationHref(newer)}>{newer.status === "running" ? "Watch it live" : "See attempt " + newer.attempt} <Icon id="i-arrow" size={14} /></Link>
            </div>
          )}
        </header>
        </div>
        <p className="credit">Diego Velázquez, Mercury and Argus, c. 1659 (detail)</p>
      </section>
      <div className="wrap">

        <StageRail inv={inv} events={events} style={{ marginTop: 32 }} />

        <div className="igrid">
          <section aria-label="Timeline">
            {caught && (
              <div className="callout">
                <div className="r"><Icon id="i-skp" size={15} />THE SKEPTIC BROKE THE PROOF</div>
                <p>The Reproducer showed the PR fixes the reported case. The Skeptic, on a different model ({inv.skeptic_model ?? "?"} vs {inv.reproducer_model ?? "?"}), found {humanFindings(findings)}.</p>
                {failedProbes.map((e) => (
                  <div className="q" key={e.id}>{e.message}{e.data.summary ? ` · ${e.data.summary}` : ""}</div>
                ))}
              </div>
            )}
            {events.length === 0 ? (
              <div className="empty"><h3>Waiting for the first step</h3><p>The Triager is about to start. This page fills in live.</p></div>
            ) : (
              <ol className="tl">
                {events.map((e) => <TimelineItem key={e.id} e={e} />)}
              </ol>
            )}
          </section>

          <aside>
            <div className="panel">
              <header><span>Test runs in the sandbox</span><span>{runs.length}</span></header>
              {runs.length === 0 ? (
                <p style={{ padding: "14px 18px", margin: 0, color: "var(--faint)", fontSize: 14 }}>No test runs yet.</p>
              ) : (
                <ul className="runs">
                  {runs.map((e) => (
                    <li key={e.id}>
                      <span className="lbl" style={{ color: ROLE_VAR[e.role] }}>{e.data.label ?? e.artifact_path}</span>
                      <Outcome o={e.data.outcome} />
                      <span className="sub">{e.data.test} @ {e.data.ref} {short(e.data.sha)} · {fmtDuration(e.duration_ms)}</span>
                      {e.data.summary && <span className="sum">{e.data.summary}</span>}
                      {e.data.log_tail && (
                        <details className="logtail">
                          <summary>Last lines of the log</summary>
                          <pre>{e.data.log_tail}</pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <header><span>On GitHub</span>{inv.pr_url && <a className="u" href={inv.pr_url}>#{pr}</a>}</header>
              {github.length === 0 ? (
                <p style={{ padding: "14px 18px", margin: 0, color: "var(--faint)", fontSize: 14 }}>Nothing posted yet.</p>
              ) : (
                <ul className="ghlog">
                  {github.map((e) => {
                    const lbl = e.message.replace(/^label:\s*/, "");
                    const tone = lbl === "verified" ? "var(--ok)" : lbl === "changes-needed" ? "var(--bad)" : "var(--amb)";
                    return (
                      <li key={e.id}>
                        <Icon id={e.kind === "comment" ? "i-scr" : "i-dot"} size={15} style={{ color: e.kind === "comment" ? "var(--scr)" : tone }} />
                        {e.kind === "comment" ? (
                          <a className="u" href={e.message}>Argus posted the evidence comment</a>
                        ) : (
                          <span>Label set to <span className="lb" style={{ color: tone }}>{lbl}</span></span>
                        )}
                        <time>{new Date(e.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })}</time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="panel">
              <header><span>Who checked what</span><Pair inv={inv} /></header>
              <ul className="who-list">
                {AGENTS.map((r) => {
                  const m = events.find((e) => e.role === r && e.kind === "message");
                  return (
                    <li key={r} style={v(ROLE_VAR[r])}>
                      <Icon id={ROLE_ICON[r]} size={18} style={{ color: "var(--c)" }} />
                      <span>{ROLE_NAME[r]} <span style={{ color: "var(--faint)" }}>· {m?.model ?? "–"}</span></span>
                      <span>{fmtDuration(m?.duration_ms)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

const FINDING_WORDS: Record<string, string> = { gap: "a case the fix misses", regression: "a regression", invalid_test: "a test that does not prove the claim" };
function humanFindings(f: string[]): string {
  const words = f.filter((x) => FINDING_WORDS[x]).map((x) => FINDING_WORDS[x]);
  return words.length ? words.join(" and ") : "a gap";
}

function Outcome({ o }: { o?: string }) {
  if (!o) return <span className="outc">–</span>;
  return (
    <span className={`outc ${o}`}>
      <Icon id={o === "passed" ? "i-ok" : "i-no"} size={13} />
      {o.toUpperCase()}
    </span>
  );
}

function TimelineItem({ e }: { e: Event }) {
  const color = ROLE_VAR[e.role];
  const time = new Date(e.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
  if (e.kind === "banner") {
    return (
      <li className="tev banner" style={v("var(--gold)")}>
        <span className="dot"><Icon id="i-eye" size={14} /></span>
        <div className="body"><div className="txt">{e.message}</div></div>
      </li>
    );
  }
  const kindCls = e.kind === "test_run" ? " run" : e.kind === "error" ? " err" : isRelayNote(e) ? " relay" : "";
  return (
    <li className={`tev${kindCls}`} style={v(e.kind === "error" ? "var(--bad)" : color)}>
      <span className="dot"><Icon id={e.kind === "error" ? "i-no" : ROLE_ICON[e.role]} size={15} /></span>
      <div className="body">
        <div className="who">
          <b>{ROLE_NAME[e.role]}</b>
          {e.model && <span>{e.model}</span>}
          <span>{e.stage}</span>
          <span>{time} UTC</span>
          {e.duration_ms != null && <span>{fmtDuration(e.duration_ms)}</span>}
        </div>
        {e.kind === "test_run" ? (
          <div className="txt">
            <span>{e.data.test ?? e.message} @ {e.data.ref}</span>
            <Outcome o={e.data.outcome} />
            {e.data.summary && <span style={{ color: "var(--muted)" }}>{e.data.summary}</span>}
          </div>
        ) : e.kind === "comment" ? (
          <div className="txt"><a className="u" href={e.message}>Evidence comment posted on GitHub</a></div>
        ) : e.kind === "label" ? (
          <div className="txt"><span className="mono" style={{ fontSize: 13 }}>{e.message}</span></div>
        ) : (
          <div className="txt">{e.message}</div>
        )}
      </div>
    </li>
  );
}
