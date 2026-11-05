# Argus

Don't close the door. Make them prove it.

A maintainer adds the `argus` label to a pull request. Four agents (Triager, Reproducer, Skeptic, Scribe) verify the PR's claim in Discord through Switch, and `argus[bot]` posts the evidence on GitHub.

## Layout

```
Argus/
├── .env.example          all keys the project needs; copy to .env (never committed)
├── agents/               one working directory per Switch agent
│   ├── triager/          Claude Code   – scopes the claim
│   ├── reproducer/       Codex         – proves the bug: fails on main, passes on the PR
│   ├── skeptic/          Claude Code   – re-runs from its own clone, tries to break the proof
│   └── scribe/           Claude Code   – writes the evidence comment
│       (each holds its role file, plus repo/ = its own clone of the demo repo, git-ignored)
├── shared/evidence/      hand-off files, one folder per PR: pr-<n>/ (git-ignored)
├── orchestrator/         Python: webhooks, Switch link, state machine, GitHub writer
├── sandbox/              Docker test runner: no network, CPU and time limits
├── supabase/migrations/  event log schema (investigations, events)
├── brand/                logo, role icons, palette, label colors
└── scripts/              reset and timing scripts for rehearsals
```

The demo library (T4) is its own repository under the `argus-demo` org, not part of this tree.
