import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Eye, GitPullRequest, ShieldAlert } from "lucide-react";
import { Outcome, Reveal, RoleTag, StageTracker, StateBadge } from "@/components/argus/kit";
import { CodeBlock } from "@/components/argus/code";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  durationMs, failingCases, fmtDuration, fmtTime, investigationHref, isRelayNote, scribeReason, short, skepticCaught,
  stageDurations, stateOf, testFiles, testImports, testSource,
} from "@/lib/derive";
import { getAttempts, getEvents } from "@/lib/supabase";
import { type Event, type Investigation } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; pr: string; attempt: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: `${p.owner}/${p.repo} #${p.pr} · attempt ${p.attempt}` };
}

export default async function InvestigationPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const repo = `${p.owner}/${p.repo}`;
  const pr = Number(p.pr), attempt = Number(p.attempt);
  if (!Number.isInteger(pr) || !Number.isInteger(attempt)) notFound();

  let attempts: Investigation[] = [], events: Event[] = [];
  let loadError: string | null = null;
  try {
    attempts = await getAttempts(repo, pr);
    const found = attempts.find((a) => a.attempt === attempt);
    events = found ? await getEvents([found.id]) : [];
  } catch (e) {
    loadError = (e as Error).message;
  }
  if (loadError) {
    return <main className="mx-auto max-w-[1100px] px-5 pt-32 md:px-8"><Card><CardContent className="py-6 text-sm text-muted-foreground">Couldn&apos;t reach the event log ({loadError}). Refresh in a moment.</CardContent></Card></main>;
  }
  const inv = attempts.find((a) => a.attempt === attempt);
  if (!inv) notFound();

  const now = Date.now();
  const state = stateOf(inv);
  const runs = events.filter((e) => e.kind === "test_run");
  const failing = failingCases(events);
  const files = testFiles(events);
  const reason = scribeReason(events);
  const caught = skepticCaught(events);
  const base = investigationHref(inv);
  const newer = attempts.filter((a) => a.attempt > attempt).at(-1);
  const needsFix = state === "changes-needed" || state === "not-reproduced";

  // The regression test to add: each failing test function, plus the imports it needs.
  const brief = failing
    .map((c) => {
      const f = files.find((x) => x.file === c.file) ?? files.find((x) => testSource(x.content, c.test));
      return f ? { file: f.file, src: testSource(f.content, c.test), imports: testImports(f.content) } : null;
    })
    .filter((x): x is { file: string; src: string; imports: string } => !!x?.src);
  const briefFile = brief[0]?.file?.replace(/^test_argus_\d+/, "test_regression") ?? "test_regression.py";
  const briefCode = brief.length ? [brief[0].imports, ...[...new Set(brief.map((b) => b.src))]].join("\n\n\n") + "\n" : "";

  return (
    <main className="mx-auto max-w-[1100px] px-5 pb-24 md:px-8">
      <Reveal as="section" className="space-y-5 border-b border-border pb-8 pt-28 md:pt-32">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
          <GitPullRequest className="size-3.5" aria-hidden />
          <span>{inv.repo} #{inv.pr_number}</span>
          <span>·</span>
          <span>by {inv.contributor ?? "unknown"}</span>
          <span>·</span>
          <span>head {short(inv.head_sha)}</span>
          {inv.status === "running" && <LiveRefresh running investigationIds={[inv.id]} />}
        </div>
        <h1 className="max-w-4xl font-serif text-3xl font-light leading-tight text-balance md:text-5xl">{inv.pr_title ?? "Untitled pull request"}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StateBadge state={state} size="lg" />
          {reason && <span className="text-sm text-pretty text-muted-foreground">{reason}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inv.pr_url && <Button asChild size="sm" variant="outline"><a href={inv.pr_url}>Pull request<ArrowUpRight /></a></Button>}
          {inv.comment_url && <Button asChild size="sm" variant="outline"><a href={inv.comment_url}>Argus comment<ArrowUpRight /></a></Button>}
          <Button asChild size="sm" variant="secondary"><Link href={`${base}/bundle`}>Verify it yourself</Link></Button>
          {attempts.length > 1 && (
            <nav className="ml-auto flex items-center gap-1 rounded-lg border border-border p-1" aria-label="Attempts">
              {attempts.map((a) => (
                <Link key={a.id} href={investigationHref(a)} aria-current={a.attempt === attempt ? "page" : undefined}
                  className={cn("rounded-md px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground", a.attempt === attempt && "bg-secondary text-foreground")}>
                  attempt {a.attempt}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {newer && <p className="text-sm text-muted-foreground">A newer attempt exists: <Link className="underline underline-offset-4 hover:text-foreground" href={investigationHref(newer)}>attempt {newer.attempt}, {stateOf(newer).replace("-", " ")}</Link>.</p>}
      </Reveal>

      {needsFix && (
        <Reveal as="section" className="mt-8">
          <Card id="fix" className="scroll-mt-28 gap-5 border-bad/40">
            <CardHeader>
              <CardTitle className="font-serif text-2xl font-light">Fix-it brief</CardTitle>
              <CardDescription className="text-pretty">
                {state === "not-reproduced"
                  ? "Argus couldn't make the reported bug happen on main. Add a failing test that shows it, or point to the exact input."
                  : "Argus confirmed the bug and that this PR fixes the reported input, but these inputs of the same kind still fail. Fix them, add the test below, and push: Argus re-checks automatically."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {failing.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Still failing on this PR</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {failing.map((c) => (
                      <li key={c.test} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
                        <span className="font-mono text-sm">{c.input}</span>
                        <span className="font-mono text-xs text-bad">{c.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {briefCode && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Add this regression test</h3>
                  <p className="text-sm text-muted-foreground">Written by the agents for this PR. Save it as <span className="font-mono text-foreground">tests/{briefFile}</span>; it fails now and should pass once the fix is complete.</p>
                  <CodeBlock code={briefCode} title={`tests/${briefFile}`} />
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Check it before you push</h3>
                <CodeBlock code={`pytest tests/${briefFile} -q`} title="terminal" />
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {caught && (
        <Reveal as="section" className="mt-6">
          <Card className="gap-2 border-skp/40 py-5">
            <CardContent className="flex gap-3 px-5">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-skp" aria-hidden />
              <p className="text-sm text-pretty">
                <span className="font-medium">The Skeptic broke the proof.</span>{" "}
                <span className="text-muted-foreground">The Reproducer ({inv.reproducer_model ?? "?"}) showed the reported case is fixed; the Skeptic, on a different model ({inv.skeptic_model ?? "?"}), found inputs of the same kind that still fail.</span>
              </p>
            </CardContent>
          </Card>
        </Reveal>
      )}

      <Reveal as="section" className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">
          Stages · {inv.status === "running" ? `running for ${fmtDuration(durationMs(inv, now))}` : `label to verdict in ${fmtDuration(durationMs(inv, now))}`}
        </h2>
        <StageTracker stage={inv.stage} status={inv.status} durations={stageDurations(events)} attempt={inv.attempt} />
      </Reveal>

      {runs.length > 0 && (
        <Reveal as="section" className="mt-12">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Test runs · all in a sandbox with no network</h2>
          <Accordion type="multiple" className="rounded-lg border border-border">
            {runs.map((e) => (
              <AccordionItem key={e.id} value={String(e.id)} className="px-4">
                <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                  <div className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 text-left sm:grid-cols-[9rem_1fr_auto]">
                    <RoleTag role={e.role} />
                    <span className="truncate font-mono text-xs text-muted-foreground sm:order-none">{e.data.test ?? "suite"} @ {e.data.ref ?? "?"}</span>
                    <span className="text-xs"><Outcome outcome={e.data.outcome} /></span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  {e.data.summary && <p className="font-mono text-xs text-muted-foreground">{e.data.summary}</p>}
                  {e.data.content && <CodeBlock code={e.data.content} title={e.data.test_file ?? "test file"} />}
                  {e.data.log_tail && <CodeBlock code={e.data.log_tail} title={`${e.data.label ?? "run"}.log · last lines`} />}
                  {!e.data.content && !e.data.log_tail && <p className="text-xs text-muted-foreground">This run predates published test files and logs.</p>}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      )}

      <Reveal as="section" className="mt-12">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Timeline</h2>
        <ol className="space-y-2 border-l border-border pl-5">
          {events.filter((e) => e.kind !== "test_run" && !isRelayNote(e)).map((e) => (
            <li key={e.id} className="relative">
              <i className="absolute -left-[23.5px] top-2 size-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-mono text-xs text-faint tabular-nums">{fmtTime(e.created_at)}</span>
                {e.kind === "banner" ? (
                  <span className="font-mono text-xs text-faint">{e.message}</span>
                ) : (
                  <>
                    <RoleTag role={e.role} />
                    <span className="min-w-0 break-words text-pretty">
                      {e.kind === "comment" ? <a className="underline underline-offset-4" href={e.message}>posted the evidence comment</a> : e.message}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <p className="mt-12 flex items-center gap-2 text-xs text-muted-foreground">
        <Eye className="size-3.5" aria-hidden /> Reproducer {inv.reproducer_model ?? "?"} · Skeptic {inv.skeptic_model ?? "?"} · started {fmtTime(inv.started_at)}
      </p>
    </main>
  );
}
