"""Event log (T2 schema) writer: Supabase REST with the service key, plus a local copy.

A Supabase outage must never stop an investigation, so every write is best-effort:
failures are recorded in the local JSONL file and the run carries on.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Callable


class EventLog:
    def __init__(self, supabase_url: str, service_key: str, local_path: Path,
                 transport: Callable[[str, str, dict | None], int] | None = None):
        self.base = supabase_url.rstrip("/") + "/rest/v1" if supabase_url else ""
        self.key = service_key
        self.local = local_path
        self.lock = threading.Lock()
        self._transport = transport or self._post

    def _post(self, method: str, path: str, body: dict | None) -> int:
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"apikey": self.key, "Authorization": f"Bearer {self.key}",
                                              "Content-Type": "application/json", "Prefer": "return=minimal"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Supabase {method} {path} -> {exc.code}: {exc.read()[:200]!r}") from None

    def _write(self, method: str, path: str, body: dict) -> None:
        record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "method": method, "path": path, "body": body}
        try:
            if self.base and self.key:
                self._transport(method, path, body)
        except Exception as exc:  # keep going; the local copy has it
            record["error"] = str(exc)
        with self.lock:
            self.local.parent.mkdir(parents=True, exist_ok=True)
            with self.local.open("a") as fh:
                fh.write(json.dumps(record) + "\n")

    def max_attempt(self, repo: str, pr_number: int) -> int:
        """Highest attempt already logged for this PR (0 if none or unreachable). The database, not the
        evidence folder, is the source of truth: a wiped folder must not reuse an attempt number."""
        if not (self.base and self.key):
            return 0
        req = urllib.request.Request(
            f"{self.base}/investigations?select=attempt&repo=eq.{repo}&pr_number=eq.{pr_number}"
            "&order=attempt.desc&limit=1",
            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.load(resp)
            return int(rows[0]["attempt"]) if rows else 0
        except Exception:
            return 0

    def start(self, **fields) -> str:
        inv_id = str(uuid.uuid4())
        self._write("POST", "/investigations", {"id": inv_id, **fields})
        return inv_id

    def update(self, inv_id: str, **fields) -> None:
        self._write("PATCH", f"/investigations?id=eq.{inv_id}", fields)

    def event(self, inv_id: str, stage: str, role: str, kind: str, message: str, *, model: str | None = None,
              artifact_path: str | None = None, data: dict | None = None, duration_ms: int | None = None) -> None:
        self._write("POST", "/events", {
            "investigation_id": inv_id, "stage": stage, "role": role, "kind": kind, "message": message[:4000],
            "model": model, "artifact_path": artifact_path, "data": data or {}, "duration_ms": duration_ms})
