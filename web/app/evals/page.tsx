import type { Metadata } from "next";
import { Bars } from "@/components/argus/bars";
import { PageHeader, Reveal, RoleTag } from "@/components/argus/kit";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { durationMs, fmtDuration, median, ROLE_NAME, skepticCaught, stateOf, STATE_WORDS, type State } from "@/lib/derive";
import { getEvents, listInvestigations } from "@/lib/supabase";
import { AGENTS, type Event, type Investigation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evals" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const ORDER: State[] = ["verified", "changes-needed", "not-reproduced", "needs-human", "stopped", "running"];

type Run = { inv: Investigation; events: Event[]; caught: boolean; reproSaidFixed: boolean };

export default async function Evals() {
  let invs: Investigation[] = [];
  let events: Event[] = [];
  let loadError: string | null = null;
  try {
    invs = await listInvestigations();
    events = await getEvents(invs.map((i) => i.id));
  } catch (e) {
    loadError = (e as Error).message;
  }
  const now = Date.now();
  const runs: Run[] = invs.map((inv) => {
    const ev = events.filter((e) => e.investigation_id === inv.id);
    const repro = ev.find((e) => e.role === "reproducer" && e.kind === "message");
    return { inv, events: ev, caught: skepticCaught(ev), reproSaidFixed: /PR fixes claim: True/i.test(repro?.message ?? "") };
  });
  const finished = runs.filter((r) => r.inv.status === "done");
  const challenged = runs.filter((r) => r.reproSaidFixed);
  const caught = runs.filter((r) => r.caught).length;
  const medianMs = median(finished.map((r) => durationMs(r.inv, now)).filter((x): x is number => x != null));

  const pairs = [...new Set(invs.map((i) => `${i.reproducer_model ?? "?"} × ${i.skeptic_model ?? "?"}`))].map((pair) => {
    const rs = runs.filter((r) => `${r.inv.reproducer_model ?? "?"} × ${r.inv.skeptic_model ?? "?"}` === pair);
    const done = rs.filter((r) => r.inv.status === "done");
    return {
      pair,
      runs: rs.length,
      verified: rs.filter((r) => r.inv.verdict === "verified").length,
      caught: rs.filter((r) => r.caught).length,
      challenged: rs.filter((r) => r.reproSaidFixed).length,
      stopped: rs.filter((r) => stateOf(r.inv) === "stopped").length,
      med: median(done.map((r) => durationMs(r.inv, now)).filter((x): x is number => x != null)),
    };
  });

  const agentTimes = AGENTS.map((role) => {
    const xs = runs.map((r) => r.events.find((e) => e.role === role && e.kind === "message")?.duration_ms).filter((x): x is number => x != null);
    return { key: role, label: ROLE_NAME[role], value: median(xs), note: `${xs.length} runs` };
  });
  const mix = ORDER.map((s) => ({ s, n: runs.filter((r) => stateOf(r.inv) === s).length })).filter((m) => m.n > 0);

  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
      <PageHeader eyebrow="Evals" title="How well the agents" accent="actually do." lede="Computed from real runs in the event log, by model pair. A pair with no runs says so instead of guessing.">
        <LiveRefresh running={invs.some((i) => i.status === "running")} />
      </PageHeader>

      {loadError && <Card className="mt-8"><CardContent className="py-6 text-sm text-muted-foreground">Couldn&apos;t reach the event log ({loadError}).</CardContent></Card>}
      {!loadError && runs.length === 0 && <Card className="mt-8"><CardContent className="py-10 text-center text-sm text-muted-foreground">Evals fill in from real investigations.</CardContent></Card>}

      {runs.length > 0 && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { k: "Runs", v: String(runs.length), n: `${finished.length} finished · ${runs.length - finished.length} stopped or running` },
              { k: "Skeptic catches", v: `${caught} / ${challenged.length}`, n: "the PR passed the Reproducer's test, and the Skeptic still found a gap" },
              { k: "Agreement", v: pct(challenged.length - caught, challenged.length), n: "Skeptic confirmed the Reproducer" },
              { k: "Label to verdict", v: medianMs == null ? "–" : fmtDuration(medianMs), n: "median of finished runs" },
            ].map((s, i) => (
              <Reveal key={s.k} index={i}>
                <Card className="h-full gap-2 py-5">
                  <CardContent className="space-y-1 px-5">
                    <div className="text-xs text-muted-foreground">{s.k}</div>
                    <div className="font-serif text-4xl font-light tabular-nums">{s.v}</div>
                    <div className="text-xs text-pretty text-muted-foreground">{s.n}</div>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </section>

          <Reveal as="section" className="mt-10">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b border-border py-5">
                <CardTitle className="text-base font-medium">Model pairs</CardTitle>
                <CardDescription>The Reproducer and Skeptic run on different providers on purpose. Pairs appear as they get runs.</CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Reproducer × Skeptic</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">Skeptic catches</TableHead>
                    <TableHead className="text-right">Stopped</TableHead>
                    <TableHead className="pr-6 text-right">Median time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs.map((p) => (
                    <TableRow key={p.pair}>
                      <TableCell className="pl-6 font-mono text-sm">{p.pair}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.runs}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.verified}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.caught} <span className="text-muted-foreground">/ {p.challenged}</span></TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.stopped}</TableCell>
                      <TableCell className="pr-6 text-right font-mono text-xs tabular-nums">{fmtDuration(p.med)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Reveal>

          <section className="mt-10 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Time per agent</CardTitle>
                  <CardDescription>Median time from being asked to handing over its file.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Bars rows={agentTimes.map((a) => ({ ...a, tag: <RoleTag role={a.key} /> }))} />
                </CardContent>
              </Card>
            </Reveal>
            <Reveal index={1}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Verdicts</CardTitle>
                  <CardDescription>All {runs.length} runs, by outcome.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Bars rows={mix.map((m) => ({ key: m.s, label: STATE_WORDS[m.s], value: m.n, note: pct(m.n, runs.length), count: true }))} />
                </CardContent>
              </Card>
            </Reveal>
          </section>
        </>
      )}
    </main>
  );
}
