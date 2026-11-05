import hashlib
import hmac
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from argus.webhook import Receiver, route, verify_signature

SECRET = "test-secret"
ORG = "argus-v1"


def pr_event(action, labels=(), label=None, state="open", repo=f"{ORG}/datewise", number=2):
    body = {
        "action": action,
        "number": number,
        "repository": {"full_name": repo},
        "sender": {"login": "dev2"},
        "pull_request": {"number": number, "state": state, "head": {"sha": "b678435" + "0" * 33},
                         "labels": [{"name": n} for n in labels]},
    }
    if label:
        body["label"] = {"name": label}
    return body


def sign(body: bytes, secret=SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class RouteTests(unittest.TestCase):
    def test_argus_label_starts_a_job(self):
        job, _ = route("pull_request", pr_event("labeled", ["argus"], "argus"), "d1", ORG, "argus")
        self.assertEqual((job.pr_number, job.trigger, job.sender), (2, "label", "dev2"))

    def test_other_label_is_ignored(self):
        job, reason = route("pull_request", pr_event("labeled", ["verifying"], "verifying"), "d1", ORG, "argus")
        self.assertIsNone(job)
        self.assertIn("verifying", reason)

    def test_push_to_labelled_pr_restarts(self):
        job, _ = route("pull_request", pr_event("synchronize", ["argus", "changes-needed"]), "d1", ORG, "argus")
        self.assertEqual(job.trigger, "push")

    def test_push_to_unlabelled_pr_is_ignored(self):
        job, _ = route("pull_request", pr_event("synchronize", []), "d1", ORG, "argus")
        self.assertIsNone(job)

    def test_closed_pr_is_ignored(self):
        job, _ = route("pull_request", pr_event("labeled", ["argus"], "argus", state="closed"), "d1", ORG, "argus")
        self.assertIsNone(job)

    def test_other_org_is_ignored(self):
        job, _ = route("pull_request", pr_event("labeled", ["argus"], "argus", repo="evil/repo"), "d1", ORG, "argus")
        self.assertIsNone(job)

    def test_signature(self):
        body = b'{"a":1}'
        self.assertTrue(verify_signature(SECRET, body, sign(body)))
        self.assertFalse(verify_signature(SECRET, body, sign(body, "wrong")))
        self.assertFalse(verify_signature(SECRET, body, None))
        self.assertFalse(verify_signature("", body, sign(body, "")))


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.got = []
        self.done = threading.Event()

        def on_job(job):
            self.got.append(job)
            self.done.set()

        self.rx = Receiver(SECRET, ORG, "argus", on_job, Path(self.tmp.name, "log.jsonl"), port=0)
        self.rx.start()
        self.url = "http://127.0.0.1:%d" % self.rx.server.server_address[1]

    def tearDown(self):
        self.rx.stop()
        self.tmp.cleanup()

    def post(self, event, payload, delivery, signature=None):
        body = json.dumps(payload).encode()
        req = urllib.request.Request(self.url + "/webhook", data=body, method="POST", headers={
            "X-GitHub-Event": event, "X-GitHub-Delivery": delivery,
            "X-Hub-Signature-256": signature or sign(body), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.load(resp)
        except urllib.error.HTTPError as exc:
            return exc.code, json.load(exc)

    def test_signed_label_event_is_queued_and_run(self):
        status, body = self.post("pull_request", pr_event("labeled", ["argus"], "argus"), "d-1")
        self.assertEqual((status, body["queued"]), (202, True))
        self.assertTrue(self.done.wait(3))
        self.assertEqual(self.got[0].pr_number, 2)

    def test_bad_signature_is_rejected(self):
        status, _ = self.post("pull_request", pr_event("labeled", ["argus"], "argus"), "d-2", signature="sha256=00")
        self.assertEqual(status, 401)
        self.assertEqual(self.got, [])

    def test_repeat_delivery_runs_once(self):
        payload = pr_event("labeled", ["argus"], "argus")
        self.post("pull_request", payload, "d-3")
        status, body = self.post("pull_request", payload, "d-3")
        self.assertEqual((status, body.get("duplicate")), (200, True))
        self.assertTrue(self.done.wait(3))
        self.rx.jobs.join()
        self.assertEqual(len(self.got), 1)

    def test_every_webhook_is_logged(self):
        self.post("ping", {"zen": "Keep it logically awesome."}, "d-4")
        lines = [json.loads(l) for l in Path(self.tmp.name, "log.jsonl").read_text().splitlines()]
        self.assertTrue(any(l.get("delivery") == "d-4" and "ping" in l.get("reason", "") for l in lines))

    def test_health(self):
        with urllib.request.urlopen(self.url + "/health", timeout=5) as resp:
            self.assertEqual(resp.status, 200)


if __name__ == "__main__":
    unittest.main()
