import type { Metadata } from "next";
import Link from "next/link";
import { LoadError, Pair, StateBadge } from "@/components/console";
import { Icon, ROLE_ICON, ROLE_VAR } from "@/components/Icons";
import { LiveRefresh } from "@/components/LiveRefresh";
import {
  durationMs, fmtDuration, investigationHref, median, ROLE_NAME, skepticCaught, stageDurations, stateOf, STATE_WORDS, type State,
} from "@/lib/derive";
import { getEvents, listInvestigations } from "@/lib/supabase";
import { AGENTS, STAGE_ROLE, type Event, type Investigation } from "@/lib/types";
import "../console.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evals" };

type Run = { inv: Investigation; events: Event[]; caught: boolean; reproSaidFixed: boolean | null };
type Cell = { runs: Run[]; done: Run[]; caught: number; errors: number; mix: Record<State, number>; medianMs: number | null };

// Verdict mix uses the status palette: state, not identity. Each segment also carries its word in the legend and tooltip.
const MIX_ORDER: State[] = ["verified", "changes-needed", "not-reproduced", "needs-human", "stopped", "running"];
const MIX_COLOR: Record<State, string> = {
  verified: "var(--ok)", "changes-needed": "var(--bad)", "not-reproduced": "#c1453b", "needs-human": "var(--amb)", stopped: "var(--surface-3)", running: "#a8842f",
};

