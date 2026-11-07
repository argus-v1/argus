import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleDot, GitMerge, XCircle } from "lucide-react";
import { Outcome, PageHeader, Reveal, RoleTag, StageTracker, StateBadge } from "@/components/argus/kit";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  durationMs, failingCases, fmtAgo, fmtDuration, investigationHref, isRelayNote, latestPerPr, median,
  scribeReason, skepticCaught, stageDurations, stateOf, STATE_WORDS, type State,
} from "@/lib/derive";
import { prStates, type PrState } from "@/lib/github";
import { INSTALL_URL } from "@/lib/site";
import { getEvents, listInvestigations } from "@/lib/supabase";
import { AGENTS, STAGES, STAGE_ROLE, type Event, type Investigation, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Console" };

const STALE_MS = 15 * 60 * 1000;
const RECENT_RUNS = 60;

type Lane = "merge" | "contributor" | "eyes";
function laneOf(inv: Investigation, now: number): Lane | null {
  const s = stateOf(inv);
  if (s === "verified") return "merge";
  if (s === "changes-needed" || s === "not-reproduced") return "contributor";
  if (s === "needs-human" || s === "stopped") return "eyes";
  if (s === "running" && now - Date.parse(inv.started_at) > STALE_MS) return "eyes";
  return null;
}

const ATTEMPT_ICON: Record<State, React.ElementType> = {
  verified: CheckCircle2, "changes-needed": XCircle, "not-reproduced": XCircle, "needs-human": CircleDot, running: CircleDot, stopped: CircleDot,
};
const ATTEMPT_TONE: Record<State, string> = {
  verified: "text-ok", "changes-needed": "text-bad", "not-reproduced": "text-bad", "needs-human": "text-amb", running: "text-foreground", stopped: "text-faint",
};

export default async function Console({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
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
  const recent = rows.slice(0, RECENT_RUNS);
  const events = await getEvents(recent.map((r) => r.id)).catch(() => [] as Event[]);
  const byRun = new Map<string, Event[]>();
  for (const e of events) (byRun.get(e.investigation_id) ?? byRun.set(e.investigation_id, []).get(e.investigation_id)!).push(e);
  const eventsOf = (id: string) => byRun.get(id) ?? [];

  const prs = latestPerPr(rows);
  const states = await prStates(prs);
  const ghState = (inv: Investigation): PrState | null => states.get(`${inv.repo}#${inv.pr_number}`) ?? null;
  const isOpen = (inv: Investigation) => (ghState(inv) ?? "open") === "open";
  const lanes: Record<Lane, Investigation[]> = { merge: [], contributor: [], eyes: [] };
  for (const inv of prs.filter(isOpen)) {
    const l = laneOf(inv, now);
    if (l) lanes[l].push(inv);
  }

  // headline figures
  const running = rows.filter((r) => r.status === "running" && now - Date.parse(r.started_at) <= STALE_MS);
  const finished = rows.filter((r) => r.status === "done" && r.finished_at);
  const medianMs = median(finished.map((r) => durationMs(r, now)).filter((x): x is number => x != null));
  const verifiedPrs = prs.filter((p) => p.verdict === "verified").length;
  const sentBack = rows.filter((r) => r.verdict === "changes-needed" || r.verdict === "not-reproduced").length;
  const testRuns = events.filter((e) => e.kind === "test_run");
  const passedRuns = testRuns.filter((e) => e.data.outcome === "passed").length;
  const challenged = recent.filter((r) => eventsOf(r.id).some((e) => e.role === "reproducer" && e.kind === "message" && /PR fixes claim: True/i.test(e.message)));
  const catches = challenged.filter((r) => skepticCaught(eventsOf(r.id))).length;

  // the run to watch: one in progress, else the latest
  const focus = running[0] ?? rows[0];
  const focusEvents = focus ? eventsOf(focus.id) : [];

  // live activity across recent runs
  const runOf = new Map(recent.map((r) => [r.id, r]));
  const activity = events
    .filter((e) => e.kind !== "banner" && !isRelayNote(e))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .slice(0, 40);

  // the agents on watch
  const roster = AGENTS.map((role) => {
    const msgs = events.filter((e) => e.role === role && e.kind === "message");
    const last = msgs.at(-1);
    return {
      role,
      model: last?.model ?? (role === "reproducer" ? focus?.reproducer_model : role === "skeptic" ? focus?.skeptic_model : null) ?? "–",
      runs: msgs.length,
      med: median(msgs.map((m) => m.duration_ms).filter((x): x is number => x != null)),
      last: last?.created_at ?? null,
      busy: running.some((r) => STAGE_ROLE[r.stage] === role),
    };
  });

  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
      <PageHeader
        eyebrow="Console"
        title="Every pull request,"
        accent="on the record."
        lede="What Argus is checking right now, what needs you next, and every run behind it, live from the event log."
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
          <CardContent className="py-12 text-center">
            <h2 className="font-serif text-2xl">No pull requests checked yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Install the Argus GitHub App and add the <span className="font-mono">argus</span> label to a pull request. It shows up here as it runs.</p>
            <Button asChild className="mt-6"><a href={INSTALL_URL}>Install the GitHub App</a></Button>
          </CardContent>
        </Card>
      )}

      {all.length > 0 && (
        <>
          {/* ---- headline figures, one ruled row ---- */}
          <Reveal as="section" className="mt-8">
            <Card className="py-0">
              <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <Figure k="Pull requests" v={prs.length} n={`${rows.length} runs in all`} />
                <Figure k="Verified" v={verifiedPrs} n="latest attempt proved every claim" />
                <Figure k="Sent back" v={sentBack} n="runs that found a gap or no bug" />
                <Figure k="Skeptic catches" v={catches} sub={`/ ${challenged.length}`} n="fixes that passed the first test, then broke on a probe" />
                <Figure k="Sandbox runs" v={testRuns.length} n={`${passedRuns} passed · ${testRuns.length - passedRuns} failed`} />
                <Figure k="Label → verdict" v={medianMs == null ? "–" : fmtDuration(medianMs)} n={`median of ${finished.length} finished runs`} />
              </dl>
            </Card>
          </Reveal>

          {/* ---- the run in focus + what needs you ---- */}
          <section className="mt-6 grid gap-6 lg:grid-cols-12">
            {focus && (
              <Reveal className="min-w-0 lg:col-span-8">
                <Card className="h-full gap-0 py-0">
                  <CardContent className="space-y-6 p-6 md:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span className="relative flex size-2">
                            {running.length > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-amb opacity-60 motion-reduce:animate-none" />}
                            <span className={cn("relative inline-flex size-2 rounded-full", running.length > 0 ? "bg-amb" : "bg-faint")} />
                          </span>
                          <span className="font-sans font-medium uppercase tracking-[0.14em]">{running.length > 0 ? "Now watching" : "Latest run"}</span>
                          <span>· {focus.repo} #{focus.pr_number} · attempt {focus.attempt}</span>
                        </div>
                        <h2 className="font-serif text-3xl font-light leading-tight tracking-tight text-balance">
                          <Link href={investigationHref(focus)} className="hover:underline hover:decoration-1 hover:underline-offset-4">{focus.pr_title ?? `Pull request #${focus.pr_number}`}</Link>
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <StateBadge state={stateOf(focus)} />
                          <span>by <span className="text-foreground">{focus.contributor ?? "unknown"}</span></span>
                          <span className="font-mono text-xs">{focus.reproducer_model ?? "?"} reproduces · {focus.skeptic_model ?? "?"} challenges</span>
                          <span className="font-mono text-xs tabular-nums">{focus.status === "running" ? "running for" : "took"} {fmtDuration(durationMs(focus, now))}</span>
                        </div>
                      </div>
                      <Button asChild size="sm"><Link href={investigationHref(focus)}>Open the investigation<ArrowRight /></Link></Button>
                    </div>

                    <div className="hidden sm:block">
                      <StageTracker stage={focus.stage} status={focus.status} durations={stageDurations(focusEvents)} attempt={focus.attempt} />
                    </div>
                    <div className="space-y-2 sm:hidden">
                      <StageTracker stage={focus.stage} status={focus.status} attempt={focus.attempt} compact />
                      <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                        {(() => {
                          const d = stageDurations(focusEvents);
                          return STAGES.filter((st) => st !== "verdict").map((st) => `${st} ${d[st] != null ? fmtDuration(d[st]) : "–"}`).join(" · ");
                        })()}
                      </p>
                    </div>

                    <FocusReason events={focusEvents} />

                    <ol className="divide-y divide-border" aria-label="Latest steps">
                      {focusEvents.filter((e) => e.kind !== "banner" && !isRelayNote(e)).slice(-7).reverse().map((e) => (
                        <li key={e.id} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm sm:grid-cols-[100px_minmax(0,1fr)_auto]">
                          <RoleTag role={e.role} />
                          <span className="min-w-0 truncate"><StepText e={e} /></span>
                          <time className="font-mono text-xs text-muted-foreground tabular-nums">{fmtAgo(e.created_at, now)}</time>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              </Reveal>
            )}

            <div className={cn("flex min-w-0 flex-col gap-6", focus ? "lg:col-span-4" : "lg:col-span-12")}>
            <Reveal index={1}>
              <Card className="gap-0 py-0">
                <CardHeader className="border-b border-border px-6 py-5">
                  <CardTitle className="text-base font-medium">What needs you</CardTitle>
                  <p className="text-xs text-muted-foreground">Open pull requests, by your next move.</p>
                </CardHeader>
                <CardContent className="divide-y divide-border px-0">
                  <ActionGroup
                    title="Ready to merge" icon={GitMerge} tone="text-ok" items={lanes.merge}
                    empty="Nothing verified and open."
                    cta={(inv) => inv.pr_url ? <a className="inline-flex items-center gap-1 text-xs text-foreground hover:underline" href={inv.pr_url}>Review &amp; merge<ArrowUpRight className="size-3" /></a> : null}
                  />
                  <ActionGroup
                    title="Waiting on contributor" icon={XCircle} tone="text-bad" items={lanes.contributor}
                    empty="No pull request is waiting on a fix."
                    cta={(inv) => <Link className="text-xs text-foreground hover:underline" href={`${investigationHref(inv)}#fix`}>Fix-it brief</Link>}
                  />
                  <ActionGroup
                    title="Needs your eyes" icon={CircleDot} tone="text-amb" items={lanes.eyes}
                    empty="Nothing is stuck."
                    cta={(inv) => <Link className="text-xs text-foreground hover:underline" href={investigationHref(inv)}>What happened</Link>}
                  />
                </CardContent>
              </Card>
            </Reveal>
            <Reveal index={2} className="flex-1">
              <Card className="h-full gap-0 py-0">
                <CardHeader className="border-b border-border px-6 py-5">
                  <CardTitle className="text-base font-medium">On watch</CardTitle>
                  <p className="text-xs text-muted-foreground">The four agents, from their stage reports.</p>
                </CardHeader>
                <CardContent className="px-0">
                  <ul className="divide-y divide-border">
                    {roster.map((a) => (
                      <li key={a.role} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <RoleTag role={a.role as Role} className="[&>span]:text-foreground" />
                            {a.busy && <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-amb">working</Badge>}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{a.model} · {a.runs} reports · median {fmtDuration(a.med)}</div>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">{a.last ? fmtAgo(a.last, now) : "–"}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Reveal>
            </div>
          </section>

          {/* ---- every pull request + live activity (the feed scrolls inside the table's height) ---- */}
          <section className="mt-6 grid gap-6 lg:grid-cols-12">
            <Reveal className="min-w-0 lg:col-span-8">
              <Card className="h-full gap-0 py-0 lg:min-h-[460px]">
                <CardHeader className="flex flex-row items-baseline justify-between border-b border-border px-6 py-5">
                  <div>
                    <CardTitle className="text-base font-medium">Pull requests</CardTitle>
                    <p className="text-xs text-muted-foreground">Each attempt is one run; a push after a verdict starts the next.</p>
                  </div>
                  <Link href="/investigations" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">All runs</Link>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Pull request</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Sandbox</TableHead>
                        <TableHead>Skeptic</TableHead>
                        <TableHead className="text-right">Took</TableHead>
                        <TableHead className="pr-6 text-right">GitHub</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prs.map((p) => {
                        const attempts = rows.filter((r) => r.repo === p.repo && r.pr_number === p.pr_number).sort((a, b) => a.attempt - b.attempt);
                        const ev = eventsOf(p.id);
                        const runs = ev.filter((e) => e.kind === "test_run");
                        const ok = runs.filter((e) => e.data.outcome === "passed").length;
                        const reproFixed = ev.some((e) => e.role === "reproducer" && e.kind === "message" && /PR fixes claim: True/i.test(e.message));
                        const gh = ghState(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="max-w-[300px] pl-6">
                              <Link href={investigationHref(p)} className="block min-w-0">
                                <span className="block truncate font-medium hover:underline">{p.pr_title ?? "Untitled pull request"}</span>
                                <span className="block font-mono text-xs text-muted-foreground">{repo ? "" : `${p.repo} `}#{p.pr_number} · {p.contributor ?? "unknown"}</span>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {attempts.map((a, i) => {
                                  const st = stateOf(a);
                                  const Icon = ATTEMPT_ICON[st];
                                  return (
                                    <span key={a.id} className="flex items-center gap-1">
                                      {i > 0 && <span className="text-faint" aria-hidden>→</span>}
                                      <Link href={investigationHref(a)} title={`Attempt ${a.attempt}: ${STATE_WORDS[st]}`} aria-label={`Attempt ${a.attempt}: ${STATE_WORDS[st]}`} className="rounded-sm p-0.5 hover:bg-accent">
                                        <Icon className={cn("size-4", ATTEMPT_TONE[st])} />
                                      </Link>
                                    </span>
                                  );
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {runs.length ? <span className="text-muted-foreground"><span className="text-foreground">{ok}</span>/{runs.length} passed</span> : <span className="text-faint">–</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {skepticCaught(ev) ? <span className="text-bad">caught a gap</span> : reproFixed ? <span className="text-muted-foreground">confirmed</span> : <span className="text-faint">–</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{fmtDuration(durationMs(p, now))}</TableCell>
                            <TableCell className="pr-6 text-right">
                              {p.pr_url ? (
                                <a href={p.pr_url} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  {gh ?? "open"}<ArrowUpRight className="size-3" />
                                </a>
                              ) : <span className="text-xs text-faint">{gh ?? "–"}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Reveal>

            <Reveal className="relative min-w-0 lg:col-span-4" index={1}>
              <Card className="flex max-h-[560px] flex-col gap-0 py-0 lg:absolute lg:inset-0 lg:max-h-none">
                <CardHeader className="border-b border-border px-6 py-5">
                  <CardTitle className="text-base font-medium">Live activity</CardTitle>
                  <p className="text-xs text-muted-foreground">Agents, sandbox runs and GitHub, newest first.</p>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 [scrollbar-width:thin]">
                  <ol className="divide-y divide-border">
                    {activity.map((e) => {
                      const run = runOf.get(e.investigation_id);
                      return (
                        <li key={e.id}>
                          <Link href={run ? investigationHref(run) : "/investigations"} className="block space-y-1 px-6 py-3 transition-colors hover:bg-accent/40">
                            <div className="flex items-center justify-between gap-3">
                              <RoleTag role={e.role} />
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">#{run?.pr_number} · {fmtAgo(e.created_at, now)}</span>
                            </div>
                            <div className="line-clamp-2 text-sm"><StepText e={e} /></div>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
            </Reveal>
          </section>

          <p className="mt-10 text-sm text-muted-foreground">
            <Link className="underline underline-offset-4 hover:text-foreground" href="/investigations">Every run</Link> ·{" "}
            <Link className="underline underline-offset-4 hover:text-foreground" href="/evals">How well the agents do</Link>
          </p>
        </>
      )}
    </main>
  );
}

function Figure({ k, v, n, sub }: { k: string; v: React.ReactNode; n: string; sub?: string }) {
  return (
    <div className="border-border px-5 py-5 [&:not(:last-child)]:border-b md:[&:not(:last-child)]:border-r lg:border-b-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-2 font-serif text-4xl font-light leading-none tabular-nums">
        {v}{sub && <span className="ml-1 font-sans text-sm text-muted-foreground">{sub}</span>}
      </dd>
      <dd className="mt-2 text-xs leading-snug text-pretty text-muted-foreground">{n}</dd>
    </div>
  );
}

function FocusReason({ events }: { events: Event[] }) {
  const reason = scribeReason(events);
  const cases = failingCases(events).slice(0, 3);
  if (!reason && !cases.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      {reason && <p className="text-sm text-pretty"><span className="text-muted-foreground">Scribe&apos;s reason: </span>{reason}</p>}
      {cases.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {cases.map((c) => (
            <li key={c.test} className="flex items-baseline justify-between gap-4 font-mono text-xs">
              <span className="truncate">{c.input}</span>
              <span className="shrink-0 text-bad">{c.message.split(":")[0]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionGroup({
  title, icon: Icon, tone, items, empty, cta,
}: { title: string; icon: React.ElementType; tone: string; items: Investigation[]; empty: string; cta: (inv: Investigation) => React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium"><Icon className={cn("size-4", tone)} aria-hidden />{title}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.slice(0, 4).map((inv) => (
            <li key={inv.id} className="flex items-baseline justify-between gap-3">
              <Link href={investigationHref(inv)} className="min-w-0 truncate text-sm hover:underline">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{inv.pr_number}</span>{inv.pr_title ?? "Untitled"}
              </Link>
              <span className="shrink-0">{cta(inv)}</span>
            </li>
          ))}
          {items.length > 4 && <li className="text-xs text-muted-foreground">and {items.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}

/** One event as a short readable line. */
function StepText({ e }: { e: Event }) {
  if (e.kind === "test_run") {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs">{e.data.test?.replace(/^tests\//, "") || "tests/"} @ {e.data.ref}</span>
        <Outcome outcome={e.data.outcome} />
      </span>
    );
  }
  if (e.kind === "comment") return <>Posted the evidence comment on GitHub</>;
  if (e.kind === "label") return <>Label set to <span className="font-mono text-xs">{e.message.replace(/^label:\s*/, "")}</span></>;
  if (e.kind === "error") return <span className="text-bad">{e.message}</span>;
  return <>{e.message}</>;
}

