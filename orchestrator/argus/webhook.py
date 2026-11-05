"""GitHub webhook receiver (T10).

POST /webhook  verifies X-Hub-Signature-256, ignores repeated deliveries, and turns
               two events into jobs:
                 * pull_request "labeled" with the trigger label  -> trigger "label"
                 * pull_request "synchronize" on a labelled PR    -> trigger "push"
               Everything else is acknowledged and ignored, with the reason logged.
GET  /health   200 "ok"

Jobs go onto a queue and run on a worker thread, so GitHub gets its answer in
milliseconds (it gives up after 10 seconds).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import queue
import threading
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

MAX_BODY = 5 * 1024 * 1024


@dataclass(frozen=True)
class Job:
    repo: str            # owner/name
    pr_number: int
    trigger: str         # "label" | "push"
    head_sha: str
    delivery: str
    sender: str


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


def route(event: str, payload: dict, delivery: str, org: str, trigger_label: str) -> tuple[Job | None, str]:
    """Decide what a webhook means. Returns (job or None, reason)."""
    if event == "ping":
        return None, f"ping: {payload.get('zen', '')}"
    if event != "pull_request":
        return None, f"ignored event {event}"

    repo = payload.get("repository", {}).get("full_name", "")
    if repo.split("/")[0].lower() != org.lower():
        return None, f"ignored repo {repo} (not in {org})"

    pr = payload.get("pull_request") or {}
    action = payload.get("action")
    number = pr.get("number") or payload.get("number")
    labels = {label.get("name") for label in pr.get("labels", [])}
    head = (pr.get("head") or {}).get("sha", "")
    sender = (payload.get("sender") or {}).get("login", "")

    if pr.get("state") == "closed":
        return None, f"ignored {action} on closed PR #{number}"
    if action == "labeled":
        name = (payload.get("label") or {}).get("name")
        if name == trigger_label:
            return Job(repo, number, "label", head, delivery, sender), f"label '{name}' added to PR #{number}"
        return None, f"ignored label '{name}' on PR #{number}"
    if action == "synchronize":
        if trigger_label in labels:
            return Job(repo, number, "push", head, delivery, sender), f"new push to labelled PR #{number}"
        return None, f"ignored push to PR #{number} (no '{trigger_label}' label)"
    return None, f"ignored pull_request.{action} on PR #{number}"


class Receiver:
    """Webhook HTTP server plus the job queue it feeds."""

    def __init__(self, secret: str, org: str, trigger_label: str, on_job: Callable[[Job], None],
                 log_path: Path, host: str = "127.0.0.1", port: int = 8787):
        self.secret, self.org, self.trigger_label = secret, org, trigger_label
        self.on_job = on_job
        self.log_path = log_path
        self.jobs: queue.Queue[Job] = queue.Queue()
        self.seen: OrderedDict[str, None] = OrderedDict()
        self.lock = threading.Lock()
        self.server = ThreadingHTTPServer((host, port), self._handler())
        self.server.daemon_threads = True

    # -- logging ---------------------------------------------------------------
    def log(self, **fields) -> None:
        record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **fields}
        line = json.dumps(record)
        print(line, flush=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a") as fh:
            fh.write(line + "\n")

    def first_delivery(self, delivery: str) -> bool:
        with self.lock:
            if delivery in self.seen:
                return False
            self.seen[delivery] = None
            while len(self.seen) > 1000:
                self.seen.popitem(last=False)
            return True

    # -- HTTP ------------------------------------------------------------------
    def _handler(self):
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "argus"

            def log_message(self, *args):  # access log replaced by receiver.log
                pass

            def reply(self, status: int, body: dict) -> None:
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path == "/health":
                    self.reply(200, {"ok": True})
                else:
                    self.reply(404, {"error": "not found"})

            def do_POST(self):
                if self.path != "/webhook":
                    self.reply(404, {"error": "not found"})
                    return
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > MAX_BODY:
                    self.reply(413 if length > MAX_BODY else 400, {"error": "bad length"})
                    return
                body = self.rfile.read(length)
                event = self.headers.get("X-GitHub-Event", "")
                delivery = self.headers.get("X-GitHub-Delivery", "")
                if not verify_signature(receiver.secret, body, self.headers.get("X-Hub-Signature-256")):
                    receiver.log(kind="webhook", event=event, delivery=delivery, result="rejected",
                                 reason="bad signature")
                    self.reply(401, {"error": "bad signature"})
                    return
                if not receiver.first_delivery(delivery):
                    receiver.log(kind="webhook", event=event, delivery=delivery, result="duplicate")
                    self.reply(200, {"duplicate": True})
                    return
                try:
                    payload = json.loads(body)
                except json.JSONDecodeError:
                    self.reply(400, {"error": "bad json"})
                    return
                job, reason = route(event, payload, delivery, receiver.org, receiver.trigger_label)
                receiver.log(kind="webhook", event=f"{event}.{payload.get('action', '')}".rstrip("."),
                             delivery=delivery, result="queued" if job else "ignored", reason=reason,
                             **({"job": asdict(job)} if job else {}))
                if job:
                    receiver.jobs.put(job)
                self.reply(202 if job else 200, {"queued": bool(job), "reason": reason})

        return Handler

    # -- running ---------------------------------------------------------------
    def _work(self) -> None:
        while True:
            job = self.jobs.get()
            try:
                self.on_job(job)
            except Exception as exc:  # one bad job must not stop the worker
                self.log(kind="job", result="error", pr=job.pr_number, error=f"{type(exc).__name__}: {exc}")
            finally:
                self.jobs.task_done()

    def start(self) -> None:
        threading.Thread(target=self._work, name="argus-worker", daemon=True).start()
        threading.Thread(target=self.server.serve_forever, name="argus-http", daemon=True).start()
        host, port = self.server.server_address[:2]
        self.log(kind="startup", listening=f"http://{host}:{port}")

    def stop(self) -> None:
        self.server.shutdown()
