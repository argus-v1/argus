"""The investigation state machine (T12) and re-verification on push (T15).

    scoping -> reproducing -> challenging -> reporting -> verdict

At each stage Argus posts a banner, @mentions the agent whose turn it is, and waits
for that agent's output file in shared/evidence/pr-<n>/ (the protocol has agents
write it before posting STATUS: done). At the verdict it posts the Scribe's
comment.md to GitHub as the App and sets the label from verdict.json.

A new push to a labelled PR cancels a run in progress, archives the attempt to
pr-<n>/attempt-<k>/, and starts the next attempt from `reproducing`.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .eventlog import EventLog
from .github import STATUS_LABELS, GitHubApp
from .room import Room, banner
from .webhook import Job

EVIDENCE_IN_PROMPT = "~/argus/shared/evidence/pr-{n}/"


@dataclass(frozen=True)
class Stage:
    name: str
    role: str
    outputs: tuple[str, ...]
    ask: str


STAGES = [
    Stage("scoping", "triager", ("scope.json",),
          "@triager scope PR #{n}: the evidence folder is {ev} (start with pr.json)"),
    Stage("reproducing", "reproducer", ("repro.json",),
          "@reproducer reproduce PR #{n}: read scope.json in {ev}"),
    Stage("challenging", "skeptic", ("challenge.json",),
          "@skeptic challenge PR #{n}: read scope.json, repro.json and test_argus_{n}.py in {ev}"),
    Stage("reporting", "scribe", ("comment.md", "verdict.json"),
          "@scribe report on PR #{n}: all the evidence is in {ev}"),
]
STAGE_OUTPUTS = [o for s in STAGES for o in s.outputs]
VERDICTS = {"verified", "changes-needed", "not-reproduced", "needs-human"}


class Cancelled(Exception):
    pass


class StageTimeout(Exception):
    pass


class Investigation:
    def __init__(self, job: Job, gh: GitHubApp, room: Room, log: EventLog, evidence_root: Path,
                 cancel: threading.Event, *, models: dict[str, str], site_url: str = "",
                 stage_timeout: float = 600, poll: float = 1.0, clones: tuple[Path, ...] = ()):
        self.job, self.gh, self.room, self.log = job, gh, room, log
        self.cancel = cancel
        self.models, self.site_url = models, site_url.rstrip("/")
        self.stage_timeout, self.poll = stage_timeout, poll
        self.clones = clones
        self.n = job.pr_number
        self.dir = evidence_root / f"pr-{self.n}"
        self.inv_id = ""
        self.attempt = 1
        self.title = ""
        self.thread: str | None = None   # Discord thread for this PR, when threads are on
        self.header: str | None = None   # the PR's status line in the channel

    # -- helpers ---------------------------------------------------------------
    def say(self, text: str) -> None:
        self.room.post(text, thread=self.thread)

    def status(self, text: str) -> None:
        """Update the PR's one-line status in the channel (thread mode only)."""
        if self.header:
            try:
                self.room.edit(self.header, f"🔎 **PR #{self.n}** · {self.title[:80]} · {text}")
            except Exception:
                pass  # a stale status line must never stop the run

    def _open_thread(self, meta: dict) -> None:
        if not getattr(self.room, "threads", False):
            return
        state = self._state()
        if state.get("thread_id") and state.get("header_id"):
            self.thread, self.header = state["thread_id"], state["header_id"]
            return
        self.header = self.room.post(f"🔎 **PR #{self.n}** · {self.title[:80]} · by {meta['author']} · starting…")
        self.thread = self.room.start_thread(self.header, f"PR #{self.n} · {self.title}") if self.header else None
        if not self.thread:   # no permission to open threads: keep everything in the channel
            self.header = None
            return
        self._save_state(thread_id=self.thread, header_id=self.header)

    def checkpoint(self) -> None:
        if self.cancel.is_set():
            raise Cancelled()

    def _state(self) -> dict:
        path = self.dir / "state.json"
        return json.loads(path.read_text()) if path.exists() else {}

    def _save_state(self, **fields) -> None:
        state = {**self._state(), **fields}
        (self.dir / "state.json").write_text(json.dumps(state, indent=2) + "\n")

    def _wait_for(self, names: tuple[str, ...], since: float, on_tick=None) -> None:
        deadline = time.monotonic() + self.stage_timeout
        while True:
            self.checkpoint()
            ready = True
            for name in names:
                path = self.dir / name
                if not path.exists() or path.stat().st_mtime < since:
                    ready = False
                    break
                if name.endswith(".json"):
                    try:
                        json.loads(path.read_text())
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        ready = False  # still being written
                        break
            if ready:
                return
            if on_tick:
                on_tick()
            if time.monotonic() > deadline:
                raise StageTimeout(", ".join(names))
            time.sleep(self.poll)

    def _read_json(self, name: str) -> dict:
        try:
            return json.loads((self.dir / name).read_text())
        except (OSError, json.JSONDecodeError):
            return {}

    def _log_runs(self, stage: str, role: str, since: float) -> None:
        """Every sandbox result written during this stage becomes a test_run event."""
        for path in sorted(self.dir.glob("*.json")):
            if path.name in STAGE_OUTPUTS or path.name in ("pr.json", "state.json") or path.stat().st_mtime < since:
                continue
            run = self._read_json(path.name)
            if "outcome" not in run or "label" not in run:
                continue
            self.log.event(self.inv_id, stage, role, "test_run",
                           f"{run.get('command', 'pytest')} @ {run.get('ref')} -> {str(run['outcome']).upper()}",
                           artifact_path=path.name, duration_ms=run.get("duration_ms"),
                           data={k: run.get(k) for k in ("label", "ref", "sha", "test", "outcome", "summary")})

    # -- setup -----------------------------------------------------------------
    def _prefetch(self) -> None:
        """Fetch main and the PR head into every agent clone, so agents need no network
        (Codex's sandbox blocks it) and each stage starts sooner. Best effort."""
        def fetch(repo: Path) -> None:
            subprocess.run(["git", "-C", str(repo), "fetch", "-q", "origin", "+main:refs/remotes/origin/main",
                            f"+refs/pull/{self.n}/head:refs/heads/pr-{self.n}"],
                           capture_output=True, timeout=60)
        threads = [threading.Thread(target=fetch, args=(c,)) for c in self.clones if (c / ".git").exists()]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    def _prepare(self) -> tuple[dict, list[Stage]]:
        repo = self.job.repo
        pr = self.gh.pull(repo, self.n)
        if pr.get("state") != "open":
            raise Cancelled()
        self.dir.mkdir(parents=True, exist_ok=True)
        previous = self._state().get("attempt", 0)
        self.attempt = previous + 1
        if previous:
            archive = self.dir / f"attempt-{previous}"
            archive.mkdir(exist_ok=True)
            for path in self.dir.iterdir():
                if path.is_file():
                    shutil.copy2(path, archive / path.name)
            for name in STAGE_OUTPUTS:
                if name != "scope.json":
                    (self.dir / name).unlink(missing_ok=True)

        linked = self.gh.linked_issue(repo, pr)
        meta = {
            "number": self.n, "title": pr["title"], "body": pr.get("body") or "",
            "author": pr["user"]["login"], "head_ref": pr["head"]["ref"], "head_sha": pr["head"]["sha"],
            "head_repo": (pr["head"].get("repo") or {}).get("full_name"),
            "base_ref": pr["base"]["ref"], "base_sha": pr["base"]["sha"],
            "linked_issue": linked, "repo_url": pr["base"]["repo"]["html_url"], "pr_url": pr["html_url"],
            "attempt": self.attempt, "trigger": self.job.trigger,
        }
        (self.dir / "pr.json").write_text(json.dumps(meta, indent=2) + "\n")
        (self.dir / "pr.diff").write_text(self.gh.diff(repo, self.n))
        self._prefetch()
        self._save_state(attempt=self.attempt, head_sha=meta["head_sha"], status="running")

        start = 0 if self.attempt == 1 or not (self.dir / "scope.json").exists() else 1
        return meta, STAGES[start:]

    # -- run -------------------------------------------------------------------
    def run(self) -> str:
        repo, n = self.job.repo, self.n
        try:
            meta, stages = self._prepare()
        except Cancelled:
            return "cancelled"
        self.inv_id = self.log.start(
            repo=repo, pr_number=n, attempt=self.attempt, pr_title=meta["title"], pr_url=meta["pr_url"],
            contributor=meta["author"], base_sha=meta["base_sha"], head_sha=meta["head_sha"],
            trigger=self.job.trigger, stage=stages[0].name,
            reproducer_model=self.models.get("reproducer"), skeptic_model=self.models.get("skeptic"))
        self.gh.set_status(repo, n, "verifying")
        self.log.event(self.inv_id, stages[0].name, "orchestrator", "label", "label: verifying")
        self.title = meta["title"]
        self._open_thread(meta)
        if self.attempt > 1:
            self.say(f"🔁 New push to PR #{n} (`{meta['head_sha'][:7]}`). Re-verifying, attempt {self.attempt}.")

        try:
            for stage in stages:
                self._run_stage(stage, meta)
            return self._verdict(meta)
        except Cancelled:
            self.say(f"⏹ Attempt {self.attempt} on PR #{n} stopped: a newer push replaced it.")
            self.log.update(self.inv_id, status="error", finished_at=_now())
            self._save_state(status="cancelled")
            return "cancelled"
        except StageTimeout as exc:
            self.status(f"⏸ stopped, waiting on {exc}")
            self.say(f"⏸ PR #{n} is waiting on {exc}. The investigation stopped; a maintainer can re-add the "
                     f"`argus` label to start again.")
            self.log.event(self.inv_id, self._current, "orchestrator", "error", f"timed out waiting for {exc}")
            self.log.update(self.inv_id, status="error", finished_at=_now())
            self._save_state(status="timeout")
            return "timeout"

    _current = "scoping"

    def _run_stage(self, stage: Stage, meta: dict) -> None:
        self.checkpoint()
        self._current = stage.name
        n = self.n
        started = time.time()
        self.log.update(self.inv_id, stage=stage.name)
        title = banner(stage.name, n)
        self.log.event(self.inv_id, stage.name, "orchestrator", "banner", title)
        ask = stage.ask.format(n=n, ev=EVIDENCE_IN_PROMPT.format(n=n))
        if self.attempt > 1:
            ask += (f" This is re-verification attempt {self.attempt} on the new head "
                    f"`{meta['head_sha'][:7]}`: re-fetch the PR and use -v{self.attempt} labels.")
        self.status(f"{title.split(' · PR')[0]} · {stage.role} working…")
        self.say(f"{title}\n{ask}")   # banner and hand-off in one message

        nudged = {"done": False}

        def watch_for_send_back():
            # Skeptic sent the test back and the Reproducer revised it: hand back to the Skeptic once.
            repro = self.dir / "repro.json"
            if stage.name == "challenging" and not nudged["done"] and repro.exists() \
                    and repro.stat().st_mtime > started + 1:
                nudged["done"] = True
                self.say(f"@skeptic the Reproducer revised its test for PR #{n}: re-check it in "
                         f"{EVIDENCE_IN_PROMPT.format(n=n)}")
                self.log.event(self.inv_id, stage.name, "orchestrator", "message", "Reproducer revised; Skeptic re-asked")

        self._wait_for(stage.outputs, started - 1, on_tick=watch_for_send_back)
        self._log_runs(stage.name, stage.role, started - 1)
        out = self._read_json(stage.outputs[-1]) if stage.outputs[-1].endswith(".json") else {}
        summary = {
            "scoping": lambda o: o.get("claim") or "scope written",
            "reproducing": lambda o: f"bug reproduced: {o.get('bug_reproduced')} · PR fixes claim: {o.get('pr_fixes_claim')}",
            "challenging": lambda o: f"findings: {', '.join(o.get('findings') or []) or 'none'}",
            "reporting": lambda o: f"verdict: {o.get('verdict')} · {o.get('reason', '')}",
        }[stage.name](out)
        self.log.event(self.inv_id, stage.name, stage.role, "message", summary,
                       model=self.models.get(stage.role), artifact_path=stage.outputs[-1],
                       duration_ms=int((time.time() - started) * 1000))

    def _verdict(self, meta: dict) -> str:
        self.checkpoint()
        repo, n = self.job.repo, self.n
        self._current = "verdict"
        self.log.update(self.inv_id, stage="verdict")
        verdict = self._read_json("verdict.json")
        value = verdict.get("verdict")
        label = verdict.get("label")
        if value not in VERDICTS or (label not in STATUS_LABELS and value != "needs-human"):
            value, label = "needs-human", "verifying"
            self.say(f"⚠ The Scribe's verdict.json for PR #{n} is not valid; a maintainer needs to look.")

        challenge = self._read_json("challenge.json")
        if value == "verified" and set(challenge.get("findings") or []) & {"gap", "regression", "invalid_test"}:
            self.log.event(self.inv_id, "verdict", "orchestrator", "error",
                           "Scribe said verified but the Skeptic reported a gap, regression or invalid test")

        body = (self.dir / "comment.md").read_text()
        body = fill_links(body, self.site_url, repo, n, self.attempt)
        body += f"\n\n<!-- argus:pr={n} attempt={self.attempt} head={meta['head_sha']} -->\n"
        url = self.gh.comment(repo, n, body)
        self.log.event(self.inv_id, "verdict", "orchestrator", "comment", url, artifact_path="comment.md")
        if value != "needs-human":
            self.gh.set_status(repo, n, label)
            self.log.event(self.inv_id, "verdict", "orchestrator", "label", f"label: {label}")

        words = {"verified": "✔ Verified", "changes-needed": "✘ Changes needed",
                 "not-reproduced": "✘ Not reproduced", "needs-human": "✋ Needs a maintainer"}[value]
        reason = verdict.get("reason", "")
        self.say(f"■ Stage 5/5 · Verdict · PR #{n} · {words}" + (f" · {reason}" if reason else "") + f"\n{url}")
        self.status(f"{words} · attempt {self.attempt} · {url}")
        self.log.event(self.inv_id, "verdict", "orchestrator", "banner", f"Verdict: {words}")
        self.log.update(self.inv_id, stage="verdict", status="done", comment_url=url, finished_at=_now(),
                        verdict=value)
        self._save_state(status="done", verdict=value, comment_url=url)
        return value


