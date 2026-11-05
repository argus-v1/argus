#!/usr/bin/env python3
"""Create the Argus GitHub App with GitHub's manifest flow and save its credentials.

    scripts/create_github_app.py [--name Argus] [--port 8765]

Open the printed localhost address in a browser signed in as an owner of the
org, click "Create GitHub App" on GitHub, and you're sent back here. The script
then saves:

    .secrets/github-app.pem                 private key (mode 600, git-ignored)
    .env  GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
          GITHUB_WEBHOOK_SECRET, GITHUB_APP_PRIVATE_KEY_PATH

and redirects you to the page that installs the App on a repository.
Nothing secret is printed.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
PEM = ROOT / ".secrets" / "github-app.pem"
API = "https://api.github.com"


def read_env() -> dict[str, str]:
    out = {}
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def write_env(updates: dict[str, str]) -> None:
    text = ENV.read_text()
    for key, value in updates.items():
        line = f"{key}={value}"
        if re.search(rf"^{key}=.*$", text, flags=re.M):
            text = re.sub(rf"^{key}=.*$", lambda _: line, text, flags=re.M)
        else:
            text = text.rstrip("\n") + f"\n{line}\n"
    ENV.write_text(text)
    os.chmod(ENV, 0o600)


def github(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "argus-setup",
                 "X-GitHub-Api-Version": "2022-11-28",
                 **({"Authorization": f"Bearer {token}"} if token else {}),
                 **({"Content-Type": "application/json"} if body is not None else {})})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def app_jwt(app_id: str, pem: Path) -> str:
    """RS256 JWT for authenticating as the App, signed with openssl."""
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    now = int(time.time())
    header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64(json.dumps({"iat": now - 60, "exp": now + 540, "iss": app_id}).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(pem)],
                         input=signing_input, capture_output=True, check=True).stdout
    return f"{header}.{payload}.{b64(sig)}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="Argus")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--timeout", type=int, default=1800, help="seconds to wait for the browser")
    args = ap.parse_args()

    env = read_env()
    org, domain = env.get("GITHUB_ORG"), env.get("NGROK_DOMAIN")
    if not org or not domain:
        sys.exit("create_github_app: set GITHUB_ORG and NGROK_DOMAIN in .env first")

    state = secrets.token_urlsafe(24)
    base = f"http://localhost:{args.port}"
    manifest = {
        "name": args.name,
        "url": f"https://github.com/{org}",
        "description": "Don't close the door. Make them prove it. Argus verifies a pull request's "
                       "claim with sandboxed tests when a maintainer adds the argus label.",
        "hook_attributes": {"url": f"https://{domain}/webhook", "active": True},
        "redirect_url": f"{base}/callback",
        "public": False,
        "default_permissions": {
            "pull_requests": "write",   # read PRs, set labels via the PR
            "issues": "write",          # labels and the evidence comment
            "contents": "read",         # read code and CONTRIBUTING.md; Argus never pushes
            "metadata": "read",
        },
        "default_events": ["pull_request", "issue_comment", "label"],
    }
    action = f"https://github.com/organizations/{org}/settings/apps/new?state={urllib.parse.quote(state)}"
    result: dict = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # keep codes and secrets out of the terminal
            pass

        def send(self, status: int, body: str, headers: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body.encode())

        def do_GET(self):
            url = urllib.parse.urlparse(self.path)
            if url.path == "/":
                self.send(200, f"""<!doctype html><meta charset="utf-8"><title>Create the Argus GitHub App</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Create the Argus GitHub App</h1>
<p>This sends GitHub the App's settings for the <b>{html.escape(org)}</b> org. On GitHub, check the name and click
<b>Create GitHub App</b>. You'll be sent back here, then on to install it.</p>
<form method="post" action="{html.escape(action)}">
<input type="hidden" name="manifest" value="{html.escape(json.dumps(manifest))}">
<button style="font-size:1.1rem;padding:.6rem 1.2rem">Continue to GitHub</button></form>
<pre style="background:#f4f4f4;padding:1rem;overflow:auto">{html.escape(json.dumps(manifest, indent=2))}</pre>""")
                return
            if url.path != "/callback":
                self.send(404, "not found")
                return
            q = urllib.parse.parse_qs(url.query)
            if q.get("state", [""])[0] != state or "code" not in q:
                self.send(400, "<p>State mismatch or missing code. Start again from the first page.</p>")
                return
            try:
                data = github("POST", f"/app-manifests/{q['code'][0]}/conversions")
            except urllib.error.HTTPError as exc:
                self.send(502, f"<p>GitHub refused the conversion: {exc.code}. Start again.</p>")
                result["error"] = f"conversion failed: HTTP {exc.code}"
                done.set()
                return
            PEM.parent.mkdir(mode=0o700, exist_ok=True)
            PEM.write_text(data["pem"])
            os.chmod(PEM, 0o600)
            result.update(id=str(data["id"]), slug=data["slug"], owner=data["owner"]["login"],
                          client_id=data["client_id"], client_secret=data["client_secret"],
                          webhook_secret=data.get("webhook_secret"))
            install = f"https://github.com/apps/{data['slug']}/installations/new"
            self.send(302, "", {"Location": install})
            done.set()

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Open {base} in a browser signed in to GitHub as an owner of {org}.", flush=True)
    if not done.wait(args.timeout):
        server.shutdown()
        sys.exit("create_github_app: timed out waiting for the browser")
    time.sleep(1)  # let the redirect reach the browser
    server.shutdown()
    if "error" in result:
        sys.exit(f"create_github_app: {result['error']}")

    updates = {
        "GITHUB_APP_ID": result["id"],
        "GITHUB_APP_SLUG": result["slug"],
        "GITHUB_CLIENT_ID": result["client_id"],
        "GITHUB_CLIENT_SECRET": result["client_secret"],
        "GITHUB_APP_PRIVATE_KEY_PATH": str(PEM),
    }
    # Use the secret GitHub generated; if it didn't make one, set ours on the App's webhook.
    token = app_jwt(result["id"], PEM)
    if result["webhook_secret"]:
        updates["GITHUB_WEBHOOK_SECRET"] = result["webhook_secret"]
    else:
        github("PATCH", "/app/hook/config", {"secret": env["GITHUB_WEBHOOK_SECRET"],
                                             "content_type": "json"}, token=token)
    write_env(updates)

    app = github("GET", "/app", token=token)  # proves the key works
    hook = github("GET", "/app/hook/config", token=token)
    print(f"Created {app['name']} (id {app['id']}, slug {app['slug']}) owned by {result['owner']}; "
          f"comments as {app['slug']}[bot].")
    print(f"Webhook: {hook.get('url')} · content type {hook.get('content_type')} · "
          f"secret {'set' if hook.get('secret') else 'MISSING'}")
    print(f"Permissions: {json.dumps(app.get('permissions'))}")
    print(f"Events: {', '.join(app.get('events', []))}")
    print(f"Saved the key to {PEM.relative_to(ROOT)} and 5 values to .env.")
    print(f"Next: install it on the repo at https://github.com/apps/{result['slug']}/installations/new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
