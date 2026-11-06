"""GitHub writer (T13): reads PRs and writes labels and the evidence comment as the App.

Only the orchestrator talks to GitHub; agents never get a token. Every comment
passes through `sanitize` first, because it quotes test logs into a public PR.
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

API = "https://api.github.com"
STATUS_LABELS = ("verifying", "changes-needed", "verified")
MAX_COMMENT = 65000  # GitHub's limit is 65536 characters

# Shapes of credentials that must never reach a public comment.
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    re.compile(r"\bsk_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),  # JWTs (Supabase keys)
    re.compile(r"\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}\b"),
]


def sanitize(text: str, secrets: list[str], root: Path) -> str:
    """Remove secrets and host paths from text bound for GitHub."""
    for value in sorted((s for s in secrets if len(s) >= 8), key=len, reverse=True):
        text = text.replace(value, "[redacted]")
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[redacted]", text)
    for prefix in (str(root) + "/", str(Path.home() / "argus") + "/", str(root.resolve()) + "/"):
        text = text.replace(prefix, "")
    text = re.sub(r"/(?:home|Users)/[^/\s]+/", "~/", text)
    text = re.sub(r"/tmp/argus-sbx-[A-Za-z0-9_]+/work/", "", text)
    # Invisible line breaks and control characters (probe inputs pasted raw) can break
    # Markdown tables and are unreadable anyway; write them as U+XXXX.
    text = re.sub(r"[  \x85\x00-\x08\x0b\x0c\x0e-\x1f\x7f]",
                  lambda m: f"U+{ord(m.group()):04X}", text)
    if len(text) > MAX_COMMENT:
        text = text[:MAX_COMMENT - 80] + "\n\n…truncated by Argus to fit GitHub's comment limit.\n"
    return text


class GitHubApp:
    def __init__(self, app_id: str, private_key: Path, secrets: list[str], root: Path,
                 transport: Callable[..., tuple[int, bytes]] | None = None):
        self.app_id, self.private_key = app_id, private_key
        self.secrets, self.root = secrets, root
        self._transport = transport or self._urlopen
        self._tokens: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    # -- auth ------------------------------------------------------------------
    def _jwt(self) -> str:
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        now = int(time.time())
        head = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
        body = b64(json.dumps({"iat": now - 60, "exp": now + 540, "iss": self.app_id}).encode())
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(self.private_key)],
                             input=f"{head}.{body}".encode(), capture_output=True, check=True).stdout
        return f"{head}.{body}.{b64(sig)}"

    def token(self, repo: str) -> str:
        with self._lock:
            cached = self._tokens.get(repo)
            if cached and cached[1] - time.time() > 300:
                return cached[0]
            jwt = self._jwt()
            inst = self._call("GET", f"/repos/{repo}/installation", token=jwt)
            tok = self._call("POST", f"/app/installations/{inst['id']}/access_tokens", {}, token=jwt)
            expires = time.mktime(time.strptime(tok["expires_at"], "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
            self._tokens[repo] = (tok["token"], expires)
            return tok["token"]

    # -- transport -------------------------------------------------------------
    @staticmethod
    def _urlopen(method: str, url: str, data: bytes | None, headers: dict) -> tuple[int, bytes]:
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def _call(self, method: str, path: str, body: dict | None = None, *, token: str,
              accept: str = "application/vnd.github+json", ok: tuple[int, ...] = ()) -> dict | list | str:
        headers = {"Accept": accept, "Authorization": f"Bearer {token}", "User-Agent": "argus",
                   "X-GitHub-Api-Version": "2022-11-28"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        for attempt in range(3):
            status, raw = self._transport(method, API + path, data, headers)
            if status < 500 and status != 429:
                break
            time.sleep(1 + attempt * 2)
        if status >= 400 and status not in ok:
            raise RuntimeError(f"GitHub {method} {path} -> {status}: {raw[:300].decode(errors='replace')}")
        if accept.endswith(".diff"):
            return raw.decode(errors="replace")
        return json.loads(raw) if raw else {}

    def api(self, repo: str, method: str, path: str, body: dict | None = None, **kw):
        return self._call(method, path, body, token=self.token(repo), **kw)

    # -- reads -----------------------------------------------------------------
    def pull(self, repo: str, number: int) -> dict:
        return self.api(repo, "GET", f"/repos/{repo}/pulls/{number}")

    def diff(self, repo: str, number: int) -> str:
        return self.api(repo, "GET", f"/repos/{repo}/pulls/{number}", accept="application/vnd.github.diff")

    def issue(self, repo: str, number: int) -> dict:
        return self.api(repo, "GET", f"/repos/{repo}/issues/{number}")

    def linked_issue(self, repo: str, pr: dict) -> dict | None:
        m = re.search(r"\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)", pr.get("body") or "", re.I)
        if not m:
            return None
        issue = self.issue(repo, int(m.group(1)))
        return {"number": issue["number"], "title": issue["title"], "body": issue.get("body") or ""}

    # -- writes ----------------------------------------------------------------
    def set_status(self, repo: str, number: int, status: str) -> None:
        """Show exactly one Argus status label, keeping every other label."""
        if status not in STATUS_LABELS:
            raise ValueError(f"unknown status label {status!r}")
        for other in STATUS_LABELS:
            if other != status:
                self.api(repo, "DELETE", f"/repos/{repo}/issues/{number}/labels/{other}", ok=(404,))
        self.api(repo, "POST", f"/repos/{repo}/issues/{number}/labels", {"labels": [status]})

    def comment(self, repo: str, number: int, body: str) -> str:
        clean = sanitize(body, self.secrets, self.root)
        result = self.api(repo, "POST", f"/repos/{repo}/issues/{number}/comments", {"body": clean})
        return result["html_url"]
