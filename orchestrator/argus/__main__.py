"""Run the Argus orchestrator: python -m argus [--port 8787]."""

from __future__ import annotations

import argparse
import signal
import threading

from .config import LOGS, Config
from .webhook import Job, Receiver


def main() -> None:
    ap = argparse.ArgumentParser(prog="argus")
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()

    cfg = Config.load()
    if not cfg.webhook_secret:
        raise SystemExit("argus: GITHUB_WEBHOOK_SECRET is not set in .env")

    receiver: Receiver

    def on_job(job: Job) -> None:
        receiver.log(kind="job", result="received", pr=job.pr_number, trigger=job.trigger, head=job.head_sha[:7])

    receiver = Receiver(cfg.webhook_secret, cfg.org, cfg.trigger_label, on_job,
                        log_path=LOGS / "webhooks.jsonl", port=args.port)
    receiver.start()
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    stop.wait()
    receiver.stop()


if __name__ == "__main__":
    main()