def fill_links(body: str, site_url: str, repo: str, n: int, attempt: int) -> str:
    """Fill the Scribe's link placeholders, or drop the line when there's no website yet."""
    if site_url:
        base = f"{site_url}/investigations/{repo}/{n}/{attempt}"
        return body.replace("{{INVESTIGATION_URL}}", base).replace("{{BUNDLE_URL}}", base + "/bundle")
    # split("\n"), not splitlines(): splitlines() also breaks on U+2028/U+2029, which
    # turned probe inputs pasted into a table cell into real newlines.
    return "\n".join(line for line in body.split("\n") if not re.search(r"\{\{[A-Z_]+_URL\}\}", line))


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


class Orchestrator:
    """One investigation per PR at a time; a new job for the same PR supersedes the old one."""

    def __init__(self, make: "callable[[Job, threading.Event], Investigation]", log_fn=print):
        self.make, self.log_fn = make, log_fn
        self.running: dict[tuple[str, int], tuple[threading.Thread, threading.Event]] = {}
        self.lock = threading.Lock()

    def on_job(self, job: Job) -> None:
        key = (job.repo, job.pr_number)
        with self.lock:
            current = self.running.get(key)
        if current and current[0].is_alive():
            current[1].set()
            current[0].join(timeout=30)
        cancel = threading.Event()
        inv = self.make(job, cancel)

        def run():
            try:
                result = inv.run()
                self.log_fn(f"PR #{job.pr_number} attempt {inv.attempt}: {result}")
            except Exception as exc:
                self.log_fn(f"PR #{job.pr_number} failed: {type(exc).__name__}: {exc}")

        thread = threading.Thread(target=run, name=f"pr-{job.pr_number}", daemon=True)
        with self.lock:
            self.running[key] = (thread, cancel)
        thread.start()
