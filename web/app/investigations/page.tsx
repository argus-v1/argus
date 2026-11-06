import type { Metadata } from "next";
import Link from "next/link";
import { InvestigationsTable, LoadError } from "@/components/console";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageHero } from "@/components/PageHero";
import { stateOf, STATE_WORDS, type State } from "@/lib/derive";
import { listInvestigations } from "@/lib/supabase";
import type { Investigation } from "@/lib/types";
import "../console.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investigations" };

const FILTERS: State[] = ["running", "verified", "changes-needed", "not-reproduced", "needs-human", "stopped"];

export default async function Investigations({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  let rows: Investigation[];
  try {
    rows = await listInvestigations();
  } catch (e) {
    return <main className="con"><div className="wrap"><div className="phead"><div><h1>Investigations</h1></div></div><div className="sect"><LoadError what="investigations" message={(e as Error).message} /></div></div></main>;
  }
  const present = FILTERS.filter((f) => rows.some((r) => stateOf(r) === f));
  const shown = state ? rows.filter((r) => stateOf(r) === state) : rows;
  const now = Date.now();
  return (
    <main className="con">
      <PageHero art="/velazquez.webp" position="78% 42%" credit="Diego Velázquez, Mercury and Argus, c. 1659 (detail)">
        <h1>Investigations</h1>
        <p className="lede">Every run, newest first. A pull request gets a new attempt each time its author pushes after a verdict.</p>
        <div className="row"><LiveRefresh running={rows.some((r) => r.status === "running")} /></div>
      </PageHero>
      <div className="wrap">
        {present.length > 1 && (
          <nav className="filters" aria-label="Filter by verdict" style={{ marginTop: 24 }}>
            <Link className="fchip" href="/investigations" aria-current={!state ? "true" : undefined}>All · {rows.length}</Link>
            {present.map((f) => (
              <Link key={f} className="fchip" href={`/investigations?state=${f}`} aria-current={state === f ? "true" : undefined}>
                {STATE_WORDS[f]} · {rows.filter((r) => stateOf(r) === f).length}
              </Link>
            ))}
          </nav>
        )}
        <section className="sect">
          {shown.length ? (
            <InvestigationsTable rows={shown} now={now} />
          ) : (
            <div className="empty"><h3>Nothing here yet</h3><p>Runs appear the moment a maintainer adds the <span className="mono">argus</span> label to a pull request.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
