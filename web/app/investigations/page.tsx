import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Reveal, StateBadge } from "@/components/argus/kit";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { durationMs, fmtAgo, fmtDuration, investigationHref, stateOf, STATE_WORDS, type State } from "@/lib/derive";
import { listInvestigations } from "@/lib/supabase";
import type { Investigation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investigations" };

const FILTERS: State[] = ["running", "verified", "changes-needed", "not-reproduced", "needs-human", "stopped"];

export default async function Investigations({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  let rows: Investigation[] = [];
  let loadError: string | null = null;
  try {
    rows = await listInvestigations();
  } catch (e) {
    loadError = (e as Error).message;
  }
  const present = FILTERS.filter((f) => rows.some((r) => stateOf(r) === f));
  const shown = state ? rows.filter((r) => stateOf(r) === state) : rows;
  const now = Date.now();

  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
      <PageHeader eyebrow="Investigations" title="Every run," accent="with its proof." lede="Newest first. A pull request gets a new attempt each time its author pushes after a verdict.">
        <LiveRefresh running={rows.some((r) => r.status === "running")} />
      </PageHeader>

      {present.length > 1 && (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter by verdict">
          <Button asChild size="sm" variant={!state ? "secondary" : "ghost"}><Link href="/investigations">All · {rows.length}</Link></Button>
          {present.map((f) => (
            <Button key={f} asChild size="sm" variant={state === f ? "secondary" : "ghost"}>
              <Link href={`/investigations?state=${f}`}>{STATE_WORDS[f]} · {rows.filter((r) => stateOf(r) === f).length}</Link>
            </Button>
          ))}
        </nav>
      )}

      {loadError ? (
        <Card className="mt-8"><CardContent className="py-6 text-sm text-muted-foreground">Couldn&apos;t reach the event log ({loadError}). Refresh in a moment.</CardContent></Card>
      ) : shown.length === 0 ? (
        <Card className="mt-8"><CardContent className="py-10 text-center text-sm text-muted-foreground">Runs appear the moment a maintainer adds the <span className="font-mono">argus</span> label to a pull request.</CardContent></Card>
      ) : (
        <Reveal className="mt-6 overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pull request</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead className="hidden md:table-cell">Models</TableHead>
                <TableHead className="text-right">Took</TableHead>
                <TableHead className="text-right">Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[28rem]">
                    <Link href={investigationHref(r)} className="block hover:underline">
                      <span className="block font-mono text-xs text-muted-foreground">{r.repo} #{r.pr_number}</span>
                      <span className="block truncate">{r.pr_title ?? "Untitled pull request"}</span>
                    </Link>
                  </TableCell>
                  <TableCell><StateBadge state={stateOf(r)} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.attempt}{r.trigger === "push" ? " · after push" : ""}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{r.reproducer_model ?? "?"} × {r.skeptic_model ?? "?"}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{fmtDuration(durationMs(r, now))}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmtAgo(r.started_at, now)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Reveal>
      )}
    </main>
  );
}
