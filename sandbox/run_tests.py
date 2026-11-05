#!/usr/bin/env python3
"""Run a repo's tests at a given ref inside the Argus sandbox.

Untrusted code never runs on the host. The commit is exported with
`git archive` (no .git, no hooks), extra test files are copied in, and
pytest runs in a container with no network, a read-only filesystem,
CPU / memory / process limits, no capabilities, and an unprivileged user.

Writes <out>/<label>.json and <out>/<label>.log, prints one summary line,
and exits with pytest's exit code (124 on timeout).

Example:
    sandbox/run_tests.py --repo agents/reproducer/repo --ref main \
        --add-test shared/evidence/pr-1/attempt-1/test_argus_1.py \
        --out shared/evidence/pr-1/attempt-1 --label repro-main \
        tests/test_argus_1.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

IMAGE = os.environ.get("ARGUS_SANDBOX_IMAGE", "argus-sandbox:py3.12")
LABEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, type=Path, help="local git clone to export from")
    ap.add_argument("--ref", required=True, help="branch, tag or sha to test")
    ap.add_argument("--add-test", action="append", default=[], type=Path,
                    help="test file to copy into tests/ before running (repeatable)")
    ap.add_argument("--out", required=True, type=Path, help="evidence folder for the JSON and log")
    ap.add_argument("--label", required=True, help="name for this run, e.g. repro-main")
    ap.add_argument("--timeout", type=int, default=120, help="seconds before the run is killed")
    ap.add_argument("--cpus", default="1")
    ap.add_argument("--memory", default="512m")
    ap.add_argument("select", nargs="*", help="pytest node ids or paths (default: whole suite)")
    args = ap.parse_args()

    if not LABEL_RE.match(args.label):
        ap.error("--label may only use letters, digits, '.', '_' and '-'")
    for sel in args.select:
        if sel.startswith("-") or ".." in sel or sel.startswith("/"):
            ap.error(f"refusing selector {sel!r}: use a relative path or node id")

    repo = args.repo.resolve()
    sha = git(repo, "rev-parse", "--verify", f"{args.ref}^{{commit}}").strip()
    args.out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="argus-sbx-") as tmp:
        work = Path(tmp, "work")
        results = Path(tmp, "results")
        work.mkdir()
        results.mkdir()

        # Export the exact commit: plain files only, nothing from .git.
        archive = subprocess.run(["git", "-C", str(repo), "archive", "--format=tar", sha],
                                 check=True, capture_output=True).stdout
        subprocess.run(["tar", "-x", "-C", str(work)], input=archive, check=True)

        tests_dir = work / "tests"
        for test in args.add_test:
            if not test.is_file():
                ap.error(f"--add-test {test} is not a file")
            tests_dir.mkdir(exist_ok=True)
            shutil.copy2(test, tests_dir / test.name)

        # The container runs as uid 65534; it reads work/ and writes only results/.
        os.chmod(work, 0o755)
        os.chmod(results, 0o777)

        name = f"argus-sbx-{uuid.uuid4().hex[:12]}"
        pytest_args = ["-p", "no:cacheprovider", "-q", "-rA", "--junitxml=/results/junit.xml", *args.select]
        docker_cmd = [
            "docker", "run", "--rm", "--name", name,
            "--network", "none",
            "--read-only", "--tmpfs", "/tmp:rw,size=64m",
            "--cpus", args.cpus, "--memory", args.memory, "--memory-swap", args.memory,
            "--pids-limit", "128",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--user", "65534:65534",
            "-v", f"{work}:/work:ro", "-v", f"{results}:/results:rw",
            "-w", "/work", "-e", "PYTHONPATH=/work/src:/work",
            IMAGE, "python", "-m", "pytest", *pytest_args,
        ]

        started = datetime.now(timezone.utc)
        t0 = time.monotonic()
        try:
            proc = subprocess.run(docker_cmd, capture_output=True, text=True, timeout=args.timeout)
            exit_code, log = proc.returncode, proc.stdout + proc.stderr
        except subprocess.TimeoutExpired as exc:
            subprocess.run(["docker", "kill", name], capture_output=True)
            exit_code = 124
            log = _text(exc.stdout) + _text(exc.stderr) + f"\n[argus] killed after {args.timeout}s\n"
        duration_ms = int((time.monotonic() - t0) * 1000)

        counts, cases = parse_junit(results / "junit.xml")

    outcome = {0: "passed", 1: "failed", 124: "timeout"}.get(exit_code, "error")
    command = "pytest " + " ".join(args.select) if args.select else "pytest"
    log_path = args.out / f"{args.label}.log"
    log_path.write_text(log)
    record = {
        "label": args.label,
        "ref": args.ref,
        "sha": sha,
        "command": command,
        "added_tests": [t.name for t in args.add_test],
        "outcome": outcome,
        "exit_code": exit_code,
        "counts": counts,
        "cases": cases,
        "duration_ms": duration_ms,
        "started_at": started.isoformat(timespec="seconds"),
        "log": log_path.name,
        "sandbox": {"image": IMAGE, "network": "none", "cpus": args.cpus, "memory": args.memory,
                    "timeout_s": args.timeout},
    }
    (args.out / f"{args.label}.json").write_text(json.dumps(record, indent=2) + "\n")

    mark = "✔" if outcome == "passed" else "✘"
    summary = ", ".join(f"{v} {k}" for k, v in counts.items() if v) or "no tests ran"
    print(f"{mark} {args.label}: {command} @ {args.ref} ({sha[:7]}) -> {outcome.upper()} "
          f"[{summary}] {duration_ms / 1000:.1f}s")
    return exit_code


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def parse_junit(path: Path) -> tuple[dict, list]:
    counts = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    cases: list[dict] = []
    if not path.exists():
        return counts, cases
    for tc in ET.parse(path).getroot().iter("testcase"):
        node = f"{tc.get('classname', '').replace('.', '/')}.py::{tc.get('name')}"
        status, message = "passed", None
        for tag, label in (("failure", "failed"), ("error", "errors"), ("skipped", "skipped")):
            el = tc.find(tag)
            if el is not None:
                status, message = label, (el.get("message") or "").strip()[:500]
                break
        counts[status] += 1
        cases.append({"id": node, "outcome": "error" if status == "errors" else status,
                      "message": message, "time_s": float(tc.get("time", 0))})
    return counts, cases


def _text(data) -> str:
    if data is None:
        return ""
    return data.decode(errors="replace") if isinstance(data, bytes) else data


if __name__ == "__main__":
    sys.exit(main())
