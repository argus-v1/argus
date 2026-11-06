import Link from "next/link";
import { Icon } from "@/components/Icons";
import { LandingFx } from "@/components/LandingFx";
import { countVerified } from "@/lib/supabase";
import { INSTALL_URL } from "@/lib/site";
import "./landing.css";

export const revalidate = 60;

const c = (v: string) => ({ "--c": v }) as React.CSSProperties;

const TOUR = [
  { role: "tri", color: "var(--tri)", k: "01 · Triager", t: "Scopes the claim", b: "Reads the PR, the linked issue and CONTRIBUTING.md, and writes down exactly what the PR says it fixes. That claim, and nothing else, gets tested." },
  { role: "rep", color: "var(--rep)", k: "02 · Reproducer", t: "Proves the bug", b: "Writes a test that fails on main and passes on the PR. Every run happens in a Docker sandbox with no network, so contributor code never runs on the host." },
  { role: "skp", color: "var(--skp)", k: "03 · Skeptic", t: "Tries to break it", b: "A different model re-runs the proof from its own clone and probes the edges. Here it finds that whitespace-only input still crashes." },
  { role: "scr", color: "var(--scr)", k: "04 · Scribe", t: "Writes the verdict", b: "Turns the evidence into one GitHub comment by fixed rules, and Argus sets the label. You merge with GitHub's own button, as always." },
];

const ROOM: { banner?: string; s?: number; color?: string; icon?: string; name?: string; tool?: string; lines?: string[]; q?: string[]; foot?: string[] }[] = [
  { banner: "▶ Stage 1/5 · Scoping · PR #2" },
  { s: 0, color: "var(--tri)", icon: "i-tri", name: "triager", tool: "Claude Code", lines: ["TRIAGER · PR #2 · scoping", "Claim: parse_date('') returns None instead of raising."], q: ["> read pr.json, issue #1, CONTRIBUTING.md  ->  scope.json"], foot: ["model: Claude · 9s", "STATUS: done"] },
  { banner: "▶ Stage 2/5 · Reproducing · PR #2" },
  { s: 1, color: "var(--rep)", icon: "i-rep", name: "reproducer", tool: "Codex", lines: ["REPRODUCER · PR #2 · reproducing", "Bug is real: IndexError on main. The PR's code passes."], q: ["> pytest test_argus_2.py @ main  ->  FAILED", "> pytest test_argus_2.py @ pr-2  ->  PASSED"], foot: ["model: Codex · 32s", "STATUS: done"] },
  { banner: "▶ Stage 3/5 · Challenging · PR #2" },
  { s: 2, color: "var(--skp)", icon: "i-skp", name: "skeptic", tool: "Claude Code", lines: ["SKEPTIC · PR #2 · challenging", "Passes for ''. Fails for '   ' (whitespace). Same IndexError."], q: ["> pytest test_argus_2_probes.py::test_whitespace  ->  FAILED"], foot: ["model: Claude · 31s", "STATUS: done"] },
  { banner: "▶ Stage 4/5 · Reporting · PR #2" },
  { s: 3, color: "var(--scr)", icon: "i-scr", name: "scribe", tool: "Claude Code", lines: ["SCRIBE · PR #2 · reporting", "Verdict: changes needed. Evidence comment ready for GitHub."], q: ["> 4 claims checked  ->  3 passed · 1 failed"], foot: ["model: Claude · 7s", "STATUS: done"] },
  { banner: "■ Stage 5/5 · Verdict · PR #2 · Changes needed" },
];

