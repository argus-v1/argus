#!/usr/bin/env python3
"""T17: how long each stage of an investigation took.

    scripts/timeline.py <pr> [--all]

Reads the orchestrator's local event log (orchestrator/logs/events.jsonl) and
prints the latest attempt for that PR (every attempt with --all): one line per
stage with its duration, and the total from label to verdict.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

LOG = Path(__file__).resolve().parent.parent / "orchestrator" / "logs" / "events.jsonl"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return 2
    pr, show_all = int(sys.argv[1]), "--all" in sys.argv
    rows = [json.loads(line) for line in LOG.read_text().splitlines()] if LOG.exists() else []

    attempts: dict[str, dict] = {}
    for r in rows:
        body = r["body"]
        if r["method"] == "POST" and r["path"] == "/investigations" and body.get("pr_number") == pr:
            attempts[body["id"]] = {"attempt": body["attempt"], "trigger": body["trigger"],
                                    "start": r["ts"], "marks": []}
        elif r["method"] == "POST" and r["path"] == "/events" and body.get("investigation_id") in attempts:
            if body["kind"] == "banner":
                attempts[body["investigation_id"]]["marks"].append((r["ts"], body["message"]))
    if not attempts:
        print(f"no investigations for PR #{pr} in {LOG}")
        return 1

    chosen = list(attempts.values()) if show_all else [list(attempts.values())[-1]]
    for a in chosen:
        t = lambda ts: datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z")
        start = t(a["start"])
        print(f"PR #{pr} · attempt {a['attempt']} ({a['trigger']})")
        marks = a["marks"]
        for i, (ts, msg) in enumerate(marks):
            end = t(marks[i + 1][0]) if i + 1 < len(marks) else None
            took = f"{(end - t(ts)).total_seconds():5.0f}s" if end else "     "
            print(f"  {t(ts):%H:%M:%S}  {took}  {msg.split(chr(10))[0][:70]}")
        if marks and marks[-1][1].startswith("Verdict"):
            total = (t(marks[-1][0]) - start).total_seconds()
            flag = "✔ under 3 min" if total <= 180 else "✘ over 3 min"
            print(f"  total {int(total // 60)}:{int(total % 60):02d} from label to verdict  {flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
