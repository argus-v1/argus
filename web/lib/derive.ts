import type { Event, Investigation, Role, Stage, Verdict } from "./types";

export const VERDICT_WORDS: Record<Verdict, string> = {
  verified: "Verified",
  "changes-needed": "Changes needed",
  "not-reproduced": "Not reproduced",
  "needs-human": "Needs a maintainer",
};

export const ROLE_NAME: Record<Role, string> = {
  orchestrator: "Argus",
  triager: "Triager",
  reproducer: "Reproducer",
  skeptic: "Skeptic",
  scribe: "Scribe",
};

/** The one word a row shows: a verdict, or what the run is doing, or why it stopped. */
export type State = Verdict | "running" | "stopped";
export function stateOf(inv: Investigation): State {
  if (inv.verdict) return inv.verdict;
  if (inv.status === "running") return "running";
  return "stopped";
}
export const STATE_WORDS: Record<State, string> = { ...VERDICT_WORDS, running: "Verifying", stopped: "Stopped" };

export function durationMs(inv: Investigation, now = Date.now()): number | null {
  const start = Date.parse(inv.started_at);
  const end = inv.finished_at ? Date.parse(inv.finished_at) : inv.status === "running" ? now : NaN;
  return Number.isFinite(end) ? Math.max(0, end - start) : null;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "–");
export const repoName = (repo: string) => repo.split("/")[1] ?? repo;
export const investigationHref = (inv: Pick<Investigation, "repo" | "pr_number" | "attempt">) =>
  `/investigations/${inv.repo}/${inv.pr_number}/${inv.attempt}`;

/** Latest attempt per PR, newest PR first. */
export function latestPerPr(rows: Investigation[]): Investigation[] {
  const best = new Map<string, Investigation>();
  for (const r of rows) {
    const k = `${r.repo}#${r.pr_number}`;
    const cur = best.get(k);
    if (!cur || r.attempt > cur.attempt) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/** How long each agent took, from its stage-summary message event. */
export function stageDurations(events: Event[]): Partial<Record<Stage, number>> {
  const out: Partial<Record<Stage, number>> = {};
  for (const e of events) if (e.kind === "message" && e.role !== "orchestrator" && e.duration_ms != null) out[e.stage] = e.duration_ms;
  return out;
}

/** The Skeptic caught something: the Reproducer said the PR fixes the claim, and the run still was not verified
 *  because of what the Skeptic found. Read from the summaries the orchestrator logs per stage. */
export function skepticCaught(events: Event[]): boolean {
  const repro = events.find((e) => e.role === "reproducer" && e.kind === "message");
  const skep = events.find((e) => e.role === "skeptic" && e.kind === "message");
  if (!repro || !skep) return false;
  const reproSaidFixed = /PR fixes claim: True/i.test(repro.message);
  const findings = skep.message.replace(/^findings:\s*/i, "");
  return reproSaidFixed && /\b(gap|regression|invalid_test)\b/i.test(findings);
}

export function skepticFindings(events: Event[]): string[] {
  const skep = events.find((e) => e.role === "skeptic" && e.kind === "message");
  if (!skep) return [];
  return skep.message
    .replace(/^findings:\s*/i, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "none");
}
