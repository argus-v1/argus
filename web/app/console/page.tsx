import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileWarning, GitMerge, Hand, Timer } from "lucide-react";
import { PageHeader, Reveal, StageTracker, StateBadge } from "@/components/argus/kit";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  durationMs, failingCases, fmtAgo, fmtDuration, investigationHref, latestPerPr, median, ROLE_NAME, scribeReason, stateOf,
} from "@/lib/derive";
import { prStates, type PrState } from "@/lib/github";
import { INSTALL_URL } from "@/lib/site";
import { getEvents, listInvestigations } from "@/lib/supabase";
import { STAGE_ROLE, type Event, type Investigation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Maintainer queue" };

const STALE_MS = 15 * 60 * 1000;

type Lane = "merge" | "contributor" | "eyes";

function laneOf(inv: Investigation, now: number): Lane | null {
  const s = stateOf(inv);
  if (s === "verified") return "merge";
  if (s === "changes-needed" || s === "not-reproduced") return "contributor";
  if (s === "needs-human" || s === "stopped") return "eyes";
  if (s === "running" && now - Date.parse(inv.started_at) > STALE_MS) return "eyes";
  return null;
}

export default async function Queue({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const { repo } = await searchParams;
  let all: Investigation[] = [];
  let loadError: string | null = null;
  try {
    all = await listInvestigations();
  } catch (e) {
    loadError = (e as Error).message;
  }
  const now = Date.now();
  const repos = [...new Set(all.map((r) => r.repo))].sort();
  const rows = repo ? all.filter((r) => r.repo === repo) : all;
  const prs = latestPerPr(rows);
  const states = await prStates(prs);
  const isOpen = (inv: Investigation) => (states.get(`${inv.repo}#${inv.pr_number}`) ?? "open") === "open";

  const openPrs = prs.filter(isOpen);
  const lanes: Record<Lane, Investigation[]> = { merge: [], contributor: [], eyes: [] };
  for (const inv of openPrs) {
    const l = laneOf(inv, now);
    if (l) lanes[l].push(inv);
  }
  const running = rows.filter((r) => r.status === "running" && now - Date.parse(r.started_at) <= STALE_MS);
  const laneEvents = await getEvents([...lanes.contributor, ...lanes.eyes, ...running].map((r) => r.id)).catch(() => [] as Event[]);
  const eventsOf = (id: string) => laneEvents.filter((e) => e.investigation_id === id);
  const finished = rows.filter((r) => r.status === "done" && r.finished_at);
  const medianMs = median(finished.map((r) => durationMs(r, now)).filter((x): x is number => x != null));
  const closed = prs.filter((p) => !isOpen(p));

  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
      <PageHeader
        eyebrow="Maintainer queue"
        title="What needs you,"
        accent="and what doesn't."
        lede="Every pull request Argus has checked, sorted by the one thing you need to do next. Verified ones are ready to merge; the rest say exactly what's missing."
      >
        <LiveRefresh running={running.length > 0} />
        <Button asChild variant="outline" size="sm"><a href={INSTALL_URL}>Install on a repo</a></Button>
      </PageHeader>

      {repos.length > 1 && (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Repository">
          <Button asChild size="sm" variant={!repo ? "secondary" : "ghost"}><Link href="/console">All repositories</Link></Button>
          {repos.map((r) => (
            <Button key={r} asChild size="sm" variant={repo === r ? "secondary" : "ghost"}><Link href={`/console?repo=${encodeURIComponent(r)}`}>{r}</Link></Button>
          ))}
        </nav>
      )}

      {loadError && (
        <Card className="mt-8"><CardContent className="py-6 text-sm text-muted-foreground">Couldn&apos;t reach the event log ({loadError}). Refresh in a moment.</CardContent></Card>
      )}

      {!loadError && all.length === 0 && (
        <Card className="mt-8">
          <CardContent className="py-10 text-center">
            <h2 className="font-serif text-2xl">No pull requests checked yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Install the Argus GitHub App and add the <span className="font-mono">argus</span> label to a pull request. It shows up here as it runs.</p>
          </CardContent>
        </Card>
      )}

      {all.length > 0 && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
            {[
              { icon: GitMerge, k: "Ready to merge", v: lanes.merge.length, n: "every claim proven" },
              { icon: FileWarning, k: "Waiting on contributor", v: lanes.contributor.length, n: "a gap or no bug found" },
              { icon: Hand, k: "Needs your eyes", v: lanes.eyes.length, n: "stopped, stuck or unclear" },
              { icon: Timer, k: "Label to verdict", v: medianMs == null ? "–" : fmtDuration(medianMs), n: `median of ${finished.length} runs` },
            ].map((s, i) => (
              <Reveal key={s.k} index={i}>
                <Card className="gap-2 py-5">
                  <CardContent className="space-y-1 px-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><s.icon className="size-3.5" aria-hidden />{s.k}</div>
                    <div className="font-serif text-4xl font-light tabular-nums">{s.v}</div>
                    <div className="text-xs text-muted-foreground">{s.n}</div>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </section>

          {running.length > 0 && (
            <section className="mt-10 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Verifying now</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {running.map((r, i) => (
                  <Reveal key={r.id} index={i}>
                    <Link href={investigationHref(r)} className="block">
                      <Card className="gap-4 py-5 transition-colors hover:bg-accent/40">
                        <CardContent className="space-y-4 px-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-mono text-xs text-muted-foreground">{r.repo} #{r.pr_number} · attempt {r.attempt}</div>
                              <div className="truncate font-medium">{r.pr_title ?? "Untitled pull request"}</div>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmtDuration(durationMs(r, now))}</span>
                          </div>
                          <StageTracker stage={r.stage} status={r.status} attempt={r.attempt} compact />
                          <div className="text-xs text-muted-foreground">{ROLE_NAME[STAGE_ROLE[r.stage]]} is {r.stage}…</div>
                        </CardContent>
                      </Card>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label="Queue">
            <LaneColumn title="Ready to merge" hint="Argus proved every claim. Review the diff and merge." items={lanes.merge} empty="Nothing verified and open right now.">
              {(inv) => (
                <>
                  <p className="text-xs text-muted-foreground">Verified on attempt {inv.attempt} · {fmtAgo(inv.finished_at ?? inv.started_at, now)}</p>
                  <div className="flex flex-wrap gap-2">
                    {inv.pr_url && <Button asChild size="sm"><a href={inv.pr_url}>Review &amp; merge<ArrowUpRight /></a></Button>}
                    <Button asChild size="sm" variant="ghost"><Link href={investigationHref(inv)}>Evidence</Link></Button>
                  </div>
                </>
              )}
            </LaneColumn>

            <LaneColumn title="Waiting on contributor" hint="Argus found a gap. The contributor has a fix-it brief; a new push re-checks automatically." items={lanes.contributor} empty="No pull request is waiting on a fix.">
              {(inv) => {
                const cases = failingCases(eventsOf(inv.id)).slice(0, 4);
                const reason = scribeReason(eventsOf(inv.id));
                return (
                  <>
                    {reason && <p className="text-sm text-pretty text-muted-foreground">{reason}</p>}
                    {cases.length > 0 && (
                      <ul className="space-y-1">
                        {cases.map((c) => (
                          <li key={c.test} className="flex items-baseline justify-between gap-3 font-mono text-xs">
                            <span className="truncate">{c.input}</span>
                            <span className="shrink-0 text-bad">{c.message.split(":")[0]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary"><Link href={`${investigationHref(inv)}#fix`}>Fix-it brief</Link></Button>
                      {inv.pr_url && <Button asChild size="sm" variant="ghost"><a href={inv.pr_url}>Open PR<ArrowUpRight /></a></Button>}
                    </div>
                  </>
                );
              }}
            </LaneColumn>

            <LaneColumn title="Needs your eyes" hint="Argus couldn't finish or wasn't sure. A person should look." items={lanes.eyes} empty="Nothing is stuck.">
              {(inv) => {
                const err = eventsOf(inv.id).filter((e) => e.kind === "error").at(-1);
                const why = inv.verdict === "needs-human" ? scribeReason(eventsOf(inv.id)) ?? "The agents disagreed." : err?.message ?? (inv.status === "running" ? "Running for over 15 minutes." : "The run stopped before a verdict.");
                return (
                  <>
                    <p className="text-sm text-pretty text-muted-foreground">{why}</p>
                    <p className="text-xs text-muted-foreground">Re-add the <span className="font-mono">argus</span> label to run it again.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary"><Link href={investigationHref(inv)}>What happened</Link></Button>
                      {inv.pr_url && <Button asChild size="sm" variant="ghost"><a href={inv.pr_url}>Open PR<ArrowUpRight /></a></Button>}
                    </div>
                  </>
                );
              }}
            </LaneColumn>
          </section>

          {closed.length > 0 && (
            <Reveal as="section" className="mt-10">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Closed or merged since Argus checked them</h2>
              <div className="flex flex-wrap gap-2">
                {closed.map((c) => (
                  <Link key={c.id} href={investigationHref(c)}>
                    <Badge variant="outline" className="gap-2 py-1 font-normal text-muted-foreground hover:text-foreground">
                      <span className="font-mono">#{c.pr_number}</span>
                      {c.pr_title?.slice(0, 48) ?? "Untitled"}
                      <span className="text-faint">· {states.get(`${c.repo}#${c.pr_number}`) as PrState}</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </Reveal>
          )}

          <p className="mt-10 text-sm text-muted-foreground">
            <Link className="underline underline-offset-4 hover:text-foreground" href="/investigations">All investigations</Link> ·{" "}
            <Link className="underline underline-offset-4 hover:text-foreground" href="/evals">How well the agents do</Link>
          </p>
        </>
      )}
    </main>
  );
}

function LaneColumn({
  title, hint, items, empty, children,
}: { title: string; hint: string; items: Investigation[]; empty: string; children: (inv: Investigation) => React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="flex items-center justify-between text-base font-medium">
          {title}
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{items.length}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {items.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>}
        {items.map((inv, i) => (
          <Reveal key={inv.id} index={i} className="space-y-3 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{inv.repo} #{inv.pr_number} · {inv.contributor ?? "unknown"}</div>
                <Link href={investigationHref(inv)} className="line-clamp-2 font-medium hover:underline">{inv.pr_title ?? "Untitled pull request"}</Link>
              </div>
              <StateBadge state={stateOf(inv)} />
            </div>
            {children(inv)}
          </Reveal>
        ))}
      </CardContent>
    </Card>
  );
}

