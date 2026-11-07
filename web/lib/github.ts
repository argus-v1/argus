// Live pull request state from GitHub's public API, so the queue can tell "ready to merge" from
// "already merged/closed". Public repos only, no token: cached for two minutes per PR to stay far
// below the unauthenticated rate limit. Any failure just means "state unknown".

export type PrState = "open" | "merged" | "closed";

export async function prState(repo: string, pr: number): Promise<PrState | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "argus-site" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { state: string; merged_at: string | null };
    return p.merged_at ? "merged" : p.state === "open" ? "open" : "closed";
  } catch {
    return null;
  }
}

export async function prStates(keys: { repo: string; pr_number: number }[]): Promise<Map<string, PrState | null>> {
  const uniq = [...new Map(keys.map((k) => [`${k.repo}#${k.pr_number}`, k])).values()].slice(0, 40);
  const states = await Promise.all(uniq.map((k) => prState(k.repo, k.pr_number)));
  return new Map(uniq.map((k, i) => [`${k.repo}#${k.pr_number}`, states[i]]));
}
