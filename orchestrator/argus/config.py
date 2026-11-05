"""Settings from Argus/.env (environment variables win)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "shared" / "evidence"
LOGS = ROOT / "orchestrator" / "logs"


def load_env(path: Path = ROOT / ".env") -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    values.update({k: v for k, v in os.environ.items() if k in values or k.startswith(("GITHUB_", "SWITCH_", "SUPABASE_", "NGROK_", "ARGUS_"))})
    return values


@dataclass(frozen=True)
class Config:
    org: str
    repo: str
    webhook_secret: str
    app_id: str
    app_slug: str
    private_key: Path
    supabase_url: str
    supabase_service_key: str
    switch_url: str
    switch_agent_id: str
    switch_agent_key: str
    switch_room_id: str
    ngrok_domain: str
    trigger_label: str = "argus"

    @classmethod
    def load(cls) -> "Config":
        e = load_env()
        return cls(
            org=e.get("GITHUB_ORG", ""),
            repo=e.get("DEMO_REPO", ""),
            webhook_secret=e.get("GITHUB_WEBHOOK_SECRET", ""),
            app_id=e.get("GITHUB_APP_ID", ""),
            app_slug=e.get("GITHUB_APP_SLUG", ""),
            private_key=Path(e.get("GITHUB_APP_PRIVATE_KEY_PATH", "") or "/nonexistent"),
            supabase_url=e.get("SUPABASE_URL", ""),
            supabase_service_key=e.get("SUPABASE_SERVICE_KEY", ""),
            switch_url=e.get("SWITCH_SERVER_URL", ""),
            switch_agent_id=e.get("SWITCH_AGENT_ID", ""),
            switch_agent_key=e.get("SWITCH_AGENT_API_KEY", ""),
            switch_room_id=e.get("SWITCH_ROOM_ID", ""),
            ngrok_domain=e.get("NGROK_DOMAIN", ""),
            trigger_label=e.get("ARGUS_TRIGGER_LABEL", "argus"),
        )
