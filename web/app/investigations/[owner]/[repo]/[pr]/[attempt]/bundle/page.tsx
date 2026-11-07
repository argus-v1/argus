import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Outcome, PageHeader, Reveal, StateBadge } from "@/components/argus/kit";
import { CodeBlock } from "@/components/argus/code";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { investigationHref, short, stateOf, testFiles } from "@/lib/derive";
import { getAttempts, getEvents } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; pr: string; attempt: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: `Verify ${p.owner}/${p.repo} #${p.pr} yourself` };
}

export default async function Bundle({ params }: { params: Promise<Params> }) {
  const p = await params;
  const repo = `${p.owner}/${p.repo}`;
  const pr = Number(p.pr), attempt = Number(p.attempt);
  if (!Number.isInteger(pr) || !Number.isInteger(attempt)) notFound();
  const attempts = await getAttempts(repo, pr).catch(() => []);
  const inv = attempts.find((a) => a.attempt === attempt);
  if (!inv) notFound();
  const events = await getEvents([inv.id]).catch(() => []);
  const files = testFiles(events);
  const runs = events.filter((e) => e.kind === "test_run");
  const names = files.map((f) => `tests/${f.file}`).join(" ");

  const steps: { title: string; body: string; code?: string }[] = [
    { title: "Get the code", body: "Clone the repository and fetch this pull request.", code: `git clone https://github.com/${repo}.git\ncd ${p.repo}\ngit fetch origin pull/${pr}/head:pr-${pr}\npip install -e . pytest` },
    { title: "Add the agents' tests", body: files.length ? "Save each file below into tests/. They are exactly what Argus ran." : "This run predates published test files; the logs below are what Argus saw." },
    { title: "Run them before the PR", body: "On the base commit the bug should show: these tests fail.", code: `git checkout ${short(inv.base_sha)}\npytest ${names || "tests/"} -q` },
    { title: "Run them on the PR", body: "On the PR's head: the same tests show what the PR fixes, and what it doesn't.", code: `git checkout pr-${pr}   # head ${short(inv.head_sha)}\npytest ${names || "tests/"} -q\npytest -q   # the full suite, for regressions` },
  ];

  return (
    <main className="mx-auto max-w-[960px] px-5 pb-24 md:px-8">
      <PageHeader eyebrow={`${repo} #${pr} · attempt ${attempt}`} title="Don't trust Argus." accent="Run it yourself." lede="Every claim in the verdict comes from a test anyone can run. These are the commands and the exact test files the agents used.">
        <StateBadge state={stateOf(inv)} size="lg" />
        <Button asChild variant="ghost" size="sm"><Link href={investigationHref(inv)}><ArrowLeft />Investigation</Link></Button>
      </PageHeader>

      <ol className="mt-10 space-y-6">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.title} index={i} className="grid gap-3 md:grid-cols-[2.5rem_1fr]">
            <span className="flex size-8 items-center justify-center rounded-full border border-border font-mono text-sm text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 space-y-3">
              <div>
                <h2 className="font-medium">{s.title}</h2>
                <p className="text-sm text-pretty text-muted-foreground">{s.body}</p>
              </div>
              {s.code && <CodeBlock code={s.code} title="terminal" />}
              {i === 1 && files.map((f) => <CodeBlock key={f.file} code={f.content} title={`tests/${f.file}`} />)}
            </div>
          </Reveal>
        ))}
      </ol>

      {runs.length > 0 && (
        <Reveal as="section" className="mt-12">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">What Argus got</h2>
          <Card className="py-0">
            <CardContent className="divide-y divide-border px-0">
              {runs.map((e) => (
                <div key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 font-mono text-xs">
                  <span className="text-muted-foreground">{e.data.test ?? "pytest"} @ {e.data.ref ?? "?"}</span>
                  <span className="flex items-center gap-3"><span className="text-faint">{e.data.summary}</span><Outcome outcome={e.data.outcome} /></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </Reveal>
      )}
    </main>
  );
}
