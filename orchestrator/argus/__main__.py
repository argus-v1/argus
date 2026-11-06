"""Run the Argus orchestrator: python -m argus [--port 8787]."""

from __future__ import annotations

import argparse
import signal
import threading

from .config import EVIDENCE, LOGS, ROOT, Config, load_env
from .eventlog import EventLog
from .github import GitHubApp
from .investigation import Investigation, Orchestrator
from .room import DiscordWebhookRoom
from .webhook import Job, Receiver

SECRET_KEYS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "WEBHOOK_URL")


def main() -> None:
    ap = argparse.ArgumentParser(prog="argus")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--stage-timeout", type=float, default=600, help="seconds to wait for each agent")
    args = ap.parse_args()

    cfg = Config.load()
    env = load_env()
    if not cfg.webhook_secret:
        raise SystemExit("argus: GITHUB_WEBHOOK_SECRET is not set in .env")

    secrets = [v for k, v in env.items() if any(s in k for s in SECRET_KEYS) and v]
    gh = GitHubApp(cfg.app_id, cfg.private_key, secrets, ROOT)
    room = DiscordWebhookRoom(env.get("DISCORD_WEBHOOK_URL", ""), avatar_url=env.get("ARGUS_AVATAR_URL") or None,
                              bot_token=env.get("DISCORD_BOT_TOKEN", ""))
    log = EventLog(cfg.supabase_url, cfg.supabase_service_key, LOGS / "events.jsonl")
    models = {"triager": env.get("ARGUS_TRIAGER_MODEL", "Claude"),
              "reproducer": env.get("ARGUS_REPRODUCER_MODEL", "Codex"),
              "skeptic": env.get("ARGUS_SKEPTIC_MODEL", "Claude"),
              "scribe": env.get("ARGUS_SCRIBE_MODEL", "Claude")}

    receiver: Receiver

    def make(job: Job, cancel: threading.Event) -> Investigation:
        return Investigation(job, gh, room, log, EVIDENCE, cancel, models=models,
                             site_url=env.get("ARGUS_SITE_URL", ""), stage_timeout=args.stage_timeout)

    orchestrator = Orchestrator(make, log_fn=lambda msg: receiver.log(kind="investigation", result=msg))

    def on_job(job: Job) -> None:
        receiver.log(kind="job", result="started", pr=job.pr_number, trigger=job.trigger, head=job.head_sha[:7])
        orchestrator.on_job(job)

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