export default async function Landing() {
  const verified = await countVerified();
  return (
    <main id="top">
      <LandingFx />

      <section className="hero" id="hero">
        <div className="ph" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="art art-img" src="/velazquez.webp" alt="" fetchPriority="high" />
        <div className="wrap inner">
          <h1 className="display">
            <span className="ln"><span>Don&apos;t close the door.</span></span>
            <span className="ln"><span><em>Make them prove it.</em></span></span>
          </h1>
          <p className="lede rv">
            AI made pull requests cheap to write and slow to check. Add the <span className="mono" style={{ fontSize: ".9em" }}>argus</span> label
            to one, and four agents prove or break its claim with real tests, then post the evidence on GitHub.
          </p>
          <div className="ctas rv">
            <a className="btn btn-light" href={INSTALL_URL}>Install the GitHub App <Icon id="i-arrow" /></a>
            <Link className="btn btn-ghost" href="/console">Open the console</Link>
          </div>
        </div>
        <p className="credit">Diego Velázquez, Mercury and Argus, c. 1659 (detail)</p>
      </section>

      <div className="runwin rv" id="run">
        <div className="frame">
          <div className="frame-bar">
            <div className="l"><Icon id="i-eye" size={20} style={{ color: "var(--text)" }} /><b>argus-v1/datewise</b> · PR #2</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="label argus">argus</span><span className="label verifying" id="lbl">verifying</span></div>
          </div>
          <div className="stage dots">
            <div>
              <div className="claim">
                <span className="n">4</span>
                <span className="what"><b>Agents on one claim</b>“Fix crash when parse_date gets an empty string”</span>
              </div>
              <ol className="steps" id="steps">
                <li className="step" style={c("var(--tri)")}><span className="ic"><Icon id="i-tri" size={18} /></span><span><span className="who"><b>TRIAGER</b> · Claude · scoping</span><span className="smsg">Claim: <span className="mono">parse_date(&apos;&apos;)</span> no longer raises</span></span><span className="res" style={{ color: "var(--muted)" }}>scope.json</span></li>
                <li className="step" style={c("var(--rep)")}><span className="ic"><Icon id="i-rep" size={18} /></span><span><span className="who"><b>REPRODUCER</b> · Codex · reproducing</span><span className="cmd">test_argus_2.py @ main</span></span><span className="res bad"><Icon id="i-no" size={14} />FAILED</span></li>
                <li className="step" style={c("var(--rep)")}><span className="ic"><Icon id="i-rep" size={18} /></span><span><span className="who"><b>REPRODUCER</b> · Codex · reproducing</span><span className="cmd">test_argus_2.py @ pr-2</span></span><span className="res ok"><Icon id="i-ok" size={14} />PASSED</span></li>
                <li className="step hot" style={c("var(--skp)")}><span className="ic"><Icon id="i-skp" size={18} /></span><span><span className="who"><b>SKEPTIC</b> · Claude · challenging</span><span className="smsg">Whitespace-only input still crashes</span></span><span className="res bad"><Icon id="i-no" size={14} />FAILED</span></li>
                <li className="step" style={c("var(--scr)")}><span className="ic"><Icon id="i-scr" size={18} /></span><span><span className="who"><b>SCRIBE</b> · Claude · reporting</span><span className="smsg">Evidence comment posted on GitHub</span></span><span className="res" style={{ color: "var(--muted)" }}>comment.md</span></li>
              </ol>
            </div>
            <div className="verdict" id="verdict">
              <p className="vh">The Skeptic&apos;s probes on pr-2</p>
              <div className="probe">
                <span className="in">parse_date(&apos;&apos;)</span><span className="note">the reported case</span><span className="r ok" id="p1"><Icon id="i-ok" size={14} /></span>
                <span className="in">parse_date(&apos;   &apos;)</span><span className="note">whitespace only</span><span className="r bad" id="p2"><Icon id="i-no" size={14} /></span>
                <span className="in">full suite</span><span className="note">19 passed, 0 failed</span><span className="r ok" id="p3"><Icon id="i-ok" size={14} /></span>
              </div>
              <div className="v-word">
                <div className="big"><Icon id="i-no" size={26} />Changes needed</div>
                <div className="why">The fix handles <span className="mono">&apos;&apos;</span> but <span className="mono">&apos;   &apos;</span> still raises IndexError.</div>
              </div>
            </div>
          </div>
        </div>
        <p className="runcap">Demo scenario on argus-v1/datewise, replayed. <Link href="/investigations">See the real runs</Link></p>
      </div>

      <section className="sec" id="problem">
        <div className="wrap">
          <div className="two">
            <h2 className="h display rv">Pull requests got cheap to write. Checking one still costs an hour.</h2>
            <p className="body rv">A maintainer wakes up to thirty of them. Most look professional and many were written by an AI in seconds. Some fix nothing. She can burn out reviewing every one, or stop taking outside contributions. Argus is the third choice.</p>
          </div>
          <div className="cols">
            <div className="col rv">
              <h3 className="display">Looks finished</h3>
              <p>Clean diff, confident description, no test. Reading it tells you nothing about whether the bug is gone.</p>
              <svg viewBox="0 0 340 120" aria-hidden="true"><rect x="1" y="14" width="200" height="92" rx="8" fill="none" stroke="rgb(255 250 235 / .16)" /><path d="M18 38h120M18 56h150M18 74h96M18 92h130" stroke="rgb(255 250 235 / .22)" strokeWidth="5" strokeLinecap="round" /><rect x="232" y="44" width="96" height="32" rx="6" fill="rgb(240 180 60 / .1)" stroke="rgb(240 180 60 / .5)" /><text x="280" y="64.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="#f0b43c">no test</text><path d="M202 60h28" stroke="rgb(255 250 235 / .25)" strokeDasharray="3 4" /></svg>
            </div>
            <div className="col rv">
              <h3 className="display">Fixes the example, not the bug</h3>
              <p>It handles the exact input in the issue. The input next to it still crashes, and nobody tried it.</p>
              <svg viewBox="0 0 340 120" aria-hidden="true"><rect x="1" y="22" width="170" height="34" rx="6" fill="none" stroke="rgb(79 207 127 / .5)" /><text x="16" y="44" fontFamily="var(--mono)" fontSize="12" fill="#ece8dd">parse_date(&apos;&apos;)</text><path d="m184 34 5 5 10-11" fill="none" stroke="#4fcf7f" strokeWidth="2" /><rect x="1" y="68" width="170" height="34" rx="6" fill="rgb(242 86 75 / .1)" stroke="rgb(242 86 75 / .6)" /><text x="16" y="90" fontFamily="var(--mono)" fontSize="12" fill="#ece8dd" xmlSpace="preserve" style={{ whiteSpace: "pre" }}>parse_date(&apos;   &apos;)</text><text x="184" y="90" fontFamily="var(--mono)" fontSize="11.5" fill="#f2564b">IndexError</text></svg>
            </div>
            <div className="col rv">
              <h3 className="display">Or the door closes</h3>
              <p>Some projects have already stopped taking outside pull requests. The honest contributor loses the most.</p>
              <svg viewBox="0 0 340 120" aria-hidden="true"><g fill="rgb(255 250 235 / .2)"><circle cx="20" cy="40" r="5" /><circle cx="20" cy="62" r="5" /><circle cx="20" cy="84" r="5" /><circle cx="46" cy="51" r="5" /><circle cx="46" cy="73" r="5" /></g><path d="M60 62h96" stroke="rgb(255 250 235 / .25)" strokeDasharray="3 4" /><rect x="164" y="14" width="10" height="96" rx="2" fill="#ece8dd" opacity=".75" /><rect x="190" y="30" width="138" height="64" rx="8" fill="none" stroke="rgb(255 250 235 / .16)" /><text x="259" y="66" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="#8b887e">maintainers</text></svg>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="band">
        <div className="ph" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="art-img" src="/peacock.webp" alt="" loading="lazy" />
        <div className="wrap inner">
          <p className="big display rv">A hundred eyes, never all closed at once.</p>
          <p className="small rv">In the myth, Hermes played music until every one of Argus&apos;s eyes fell shut. A pull request that reads well plays the same tune. Argus keeps one agent awake whose only job is to break the proof, and it runs on a different model from the agent that wrote it.</p>
        </div>
        <p className="credit">Peter Paul Rubens, Juno and Argus, c. 1610 (detail)</p>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <div className="two">
            <h2 className="h display rv">Four agents. One claim. <em>Every step on the record.</em></h2>
            <p className="body rv">They work in your team&apos;s Discord room, so you can watch or step in. Each one does a single job, hands its file to the next, and says what it ran. Scroll to follow one run.</p>
          </div>
          <div className="tour" id="tour" style={{ height: "340vh" }}>
            <div className="pin">
              <ol className="rail" id="rail">
                {TOUR.map((s, i) => (
                  <li key={s.k} style={c(s.color)}>
                    <button data-i={i}>
                      <span className="k"><Icon id={`i-${s.role}`} size={14} />{s.k}</span>
                      <span className="tt">{s.t}</span>
                      <span className="bd"><span>{s.b}</span></span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="frame">
                <div className="frame-bar"><div className="l" style={{ margin: "0 auto" }}># pr-review</div></div>
                <div className="room" id="room">
                  <div className="cam" id="cam">
                    {ROOM.map((m, i) =>
                      m.banner ? (
                        <div key={i} className="msg banner" style={c("var(--gold)")}><span /><pre>{m.banner}</pre></div>
                      ) : (
                        <div key={i} className="msg" data-s={m.s} style={c(m.color!)}>
                          <span className="av"><Icon id={m.icon!} size={20} /></span>
                          <div>
                            <div className="nm">{m.name}<small>{m.tool}</small></div>
                            <pre>
                              {m.lines!.join("\n")}
                              {"\n"}
                              <span className="q">{m.q!.join("\n")}</span>
                              <span className="st">{m.foot!.join("\n")}</span>
                            </pre>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                  <div className="ring" id="ring" />
                </div>
              </div>
            </div>
          </div>
          <div className="tour-m">
            {TOUR.map((s, i) => {
              const m = ROOM.find((r) => r.s === i)!;
              return (
                <div key={s.k}>
                  <span className="k" style={{ color: s.color }}>{s.k}</span>
                  <h3 className="display">{s.t}</h3>
                  <p>{s.b}</p>
                  <div className="frame">
                    <div className="msg" style={{ ...c(m.color!), margin: 10 }}>
                      <span className="av"><Icon id={m.icon!} size={20} /></span>
                      <div>
                        <div className="nm">{m.name}<small>{m.tool}</small></div>
                        <pre>{m.lines!.join("\n")}{"\n"}<span className="q">{m.q!.join("\n")}</span><span className="st">{m.foot!.join("\n")}</span></pre>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sec" id="evidence">
        <div className="wrap">
          <div className="two">
            <h2 className="h display rv">One comment. Fifteen seconds. <em>Every line has a receipt.</em></h2>
            <p className="body rv">The verdict and its one reason come first. Each claim names the command that proved it. Logs fold away until you want them, and the full timeline and a bundle to re-run it yourself are one click down.</p>
          </div>
          <div className="ev" id="ev">
            <ol className="tabs" id="tabs">
              {[
                ["Label", <>A maintainer adds the <span className="mono">argus</span> label. That is the whole setup per PR. A new push to a labelled PR starts a fresh run on its own.</>],
                ["Prove", <>Every claim is a test run in the sandbox: no network, CPU and time limits, the output kept as evidence.</>],
                ["Decide", <>The Scribe writes one comment by fixed rules. One failed claim means it is not verified. No rounding up.</>],
              ].map(([t, b], i) => (
                <li key={i} className={i === 0 ? "on" : undefined}>
                  <button data-i={i}><div className="row"><span>0{i + 1}</span><span>{t}</span></div><div className="bd"><p>{b}</p></div></button>
                  <span className="prog" />
                </li>
              ))}
            </ol>
            <div className="panes">
              <div className="pane on" data-p="0"><div className="code"><div className="bar"><span>github · pull request #2</span><span>labels</span></div><pre>
                <span className="c"># the maintainer adds one label</span>{"\n"}<span className="g">+ argus</span>{"\n\n"}<span className="c"># Argus answers with its status label</span>{"\n"}<span className="g">+ verifying</span>{"          "}<span className="c">agents are working</span>{"\n"}<span className="g">~ changes-needed</span>{"     "}<span className="c">a claim failed</span>{"\n"}<span className="g">~ verified</span>{"           "}<span className="c">every claim proven</span>
              </pre></div></div>
              <div className="pane" data-p="1"><div className="code"><div className="bar"><span>sandbox · repro-main.log</span><span>docker · --network none</span></div><pre>
                {"$ run_tests --ref main --test tests/test_argus_2.py\n"}<span className="c">{"  ref main · cpus 1 · timeout 60s"}</span>{"\n\ntests/test_argus_2.py::test_empty_string FAILED\n\n    text = text.strip()\n>   if text[0] == \"+\":\n"}<span style={{ color: "var(--bad)" }}>E   IndexError: string index out of range</span>{"\n\n"}<span className="c">1 failed in 0.21s</span>
              </pre></div></div>
              <div className="pane" data-p="2"><div className="gh"><div className="hd"><Icon id="i-eye" size={20} style={{ color: "#e6edf3" }} /><b>argus-v1</b><span className="bot">bot</span>commented just now</div><div className="bd">
                <h3>Argus verification · PR #2</h3>
                <div><b style={{ color: "var(--bad)" }}>✘ Changes needed</b> — the fix handles <code>&apos;&apos;</code> but <code style={{ whiteSpace: "pre" }}>&apos;   &apos;</code> still crashes.</div>
                <table><thead><tr><th>Claim</th><th>Result</th><th>Proof</th></tr></thead><tbody>
                  <tr><td>Bug exists on <code>main</code></td><td>✔</td><td><code>test_argus_2.py</code> fails with <code>IndexError</code></td></tr>
                  <tr><td>PR fixes <code>&apos;&apos;</code></td><td>✔</td><td>same test passes on <code>pr-2</code></td></tr>
                  <tr><td>Whitespace <code style={{ whiteSpace: "pre" }}>&apos;   &apos;</code></td><td>✘</td><td>probe fails with <code>IndexError</code></td></tr>
                  <tr><td>Existing suite</td><td>✔</td><td>19 passed, 0 failed</td></tr></tbody></table>
                <details><summary>Reproduction on main</summary></details>
                <details><summary>Skeptic&apos;s probes on pr-2</summary></details>
                <div className="foot">Triager (Claude) · Reproducer (Codex) · Skeptic (Claude) · Scribe (Claude)<br /><Link href="/investigations">Investigation timeline</Link> · <Link href="/investigations">Verify it yourself</Link></div>
              </div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="runs">
        <div className="wrap">
          <div className="two">
            <h2 className="h display rv">Your repo. Your room. <em>Your merge button.</em></h2>
            <p className="body rv">Argus fits the flow you already have. The GitHub thread stays the record, Discord is the side channel, and approvals happen where they always did.</p>
          </div>
          <div className="rows rv">
            <div className="rowx"><span>Agents</span><div className="chips"><span className="chip" style={c("var(--tri)")}><i />Triager · Claude Code</span><span className="chip" style={c("var(--rep)")}><i />Reproducer · Codex</span><span className="chip" style={c("var(--skp)")}><i />Skeptic · Claude Code</span><span className="chip" style={c("var(--scr)")}><i />Scribe · Claude Code</span></div></div>
            <div className="rowx"><span>Room</span><div className="chips"><span className="chip">Discord</span><span className="chip">Switch</span></div></div>
            <div className="rowx"><span>Record</span><div className="chips"><span className="chip">GitHub comment and labels</span><span className="chip">Public investigation page</span><span className="chip">Event log</span></div></div>
            <div className="rowx"><span>Sandbox</span><div className="chips"><span className="chip">Docker</span><span className="chip">No network</span><span className="chip">CPU and time limits</span></div></div>
          </div>
        </div>
      </section>

      <section className="close" id="closing">
        <div className="ph" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="art-img" src="/velazquez.webp" alt="" loading="lazy" />
        <div className="wrap inner">
          <div>
            <h2 className="display">Add one label. Get the proof.</h2>
            {verified != null && (
              <p className="count">
                <b>{verified}</b> pull {verified === 1 ? "request" : "requests"} verified so far, <Link href="/investigations">each with a public page</Link>.
              </p>
            )}
          </div>
          <a className="btn btn-light" href={INSTALL_URL}>Install the GitHub App <Icon id="i-arrow" /></a>
        </div>
        <footer className="wrap">
          <span>Paintings: Diego Velázquez, c. 1659 · Peter Paul Rubens, c. 1610 · public domain</span>
          <span><Link href="/console">Console</Link> · <Link href="/evals">Evals</Link> · argus-v1</span>
        </footer>
      </section>
    </main>
  );
}
