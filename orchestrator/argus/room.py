"""Posting into the #pr-review room (T11).

The local Switch server has no Gateway page for minting a registration key, so the
orchestrator posts through a Discord channel webhook instead. Switch bridges the
webhook's messages into the room, and each agent's "Who can talk to your agent"
rule permits the Argus poster, so a plain-text `@triager ...` hands it work.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Protocol

STAGES = ["scoping", "reproducing", "challenging", "reporting", "verdict"]
MAX_MESSAGE = 2000  # Discord's limit


class Room(Protocol):
    def post(self, text: str) -> None: ...


class DiscordWebhookRoom:
    def __init__(self, webhook_url: str, username: str = "Argus", avatar_url: str | None = None):
        if not webhook_url.startswith("https://"):
            raise ValueError("DISCORD_WEBHOOK_URL is not set")
        self.url, self.username, self.avatar_url = webhook_url, username, avatar_url

    def post(self, text: str) -> None:
        body = {"username": self.username, "content": text[:MAX_MESSAGE],
                "allowed_mentions": {"parse": []}}  # @agent text is read by Switch, not a Discord ping
        if self.avatar_url:
            body["avatar_url"] = self.avatar_url
        data = json.dumps(body).encode()
        for attempt in range(4):
            req = urllib.request.Request(self.url + "?wait=true", data=data, method="POST", headers={
                "Content-Type": "application/json", "User-Agent": "argus (https://github.com/argus-v1, 0.1)"})
            try:
                with urllib.request.urlopen(req, timeout=15):
                    return
            except urllib.error.HTTPError as exc:
                if exc.code == 429:  # rate limited: Discord says how long to wait
                    retry = json.loads(exc.read() or b"{}").get("retry_after", 1)
                    time.sleep(float(retry) + 0.1)
                    continue
                if exc.code >= 500 and attempt < 3:
                    time.sleep(1 + attempt)
                    continue
                raise RuntimeError(f"Discord webhook -> {exc.code}") from None


def banner(stage: str, pr: int, note: str = "") -> str:
    """Stage banner, e.g. '▶ Stage 3/5 · Challenging · PR #2'."""
    n = STAGES.index(stage) + 1
    return f"▶ Stage {n}/5 · {stage.capitalize()} · PR #{pr}" + (f" · {note}" if note else "")
