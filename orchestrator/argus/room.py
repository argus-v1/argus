"""Posting into the #pr-review room (T11).

The local Switch server has no Gateway page for minting a registration key, so the
orchestrator posts through a Discord channel webhook instead. Switch bridges the
webhook's messages into the room, and each agent's "Who can talk to your agent"
rule permits the Argus poster, so a plain-text `@triager ...` hands it work.

Keeping the channel readable: when DISCORD_BOT_TOKEN is set, each investigation
gets one status line in the channel (edited as stages advance) and a thread under
it for everything else. Agents reply in the thread they were addressed in. Without
the token, messages go to the channel.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Protocol

STAGES = ["scoping", "reproducing", "challenging", "reporting", "verdict"]
MAX_MESSAGE = 2000  # Discord's limit
API = "https://discord.com/api/v10"
UA = "argus (https://github.com/argus-v1, 0.1)"


class Room(Protocol):
    def post(self, text: str, thread: str | None = None) -> str | None: ...
    def edit(self, message_id: str, text: str) -> None: ...
    def start_thread(self, message_id: str, name: str) -> str | None: ...


def _request(method: str, url: str, body: dict | None, headers: dict) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(4):
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json", "User-Agent": UA, **headers})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            if exc.code == 429:  # rate limited: Discord says how long to wait
                retry = json.loads(exc.read() or b"{}").get("retry_after", 1)
                time.sleep(float(retry) + 0.1)
                continue
            if exc.code >= 500 and attempt < 3:
                time.sleep(1 + attempt)
                continue
            raise RuntimeError(f"Discord {method} -> {exc.code}") from None
    raise RuntimeError(f"Discord {method}: gave up after rate limits")


class DiscordWebhookRoom:
    def __init__(self, webhook_url: str, username: str = "Argus", avatar_url: str | None = None,
                 bot_token: str = ""):
        m = re.fullmatch(r"https://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/api/(?:v\d+/)?webhooks/(\d+)/([\w-]+)",
                         webhook_url.strip())
        if not m:
            raise ValueError("DISCORD_WEBHOOK_URL is not a Discord webhook URL")
        self.url = f"{API}/webhooks/{m.group(1)}/{m.group(2)}"
        self.username, self.avatar_url, self.bot_token = username, avatar_url, bot_token
        self._channel_id: str | None = None

    @property
    def threads(self) -> bool:
        return bool(self.bot_token)

    def post(self, text: str, thread: str | None = None) -> str | None:
        body = {"username": self.username, "content": text[:MAX_MESSAGE],
                "allowed_mentions": {"parse": []}}  # @agent text is read by Switch, not a Discord ping
        if self.avatar_url:
            body["avatar_url"] = self.avatar_url
        query = "?wait=true" + (f"&thread_id={thread}" if thread else "")
        return _request("POST", self.url + query, body, {}).get("id")

    def edit(self, message_id: str, text: str) -> None:
        _request("PATCH", f"{self.url}/messages/{message_id}", {"content": text[:MAX_MESSAGE],
                                                                 "allowed_mentions": {"parse": []}}, {})

    def recent(self, thread: str | None = None, limit: int = 20) -> list[dict] | None:
        """Latest messages in the thread (or channel), newest first. None without the bot token."""
        if not self.bot_token:
            return None
        if not self._channel_id:
            self._channel_id = _request("GET", self.url, None, {})["channel_id"]
        try:
            return _request("GET", f"{API}/channels/{thread or self._channel_id}/messages?limit={limit}", None,
                            {"Authorization": f"Bot {self.bot_token}"})
        except RuntimeError:
            return None

    def post_as(self, name: str, text: str, thread: str | None = None) -> str | None:
        """Post under another display name (used to relay an agent's own report)."""
        saved, self.username = self.username, name
        try:
            return self.post(text, thread=thread)
        finally:
            self.username = saved

    def start_thread(self, message_id: str, name: str) -> str | None:
        """Open a thread under a channel message (needs the bot token). None if unavailable."""
        if not self.bot_token:
            return None
        if not self._channel_id:
            self._channel_id = _request("GET", self.url, None, {})["channel_id"]
        try:
            thread = _request("POST", f"{API}/channels/{self._channel_id}/messages/{message_id}/threads",
                              {"name": name[:100], "auto_archive_duration": 1440},
                              {"Authorization": f"Bot {self.bot_token}"})
            return thread["id"]
        except RuntimeError:
            return None


def banner(stage: str, pr: int, note: str = "") -> str:
    """Stage banner, e.g. '▶ Stage 3/5 · Challenging · PR #2'."""
    n = STAGES.index(stage) + 1
    return f"▶ Stage {n}/5 · {stage.capitalize()} · PR #{pr}" + (f" · {note}" if note else "")