function cellOf(runs: Run[], now: number): Cell {
  const done = runs.filter((r) => r.inv.status === "done");
  const mix = Object.fromEntries(MIX_ORDER.map((s) => [s, 0])) as Record<State, number>;
  runs.forEach((r) => mix[stateOf(r.inv)]++);
  return {
    runs, done, mix,
    caught: runs.filter((r) => r.caught).length,
    errors: runs.filter((r) => r.inv.status === "error").length,
    medianMs: median(done.map((r) => durationMs(r.inv, now)!).filter((x) => x != null)),
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function Evals({ searchParams }: { searchParams: Promise<{ pair?: string; verdict?: string }> }) {
  const sp = await searchParams;
  let invs: Investigation[], events: Event[];
  try {
    invs = await listInvestigations();
    events = await getEvents(invs.map((i) => i.id));
  } catch (e) {
    return <main className="con"><div className="wrap"><div className="phead"><div><h1>Evals</h1></div></div><div className="sect"><LoadError what="evals" message={(e as Error).message} /></div></div></main>;
  }
  const now = Date.now();
  const byInv = new Map<string, Event[]>();
  events.forEach((e) => (byInv.get(e.investigation_id) ?? byInv.set(e.investigation_id, []).get(e.investigation_id)!).push(e));
  const runs: Run[] = invs.map((inv) => {
    const ev = byInv.get(inv.id) ?? [];
    const repro = ev.find((e) => e.role === "reproducer" && e.kind === "message");
    return { inv, events: ev, caught: skepticCaught(ev), reproSaidFixed: repro ? /PR fixes claim: True/i.test(repro.message) : null };
  });

  const repModels = [...new Set(invs.map((i) => i.reproducer_model ?? "?"))].sort();
  const skpModels = [...new Set(invs.map((i) => i.skeptic_model ?? "?"))].sort();
  const pairKey = (i: Investigation) => `${i.reproducer_model ?? "?"}|${i.skeptic_model ?? "?"}`;
  const all = cellOf(runs, now);
  const challenged = runs.filter((r) => r.reproSaidFixed === true);
  const agreed = challenged.filter((r) => !r.caught).length;

  // per-agent time, median across runs
  const agentTimes = AGENTS.map((role) => {
    const xs = runs.map((r) => r.events.find((e) => e.role === role && e.kind === "message")?.duration_ms).filter((x): x is number => x != null);
    return { role, med: median(xs), n: xs.length };
  });
  const maxT = Math.max(1, ...agentTimes.map((a) => a.med ?? 0));

  const shown = runs.filter((r) => (!sp.pair || pairKey(r.inv) === sp.pair) && (!sp.verdict || stateOf(r.inv) === sp.verdict));
  const pairs = [...new Set(invs.map(pairKey))];
  const states = MIX_ORDER.filter((s) => all.mix[s] > 0);
  const q = (k: string, v?: string) => {
    const u = new URLSearchParams();
    const next = { ...sp, [k]: v };
    Object.entries(next).forEach(([a, b]) => b && u.set(a, b));
    const s = u.toString();
    return s ? `/evals?${s}` : "/evals";
  };

  return (
    <main className="con">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Evals</h1>
            <p>How the agents perform on real runs, by model pair. Every number here is computed from the event log; a pair with no runs says so instead of guessing.</p>
          </div>
          <div className="side"><LiveRefresh running={invs.some((i) => i.status === "running")} /></div>
        </div>

        {runs.length === 0 ? (
          <div className="sect"><div className="empty"><h3>No runs to evaluate yet</h3><p>Evals fill in from real investigations. Label a pull request with <span className="mono">argus</span> to start one.</p></div></div>
        ) : (
          <>
            <section className="sect" aria-label="Headline figures">
              <div className="stats">
                <div className="stat"><div className="k">Runs</div><div className="v">{runs.length}</div><div className="n">{all.done.length} finished · {all.errors} stopped early</div></div>
                <div className="stat"><div className="k">Skeptic catches</div><div className="v">{all.caught}<small>/ {challenged.length}</small></div><div className="n">runs where the PR passed the Reproducer&apos;s test and the Skeptic still found a gap</div></div>
                <div className="stat"><div className="k">Agreement</div><div className="v">{pct(agreed, challenged.length)}</div><div className="n">Skeptic confirmed the Reproducer ({agreed} of {challenged.length})</div></div>
                <div className="stat"><div className="k">Label to verdict</div><div className="v">{all.medianMs == null ? "–" : fmtDuration(all.medianMs)}</div><div className="n">median of finished runs</div></div>
              </div>
            </section>

            <section className="sect">
              <header>
                <h2>Model pairs</h2>
                <p className="hint">Rows: the Reproducer&apos;s model. Columns: the Skeptic&apos;s. Shade: share of runs where the Skeptic caught something.</p>
              </header>
              <div className="matrix" style={{ gridTemplateColumns: `120px repeat(${skpModels.length}, minmax(200px, 1fr))` }}>
                <span />
                {skpModels.map((m) => <span key={m} className="ax col"><Icon id="i-skp" size={13} style={{ color: "var(--skp)", marginRight: 6 }} />{m}</span>)}
                {repModels.map((rm) => (
                  <Row key={rm} rm={rm} skpModels={skpModels} runs={runs} now={now} />
                ))}
              </div>
              <p className="hint" style={{ marginTop: 14 }}>
                Pairs appear as they get runs. The Reproducer and Skeptic always run on different providers, so a pair of one model with itself stays empty.
              </p>
            </section>

            <section className="sect">
              <header><h2>Verdicts</h2><p className="hint">All {runs.length} runs.</p></header>
              <div className="mix" role="img" aria-label={states.map((s) => `${STATE_WORDS[s]} ${all.mix[s]}`).join(", ")}>
                {states.map((s) => (
                  <i key={s} title={`${STATE_WORDS[s]}: ${all.mix[s]}`} style={{ flexGrow: all.mix[s], background: MIX_COLOR[s] }} />
                ))}
              </div>
              <div className="mix-legend">
                {states.map((s) => <span key={s}><i style={{ background: MIX_COLOR[s] }} />{STATE_WORDS[s]} <b className="mono" style={{ fontWeight: 400, color: "var(--text)" }}>{all.mix[s]}</b></span>)}
              </div>
            </section>

            <section className="sect">
              <header><h2>Time per agent</h2><p className="hint">Median seconds from being asked to handing over its file.</p></header>
              <div className="bars">
                {agentTimes.map((a) => (
                  <div className="hbar" key={a.role} style={{ "--c": ROLE_VAR[a.role] } as React.CSSProperties} title={`${ROLE_NAME[a.role]}: median ${fmtDuration(a.med)} over ${a.n} runs`}>
                    <span className="lab"><Icon id={ROLE_ICON[a.role]} size={16} />{ROLE_NAME[a.role]}</span>
                    <span className="track"><span className="fill" style={{ display: "block", width: `${((a.med ?? 0) / maxT) * 100}%` }} /></span>
                    <span className="val">{fmtDuration(a.med)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="sect">
              <header><h2>Every run</h2></header>
              <div className="filters" style={{ marginBottom: 10 }}>
                <Link className="fchip" href={q("pair")} aria-current={!sp.pair ? "true" : undefined}>All pairs</Link>
                {pairs.map((p) => <Link key={p} className="fchip" href={q("pair", p)} aria-current={sp.pair === p ? "true" : undefined}>{p.replace("|", " × ")}</Link>)}
              </div>
              <div className="filters" style={{ marginBottom: 18 }}>
                <Link className="fchip" href={q("verdict")} aria-current={!sp.verdict ? "true" : undefined}>All verdicts</Link>
                {states.map((s) => <Link key={s} className="fchip" href={q("verdict", s)} aria-current={sp.verdict === s ? "true" : undefined}>{STATE_WORDS[s]}</Link>)}
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Run</th><th>Models</th><th>Verdict</th><th>Skeptic</th>{AGENTS.map((r) => <th key={r} className="num">{ROLE_NAME[r]}</th>)}<th className="num">Total</th></tr></thead>
                  <tbody>
                    {shown.map((r) => {
                      const d = stageDurations(r.events);
                      return (
                        <tr key={r.inv.id}>
                          <td className="mono"><Link href={investigationHref(r.inv)}>{r.inv.repo} #{r.inv.pr_number} · {r.inv.attempt}</Link></td>
                          <td><Pair inv={r.inv} /></td>
                          <td><StateBadge state={stateOf(r.inv)} /></td>
                          <td className="mono">{r.caught ? <span style={{ color: "var(--skp)" }}>caught a gap</span> : r.reproSaidFixed ? "confirmed" : "–"}</td>
                          {AGENTS.map((role) => {
                            const st = (Object.keys(STAGE_ROLE) as (keyof typeof STAGE_ROLE)[]).find((s) => STAGE_ROLE[s] === role)!;
                            return <td key={role} className="num mono">{fmtDuration(d[st])}</td>;
                          })}
                          <td className="num mono">{fmtDuration(durationMs(r.inv, now))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {shown.length === 0 && <p className="hint" style={{ marginTop: 14 }}>No runs match these filters.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ rm, skpModels, runs, now }: { rm: string; skpModels: string[]; runs: Run[]; now: number }) {
  return (
    <>
      <span className="ax"><Icon id="i-rep" size={13} style={{ color: "var(--rep)", marginRight: 6 }} />{rm}</span>
      {skpModels.map((sm) => {
        const cell = cellOf(runs.filter((r) => (r.inv.reproducer_model ?? "?") === rm && (r.inv.skeptic_model ?? "?") === sm), now);
        if (!cell.runs.length) return <div key={sm} className="mcell none">Not run yet</div>;
        const challenged = cell.runs.filter((r) => r.reproSaidFixed === true).length;
        const t = challenged ? cell.caught / challenged : 0;
        return (
          <div key={sm} className="mcell has" style={{ "--t": t } as React.CSSProperties} tabIndex={0}>
            <div className="big">{cell.runs.length}<small>runs</small></div>
            <div className="sm">
              caught {cell.caught} of {challenged} · {pct(cell.caught, challenged)}<br />
              {cell.mix.verified} verified · {cell.mix["changes-needed"] + cell.mix["not-reproduced"]} sent back<br />
              median {fmtDuration(cell.medianMs)}
            </div>
            <div className="tip" role="tooltip">
              {rm} reproduces, {sm} challenges<br />
              {cell.runs.length} runs · {cell.done.length} finished · {cell.errors} stopped<br />
              Skeptic caught {cell.caught} of {challenged} passing fixes
            </div>
          </div>
        );
      })}
    </>
  );
}
