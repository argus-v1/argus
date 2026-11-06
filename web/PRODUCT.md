# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js on Vercel, reading Supabase with the anon key (select only). Public, read-only. Chosen in the Checkpoint 1 plan (2026-11-05).

## Users

- **Open-source maintainers and dev teams** buried in PRs, many AI-written, each costing an hour to check. On the landing page they decide whether to install the Argus GitHub App.
- **Whoever clicks through from the Scribe's GitHub comment**: the maintainer checking the proof before merging, the contributor seeing why their PR came back `changes-needed`, a reviewer who wants to re-run it. They arrive on an investigation page mid-task and want the evidence fast.
- **Hackathon judges (2026-11-07)** watching the recorded demo on a 1080p split screen (GitHub left, Discord right) and clicking the same links. Confirmed: landing and investigation pages serve both maintainers and judges equally.

## Product Purpose

A maintainer adds the `argus` label to a pull request. Four agents verify the PR's claim in the team's Discord room through Switch, and Argus posts one evidence comment on GitHub with a verdict label. The site is the public record of each investigation: what was claimed, what ran, what failed, who checked it, on which model. Success: a maintainer trusts or rejects a PR in about 15 seconds without running anything, and anyone can re-run the proof.

## Positioning

Argus does not review code or give opinions. It proves claims: a failing test on `main`, the same test passing on the PR, and a second agent on a different model (Skeptic on Claude vs Reproducer on Codex) trying to break that proof from its own clone. Every line of the verdict points to a command and its output. The GitHub thread stays the record and GitHub's own buttons do the merging.

## Operating Context

- Trigger: the `argus` label on a PR. A new push to a labelled PR re-verifies (attempt 2, 3, …).
- Stages, in order: scoping (Triager) → reproducing (Reproducer) → challenging (Skeptic) → reporting (Scribe) → verdict (Argus).
- Verdicts: `verified`, `changes-needed`, `not-reproduced`, `needs-human`. Status labels on GitHub: `verifying`, `changes-needed`, `verified`.
- Discord messages follow one fixed shape per agent (icon + ROLE · PR #N · stage / claim / `> command -> result` / model · seconds / STATUS line). Argus posts stage banners: `▶ Stage 3/5 · Challenging · PR #2`.
- The Scribe's comment links to `/investigations/<owner>/<repo>/<pr>/<attempt>` and `/investigations/<owner>/<repo>/<pr>/<attempt>/bundle` (verify it yourself). These routes are a contract with the orchestrator.
- Tests run in a Docker sandbox with no network; untrusted code never runs on the host.

## Capabilities and Constraints

- Data: `investigations` and `events` tables (supabase/migrations/20261105120000_event_log.sql). Events carry stage, role, kind (`banner`, `message`, `test_run`, `label`, `comment`, `error`), model, message, artifact_path, data jsonb, duration_ms, created_at. Realtime is enabled on both tables.
- Evidence file contents (test files, logs) live in `shared/evidence/pr-<n>/` on the orchestrator machine and are not in the database yet; only file names and run summaries are.
- Never on the site: approvals, merges, agent chat, settings. Every page links back to the GitHub PR.
- The only setup a maintainer does is installing the Argus GitHub App (slug `argus-v1`; it comments as `argus-v1[bot]`).
- Later, not now: evals with a model-pair matrix, repo dashboard, Repo X-Ray, a connect page with GitHub sign-in.

## Brand Commitments

- Name **Argus** (formerly PatchProof): the hundred-eyed watchman of Greek myth who never closed all his eyes at once. The mark is an eye.
- Line: **Don't close the door. Make them prove it.**
- Dark-first, flat, no gradients or shadows. One brand everywhere: Discord, GitHub, the site.
- Monospace for anything that is evidence: commands, output, file paths, test names.
- Role colors identify a role and nothing else: Triager blue, Reproducer orange, Skeptic magenta, Scribe purple.
- Status colors are separate: pass green ✔, fail red ✘, pending amber.
- Role emoji used in Discord and role files: 🧭 Triager, 🧪 Reproducer, 🔍 Skeptic, 📜 Scribe; 👁 Argus.
- GitHub labels: `argus` brand color, `verifying` amber, `changes-needed` red, `verified` green.

## Evidence on Hand

- Demo library `argus-v1/datewise` (public), issue #1 (parse_date crashes on `''` and `'   '`), PR #2 from the contributor account.
- The live event log in Supabase. Empty as of 2026-11-06; rows appear once a run happens.
- No benchmark, evals, customers, testimonials or usage numbers exist. Do not invent any. The landing page's "PRs verified" count must come from the database.

## Product Principles

1. Prove, don't opine: every claim on screen points to a command, its output, or a file.
2. GitHub is the record: link back to the PR everywhere; never compete with GitHub's own controls.
3. Readable in 15 seconds: the verdict and the one reason first, the detail one click down.
4. The disagreement is the story: the Skeptic catching what the Reproducer missed gets the emphasis.
5. Opt-in and fair: the contributor gets a hearing with the same evidence the maintainer sees.
