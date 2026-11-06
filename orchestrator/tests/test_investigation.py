import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from argus.eventlog import EventLog
from argus.investigation import Investigation, Orchestrator, fill_links
from argus.webhook import Job

REPO = "argus-v1/datewise"


class FakeGitHub:
    def __init__(self, head="b678435" + "0" * 33):
        self.head = head
        self.labels: list[str] = []
        self.comments: list[str] = []
        self.state = "open"

    def pull(self, repo, n):
        return {"title": "Fix crash when parse_date gets empty string", "body": "Fixes #1",
                "state": self.state, "user": {"login": "dev2"}, "html_url": f"https://github.com/{repo}/pull/{n}",
                "head": {"ref": "fix-empty-string", "sha": self.head, "repo": {"full_name": "dev2/datewise"}},
                "base": {"ref": "main", "sha": "27817e2" + "0" * 33, "repo": {"html_url": f"https://github.com/{repo}"}}}

    def diff(self, repo, n):
        return "diff --git a/src/datewise/parser.py b/src/datewise/parser.py\n"

    def linked_issue(self, repo, pr):
        return {"number": 1, "title": "parse_date('') raises IndexError", "body": "..."}

    def set_status(self, repo, n, status):
        self.labels.append(status)

    def comment(self, repo, n, body):
        self.comments.append(body)
        return f"https://github.com/{repo}/pull/{n}#issuecomment-{len(self.comments)}"


class AgentRoom:
    """Plays the four agents: a mention makes that agent write its outputs."""

    def __init__(self, ev: Path, n: int, verdict="changes-needed", silent=()):
        self.ev, self.n, self.verdict, self.silent = ev, n, verdict, set(silent)
        self.posts: list[str] = []

    def post(self, text):
        self.posts.append(text)
        role = text.split()[0][1:] if text.startswith("@") else None
        if role and role not in self.silent:
            threading.Timer(0.05, self.act, args=(role,)).start()

    def write(self, name, data):
        path = self.ev / name
        path.write_text(json.dumps(data) if isinstance(data, dict) else data)

    def act(self, role):
        n = self.n
        if role == "triager":
            self.write("scope.json", {"claim": "parse_date('') raises IndexError", "trigger": "parse_date('')"})
        elif role == "reproducer":
            self.write("repro-main.json", {"label": "repro-main", "ref": "main", "outcome": "failed",
                                           "command": f"pytest tests/test_argus_{n}.py", "duration_ms": 900})
            self.write("repro.json", {"bug_reproduced": True, "pr_fixes_claim": True})
        elif role == "skeptic":
            self.write("probes-pr.json", {"label": "probes-pr", "ref": f"pr-{n}", "outcome": "failed",
                                          "command": f"pytest tests/test_argus_{n}_probes.py"})
            self.write("challenge.json", {"findings": ["gap"]})
        elif role == "scribe":
            self.write("comment.md", "### 👁 Argus verification\n\n**✘ Changes needed**\n\n"
                                     "[Investigation timeline]({{INVESTIGATION_URL}}) · [Verify it yourself]({{BUNDLE_URL}})")
            self.write("verdict.json", {"verdict": self.verdict, "label": self.verdict if self.verdict != "needs-human" else "verifying",
                                        "reason": "whitespace-only input still crashes"})


class InvestigationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.gh = FakeGitHub()
        self.log_path = self.root / "events.jsonl"
        self.log = EventLog("", "", self.log_path)
        self.ev = self.root / "pr-2"
        self.ev.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def investigate(self, room, trigger="label", cancel=None, timeout=5):
        job = Job(REPO, 2, trigger, self.gh.head, "d", "dev2")
        return Investigation(job, self.gh, room, self.log, self.root, cancel or threading.Event(),
                             models={"reproducer": "Codex", "skeptic": "Claude"}, stage_timeout=timeout, poll=0.02)

    def events(self):
        return [json.loads(l)["body"] for l in self.log_path.read_text().splitlines()]

    def test_full_run_posts_comment_and_label(self):
        room = AgentRoom(self.ev, 2)
        result = self.investigate(room).run()
        self.assertEqual(result, "changes-needed")
        self.assertEqual(self.gh.labels, ["verifying", "changes-needed"])
        comment = self.gh.comments[0]
        self.assertNotIn("{{", comment)                       # no website yet: link line dropped
        self.assertIn("<!-- argus:pr=2 attempt=1", comment)
        banners = [p for p in room.posts if p.startswith(("▶", "■"))]
        self.assertEqual(len(banners), 5)
        mentions = [p.split()[0] for p in room.posts if p.startswith("@")]
        self.assertEqual(mentions, ["@triager", "@reproducer", "@skeptic", "@scribe"])
        pr = json.loads((self.ev / "pr.json").read_text())
        self.assertEqual((pr["number"], pr["linked_issue"]["number"], pr["attempt"]), (2, 1, 1))
        kinds = [(e.get("role"), e.get("kind")) for e in self.events() if "kind" in e]
        self.assertIn(("reproducer", "test_run"), kinds)
        self.assertIn(("skeptic", "test_run"), kinds)

    def test_push_reverifies_from_reproducing_and_archives(self):
        self.investigate(AgentRoom(self.ev, 2)).run()
        self.gh.head = "db42766" + "0" * 33
        room = AgentRoom(self.ev, 2, verdict="verified")
        result = self.investigate(room, trigger="push").run()
        self.assertEqual(result, "verified")
        self.assertTrue((self.ev / "attempt-1" / "verdict.json").exists())
        mentions = [p.split()[0] for p in room.posts if p.startswith("@")]
        self.assertEqual(mentions, ["@reproducer", "@skeptic", "@scribe"])   # scope reused
        self.assertTrue(any("-v2 labels" in p for p in room.posts))
        self.assertEqual(self.gh.labels[-1], "verified")

    def test_silent_agent_times_out_cleanly(self):
        room = AgentRoom(self.ev, 2, silent={"skeptic"})
        result = self.investigate(room, timeout=0.5).run()
        self.assertEqual(result, "timeout")
        self.assertTrue(any("waiting on challenge.json" in p for p in room.posts))
        self.assertEqual(self.gh.comments, [])

    def test_needs_human_keeps_verifying_label(self):
        result = self.investigate(AgentRoom(self.ev, 2, verdict="needs-human")).run()
        self.assertEqual(result, "needs-human")
        self.assertEqual(self.gh.labels, ["verifying"])
        self.assertEqual(len(self.gh.comments), 1)

    def test_new_push_cancels_running_attempt(self):
        made = []

        def make(job, cancel):
            room = AgentRoom(self.ev, 2, silent={"skeptic"} if not made else ())
            inv = self.investigate(room, trigger=job.trigger, cancel=cancel, timeout=5)
            made.append((inv, room))
            return inv

        orch = Orchestrator(make, log_fn=lambda m: None)
        orch.on_job(Job(REPO, 2, "label", self.gh.head, "d1", "dev2"))
        time.sleep(0.4)                                       # first run is stuck waiting on the Skeptic
        self.gh.head = "db42766" + "0" * 33
        orch.on_job(Job(REPO, 2, "push", self.gh.head, "d2", "dev2"))
        orch.running[(REPO, 2)][0].join(5)
        self.assertTrue(any("stopped: a newer push" in p for p in made[0][1].posts))
        self.assertEqual(self.gh.labels[-1], "changes-needed")
        self.assertEqual(json.loads((self.ev / "state.json").read_text())["attempt"], 2)


class LinkTests(unittest.TestCase):
    def test_links_filled_when_site_exists(self):
        out = fill_links("[t]({{INVESTIGATION_URL}}) · [b]({{BUNDLE_URL}})", "https://argus.dev", REPO, 2, 1)
        self.assertIn("https://argus.dev/investigations/argus-v1/datewise/2/1/bundle", out)


if __name__ == "__main__":
    unittest.main()
