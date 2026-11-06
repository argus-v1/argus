import json
import unittest
from pathlib import Path

from argus.github import GitHubApp, sanitize

ROOT = Path("/home/ayush/Desktop/Argus")


class SanitizeTests(unittest.TestCase):
    def test_env_values_and_secret_shapes_are_redacted(self):
        text = ("key=s3cr3t-value-123 tok ghs_" + "a" * 36 + " jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlLXZhbHVl"
                " sk_" + "b" * 40 + "\n-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----")
        out = sanitize(text, ["s3cr3t-value-123"], ROOT)
        for leaked in ("s3cr3t-value-123", "ghs_", "eyJhbGci", "sk_bbbb", "MIIE"):
            self.assertNotIn(leaked, out)

    def test_host_paths_become_relative(self):
        out = sanitize("see /home/ayush/Desktop/Argus/shared/evidence/pr-2/repro-main.log and "
                       "/home/ayush/argus/agents/skeptic/repo", [], ROOT)
        self.assertIn("shared/evidence/pr-2/repro-main.log", out)
        self.assertNotIn("/home/ayush", out)

    def test_invisible_line_breaks_cannot_split_a_table_row(self):
        row = "| Whitespace (`' '`, `' '`, `'\x85'`, `'\x1c'`) | ✔ | probes pass |"
        out = sanitize(row, [], ROOT)
        self.assertEqual(len(out.splitlines()), 1)
        for escaped in ("\\u2028", "\\u2029", "\\x85", "\\x1c"):
            self.assertIn(escaped, out)

    def test_long_comment_is_truncated(self):
        out = sanitize("x" * 70000, [], ROOT)
        self.assertLess(len(out), 65536)
        self.assertIn("truncated", out)


class FakeGitHub:
    """Records calls; answers the token dance and label/comment writes."""

    def __init__(self):
        self.calls = []

    def __call__(self, method, url, data, headers):
        path = url.removeprefix("https://api.github.com")
        self.calls.append((method, path, json.loads(data) if data else None))
        if path.endswith("/installation"):
            return 200, b'{"id": 7}'
        if path.endswith("/access_tokens"):
            return 201, b'{"token": "ghs_fake", "expires_at": "2099-01-01T00:00:00Z"}'
        if method == "DELETE":
            return 404, b'{"message": "Label does not exist"}'
        if path.endswith("/comments"):
            return 201, b'{"html_url": "https://github.com/argus-v1/datewise/pull/2#issuecomment-1"}'
        return 200, b"[]"


class WriterTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeGitHub()
        self.gh = GitHubApp("1", Path("/nonexistent"), ["hunter2-secret"], ROOT, transport=self.fake)
        self.gh._jwt = lambda: "jwt"

    def test_set_status_leaves_one_status_label(self):
        self.gh.set_status("argus-v1/datewise", 2, "changes-needed")
        writes = [(m, p, b) for m, p, b in self.fake.calls if "/issues/2/labels" in p]
        self.assertEqual({p.rsplit("/", 1)[-1] for m, p, _ in writes if m == "DELETE"}, {"verifying", "verified"})
        self.assertIn(("POST", "/repos/argus-v1/datewise/issues/2/labels", {"labels": ["changes-needed"]}), writes)

    def test_comment_is_sanitized_before_posting(self):
        url = self.gh.comment("argus-v1/datewise", 2, "log: hunter2-secret at /home/ayush/Desktop/Argus/x.log")
        posted = next(b for m, p, b in self.fake.calls if p.endswith("/comments"))["body"]
        self.assertNotIn("hunter2-secret", posted)
        self.assertNotIn("/home/ayush", posted)
        self.assertTrue(url.endswith("issuecomment-1"))

    def test_token_is_cached(self):
        self.gh.token("argus-v1/datewise")
        self.gh.token("argus-v1/datewise")
        self.assertEqual(sum(p.endswith("/access_tokens") for _, p, _ in self.fake.calls), 1)

    def test_unknown_status_is_refused(self):
        with self.assertRaises(ValueError):
            self.gh.set_status("argus-v1/datewise", 2, "approved")


if __name__ == "__main__":
    unittest.main()
