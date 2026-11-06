import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadError, StateBadge } from "@/components/console";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icons";
import { investigationHref, repoName, short, stateOf } from "@/lib/derive";
import { getAttempts, getEvents } from "@/lib/supabase";
import type { Event, Investigation } from "@/lib/types";
import "@/app/console.css";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; pr: string; attempt: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: `Verify ${p.owner}/${p.repo} #${p.pr}` };
}

function FileBox({ text }: { text: string }) {
  return (
    <div className="cmdbox">
      <pre>{text}</pre>
      <CopyButton text={text} label="Copy file" />
    </div>
  );
}

function Cmd({ lines }: { lines: string[] }) {
  const text = lines.filter((l) => !l.startsWith("#")).join("\n");
  return (
    <div className="cmdbox">
      <pre>
        {lines.map((l, i) => (
          <span key={i} className={l.startsWith("#") ? "c" : undefined}>{l}{i < lines.length - 1 ? "\n" : ""}</span>
        ))}
      </pre>
      <CopyButton text={text} label="Copy commands" />
    </div>
  );
}

export default async function Bundle({ params }: { params: Promise<Params> }) {
  const p = await params;
  const repo = `${p.owner}/${p.repo}`;
  const pr = Number(p.pr), attempt = Number(p.attempt);
  if (!Number.isInteger(pr) || !Number.isInteger(attempt)) notFound();

  let inv: Investigation | undefined, events: Event[] = [];
  try {
    inv = (await getAttempts(repo, pr)).find((a) => a.attempt === attempt);
    if (inv) events = await getEvents([inv.id]);
  } catch (e) {
    return <main className="con"><div className="wrap"><div className="sect"><LoadError what="this bundle" message={(e as Error).message} /></div></div></main>;
  }
  if (!inv) notFound();

  const runs = events.filter((e) => e.kind === "test_run" && e.data.test);
  const dir = repoName(repo);
  // One block per distinct (sha, test): the same check the agents ran, in the order they ran it.
  const seen = new Set<string>();
  const checks = runs.filter((e) => {
    const k = `${e.data.sha ?? e.data.ref}|${e.data.test}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const fileSeen = new Set<string>();
  const withFiles = runs.filter((e) => {
    if (typeof e.data.content !== "string" || !e.data.content) return false;
    const name = e.data.test_file ?? e.data.test ?? "";
    if (fileSeen.has(name)) return false;
    fileSeen.add(name);
    return true;
  });
  const savePath = (e: Event) => {
    const t = e.data.test ?? "";
    const f = e.data.test_file ?? t;
    return t.endsWith(f) ? t : `tests/${f.split("/").pop()}`;
  };
  const agentFiles = [...new Set(checks.map((e) => e.data.test!).filter((t) => /test_argus_/.test(t)))];

  return (
    <main className="con">
      <div className="wrap" style={{ maxWidth: 980 }}>
        <header className="ihead">
          <div className="crumbs">
            <Link href={investigationHref(inv)}>{repo} #{pr} · attempt {attempt}</Link><span>/</span><span>verify it yourself</span>
          </div>
          <h1>Re-run the proof on your own machine</h1>
          <div className="imeta">
            <span>{inv.pr_title}</span>
          </div>
          <div className="iacts">
            <StateBadge state={stateOf(inv)} large />
            <Link className="btn btn-line btn-sm" href={investigationHref(inv)}>Back to the timeline</Link>
          </div>
        </header>

        <ol className="steps-v">
          <li>
            <div>
              <h3>Get the repository and this exact pull request</h3>
              <p>The commits below are the ones Argus tested, so you see what the agents saw.</p>
              <Cmd lines={[
                `git clone https://github.com/${repo}.git && cd ${dir}`,
                `git fetch origin pull/${pr}/head:pr-${pr}`,
                `python -m pip install -e . pytest`,
              ]} />
            </div>
          </li>

          {agentFiles.length > 0 && (
            <li>
              <div>
                <h3>Add the tests the agents wrote</h3>
                {withFiles.length ? (
                  <>
                    <p>Save each one at the path shown. The copy button copies the file, ready to paste.</p>
                    {withFiles.map((e) => (
                      <div key={e.id} style={{ marginBottom: 12 }}>
                        <div className="fname">{savePath(e)}</div>
                        <FileBox text={String(e.data.content)} />
                      </div>
                    ))}
                  </>
                ) : (
                  <p>
                    The agents wrote {agentFiles.map((f, i) => <span key={f}>{i ? ", " : ""}<span className="mono">{f}</span></span>)}.
                    These files are not in the repository and are not published here yet, so the runs below that use them can only be
                    read on the timeline for now. The suite runs work as they are.
                  </p>
                )}
              </div>
            </li>
          )}

          {checks.length > 0 ? (
            checks.map((e) => (
              <li key={e.id}>
                <div>
                  <h3>
                    {e.data.label ?? "Run"} <span style={{ color: "var(--faint)", fontWeight: 400 }}>· expect {String(e.data.outcome ?? "?").toUpperCase()}</span>
                  </h3>
                  <p>{e.data.summary ?? e.message}</p>
                  <Cmd lines={[
                    `git checkout ${e.data.sha ?? (e.data.ref === "main" ? "main" : `pr-${pr}`)}   # ${e.data.ref}${e.data.sha ? ` @ ${short(e.data.sha)}` : ""}`,
                    `python -m pytest ${e.data.test} -q`,
                  ]} />
                  {e.data.log_tail && (
                    <details className="logtail">
                      <summary>What Argus saw (last lines of the log)</summary>
                      <pre>{e.data.log_tail}</pre>
                    </details>
                  )}
                </div>
              </li>
            ))
          ) : (
            <li><div><h3>No test runs recorded yet</h3><p>Commands appear here as the agents run them.</p></div></li>
          )}
        </ol>

        <div className="notebox">
          <b>Run it in a sandbox if you don&apos;t trust the code.</b> Argus ran every one of these in Docker with no network and CPU and
          time limits. Contributor code is untrusted until a maintainer reads it.{" "}
          {inv.pr_url && <a className="u" href={inv.pr_url}>Read the pull request <Icon id="i-out" size={12} /></a>}
        </div>
      </div>
    </main>
  );
}
