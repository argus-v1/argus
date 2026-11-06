import type { Metadata } from "next";
import Link from "next/link";
import { InvestigationsTable, LoadError, StageBar, StateBadge } from "@/components/console";
import { NowWatching } from "@/components/NowWatching";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageHero } from "@/components/PageHero";
import { durationMs, fmtAgo, fmtDuration, investigationHref, latestPerPr, median, ROLE_NAME, stateOf, type State } from "@/lib/derive";
import { INSTALL_URL } from "@/lib/site";
import { getEvents, listInvestigations } from "@/lib/supabase";
import { STAGE_ROLE, type Investigation } from "@/lib/types";
import "../console.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Console" };

const COLUMNS: { key: string; title: string; states: State[] }[] = [
  { key: "running", title: "Verifying", states: ["running"] },
  { key: "changes", title: "Changes needed", states: ["changes-needed", "not-reproduced"] },
  { key: "verified", title: "Verified", states: ["verified"] },
  { key: "human", title: "Needs a maintainer", states: ["needs-human", "stopped"] },
];

export default async function Console({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const { repo } = await searchParams;
  let all: Investigation[];
  try {
    all = await listInvestigations();
  } catch (e) {
    return (
      <main className="con"><div className="wrap"><div className="phead"><div><h1>Console</h1></div></div><div className="sect"><LoadError what="the console" message={(e as Error).message} /></div></div></main>
    );
  }
  const repos = [...new Set(all.map((r) => r.repo))].sort();
  const rows = repo ? all.filter((r) => r.repo === repo) : all;
  const now = Date.now();
  const prs = latestPerPr(rows);
  const running = rows.filter((r) => r.status === "running");
  const finished = rows.filter((r) => r.status === "done" && r.finished_at);
  const focus = running[0] ?? rows[0];
  const focusEvents = focus ? await getEvents([focus.id]).catch(() => []) : [];
  const verifiedPrs = prs.filter((r) => r.verdict === "verified").length;
  const sentBack = rows.filter((r) => r.verdict === "changes-needed" || r.verdict === "not-reproduced").length;
  const medianMs = median(finished.map((r) => durationMs(r, now)!).filter((x) => x != null));
  const weekAgo = now - 7 * 864e5;
  const thisWeek = rows.filter((r) => Date.parse(r.started_at) > weekAgo).length;

  return (
    <main className="con">
      <PageHero art="/peacock.webp" position="40% 45%" credit="Peter Paul Rubens, Juno and Argus, c. 1610 (detail)" tall>
        <h1>A hundred eyes on <em>every pull request.</em></h1>
        <p className="lede">Every pull request Argus has checked, live from the event log. Open one to see who ran what, and the proof behind the verdict.</p>
        <div className="row"><LiveRefresh running={running.length > 0} /></div>
      </PageHero>
      <div className="wrap">
        <div className="lift">
          <div className="frame">
            {focus ? (
              <NowWatching inv={focus} events={focusEvents} now={now} />
            ) : (
              <div className="empty"><h3>Waiting for the first pull request</h3><p>Add the <span className="mono">argus</span> label to a pull request and it appears here, live.</p></div>
            )}
          </div>
        </div>

        {repos.length > 1 && (
          <nav className="filters" aria-label="Repository" style={{ marginTop: 24 }}>
            <Link className="fchip" href="/console" aria-current={!repo ? "true" : undefined}>All repositories</Link>
            {repos.map((r) => (
              <Link key={r} className="fchip" href={`/console?repo=${encodeURIComponent(r)}`} aria-current={repo === r ? "true" : undefined}>{r}</Link>
            ))}
          </nav>
        )}

        {all.length === 0 ? (
          <div className="sect">
            <div className="empty">
              <h3>No pull requests checked yet</h3>
              <p>Install the Argus GitHub App on a repository and add the <span className="mono">argus</span> label to a pull request. Its investigation shows up here as it runs.</p>
              <p style={{ marginTop: 20 }}><a className="btn btn-light" href={INSTALL_URL}>Install the GitHub App</a></p>
            </div>
          </div>
        ) : (
          <>
            <section className="sect" aria-label="Totals">
              <div className="stats">
                <div className="stat"><div className="k">Pull requests</div><div className="v">{prs.length}</div><div className="n">{rows.length} runs in all · {thisWeek} this week</div></div>
                <div className="stat"><div className="k">Verified</div><div className="v">{verifiedPrs}</div><div className="n">latest attempt proved every claim</div></div>
                <div className="stat"><div className="k">Sent back</div><div className="v">{sentBack}</div><div className="n">runs that found a gap or no bug</div></div>
                <div className="stat"><div className="k">Label to verdict</div><div className="v">{medianMs == null ? "–" : fmtDuration(medianMs)}</div><div className="n">median across {finished.length} finished runs</div></div>
              </div>
            </section>

            {running.length > 0 && (
              <section className="sect">
                <header><h2>Running now</h2><p className="hint">Updates as each agent finishes.</p></header>
                <div className="runnow">
                  {running.map((r) => (
                    <Link key={r.id} className="rcard" href={investigationHref(r)}>
                      <div className="m"><span>{r.repo} #{r.pr_number} · attempt {r.attempt}</span><span>{fmtDuration(durationMs(r, now))}</span></div>
                      <div className="t">{r.pr_title ?? "Untitled pull request"}</div>
                      <StageBar inv={r} />
                      <div className="now">{ROLE_NAME[STAGE_ROLE[r.stage]]} is {r.stage}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="sect">
              <header><h2>Pull requests by verdict</h2><p className="hint">Latest attempt of each pull request.</p></header>
              <div className="queue">
                {COLUMNS.map((col) => {
                  const items = prs.filter((r) => col.states.includes(stateOf(r)));
                  return (
                    <div className="qcol" key={col.key}>
                      <header><StateBadge state={col.states[0]} /><b>{items.length}</b></header>
                      <div className="qlist">
                        {items.length === 0 && <div className="qempty">None right now.</div>}
                        {items.map((r) => (
                          <Link key={r.id} className="qcard" href={investigationHref(r)}>
                            <div className="t">{r.pr_title ?? "Untitled pull request"}</div>
                            <div className="m">#{r.pr_number} · {r.contributor ?? "unknown"} · attempt {r.attempt} · {fmtAgo(r.started_at, now)}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sect">
              <header><h2>Recent runs</h2><p className="hint"><Link className="u" href="/investigations">All investigations</Link> · <Link className="u" href="/evals">Evals</Link></p></header>
              <InvestigationsTable rows={rows.slice(0, 12)} now={now} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

