// Rows of the T2 event log (supabase/migrations/20261105120000_event_log.sql). Read-only here.

export type Stage = "scoping" | "reproducing" | "challenging" | "reporting" | "verdict";
export type Role = "orchestrator" | "triager" | "reproducer" | "skeptic" | "scribe";
export type Kind = "banner" | "message" | "test_run" | "label" | "comment" | "error";
export type Verdict = "verified" | "changes-needed" | "not-reproduced" | "needs-human";
export type Status = "running" | "done" | "error";

export type Investigation = {
  id: string;
  repo: string;
  pr_number: number;
  attempt: number;
  pr_title: string | null;
  pr_url: string | null;
  contributor: string | null;
  base_sha: string | null;
  head_sha: string | null;
  trigger: "label" | "push";
  stage: Stage;
  status: Status;
  verdict: Verdict | null;
  reproducer_model: string | null;
  skeptic_model: string | null;
  comment_url: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
};

export type TestRunData = {
  label?: string;
  ref?: string;
  sha?: string;
  test?: string;
  outcome?: "passed" | "failed" | "error";
  summary?: string;
  // Optional, if the orchestrator starts attaching evidence (see web/CLAUDE.md):
  content?: string; // the test file
  log_tail?: string; // last lines of the run's log
};

export type Event = {
  id: number;
  investigation_id: string;
  stage: Stage;
  role: Role;
  kind: Kind;
  model: string | null;
  message: string;
  artifact_path: string | null;
  data: TestRunData & Record<string, unknown>;
  started_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

export const STAGES: Stage[] = ["scoping", "reproducing", "challenging", "reporting", "verdict"];
export const AGENTS: Exclude<Role, "orchestrator">[] = ["triager", "reproducer", "skeptic", "scribe"];
export const STAGE_ROLE: Record<Stage, Role> = {
  scoping: "triager",
  reproducing: "reproducer",
  challenging: "skeptic",
  reporting: "scribe",
  verdict: "orchestrator",
};
