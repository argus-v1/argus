"use client";

import { useEffect } from "react";

/**
 * The landing page's motion, ported from the approved prototype (web/design/landing.html):
 * reveals, the hero entrance, the looping run window, the pinned scroll tour, and the
 * auto-advancing evidence steps. Everything settles to its final state under reduced motion.
 */
export function LandingFx() {
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || location.search.includes("static");
    const cleanups: (() => void)[] = [];

    // paintings fade in over their blur placeholders
    document.querySelectorAll<HTMLImageElement>(".art-img").forEach((img) => {
      const done = () => img.classList.add("loaded");
      if (img.complete && img.naturalWidth) done();
      else img.addEventListener("load", done, { once: true });
    });

    // hero entrance
    const hero = document.getElementById("hero");
    requestAnimationFrame(() => requestAnimationFrame(() => hero?.classList.add("ready")));

    // reveal on scroll, staggered within a group
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const sibs = [...(el.parentElement?.children ?? [])].filter((c) => c.classList.contains("rv"));
          el.style.transitionDelay = sibs.indexOf(el) * 0.08 + "s";
          el.classList.add("in");
          io.unobserve(el);
        }),
      { threshold: 0.2 },
    );
    document.querySelectorAll(".rv").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    // --- the run, as one calm loop ---
    const steps = [...document.querySelectorAll<HTMLElement>("#steps .step")];
    const verdict = document.getElementById("verdict");
    const lbl = document.getElementById("lbl");
    const probes = ["p1", "p2", "p3"].map((id) => document.getElementById(id));
    const setLabel = (cls: string, txt: string) => {
      if (!lbl) return;
      lbl.className = "label " + cls;
      lbl.textContent = txt;
    };
    const finalState = () => {
      steps.forEach((s) => s.classList.add("on"));
      probes.forEach((p) => p?.classList.add("on"));
      verdict?.classList.add("on", "done");
      setLabel("changes", "changes-needed");
    };
    let timers: number[] = [];
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    if (reduce) finalState();
    else {
      const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
      const run = () => {
        clear();
        steps.forEach((s) => s.classList.remove("on"));
        probes.forEach((p) => p?.classList.remove("on"));
        verdict?.classList.remove("on", "done");
        setLabel("verifying", "verifying");
        [300, 1500, 2600, 4000, 6900].forEach((t, i) => at(t, () => steps[i]?.classList.add("on")));
        at(4300, () => verdict?.classList.add("on"));
        at(4700, () => probes[0]?.classList.add("on"));
        at(5400, () => probes[1]?.classList.add("on"));
        at(6000, () => probes[2]?.classList.add("on"));
        at(7500, () => {
          verdict?.classList.add("done");
          setLabel("changes", "changes-needed");
        });
        at(12500, run);
      };
      let playing = false;
      const runwin = document.getElementById("run");
      if (runwin) {
        const ro = new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting && !playing) {
              playing = true;
              run();
            }
            if (!e.isIntersecting && playing) {
              playing = false;
              clear();
              finalState();
            }
          },
          { threshold: 0.3 },
        );
        ro.observe(runwin);
        cleanups.push(() => ro.disconnect());
      }
    }
    cleanups.push(clear);

    // --- pinned tour: scroll drives the step, the camera glides to that message ---
    const tour = document.getElementById("tour");
    const rail = [...document.querySelectorAll<HTMLElement>("#rail li")];
    const room = document.getElementById("room");
    const cam = document.getElementById("cam");
    const ring = document.getElementById("ring");
    const msgs = [...document.querySelectorAll<HTMLElement>("#cam .msg[data-s]")];
    if (tour && room && cam && ring && msgs.length) {
      let active = -1;
      const focus = (i: number) => {
        if (i === active) return;
        active = i;
        rail.forEach((li, k) => li.classList.toggle("on", k === i));
        msgs.forEach((m, k) => m.classList.toggle("lit", k === i));
        room.classList.add("focus");
        const m = msgs[i];
        const k = reduce ? 1 : 1.35;
        const W = room.clientWidth, H = room.clientHeight;
        const cx = m.offsetLeft + m.offsetWidth * 0.42, cy = m.offsetTop + m.offsetHeight / 2;
        let x = W / 2 - cx * k, y = H / 2 - cy * k;
        x = Math.min(0, Math.max(W - cam.offsetWidth * k, x));
        y = Math.min(0, Math.max(H - cam.offsetHeight * k, y));
        if (reduce) x = 0;
        cam.style.transform = `translate(${x}px,${y}px) scale(${k})`;
        ring.style.setProperty("--c", getComputedStyle(m).getPropertyValue("--c"));
        ring.classList.remove("on");
        ring.style.left = x + m.offsetLeft * k - 4 + "px";
        ring.style.top = y + m.offsetTop * k - 4 + "px";
        ring.style.width = m.offsetWidth * k + 8 + "px";
        ring.style.height = m.offsetHeight * k + 8 + "px";
        void ring.offsetWidth;
        ring.classList.add("on");
      };
      const onTour = () => {
        const r = tour.getBoundingClientRect(), span = tour.offsetHeight - innerHeight;
        const v = Math.min(1, Math.max(0, -r.top / span));
        focus(Math.min(3, Math.floor(v * 4)));
      };
      const onResize = () => {
        active = -1;
        onTour();
      };
      addEventListener("scroll", onTour, { passive: true });
      addEventListener("resize", onResize);
      onTour();
      cleanups.push(() => {
        removeEventListener("scroll", onTour);
        removeEventListener("resize", onResize);
      });
      rail.forEach((li, i) =>
        li.querySelector("button")?.addEventListener("click", () => {
          const top = tour.getBoundingClientRect().top + scrollY, span = tour.offsetHeight - innerHeight;
          scrollTo({ top: top + (span * (i + 0.5)) / 4, behavior: reduce ? "auto" : "smooth" });
        }),
      );
    }

    // --- evidence: three steps that advance on their own until someone picks one ---
    const tabs = [...document.querySelectorAll<HTMLElement>("#tabs li")];
    const panes = [...document.querySelectorAll<HTMLElement>(".pane")];
    const ev = document.getElementById("ev");
    if (tabs.length && ev) {
      const ADV = 7000;
      let cur = 0, auto = true, paused = false, inView = false, t: number | undefined;
      const show = (i: number) => {
        cur = i;
        tabs.forEach((li, k) => li.classList.toggle("on", k === i));
        panes.forEach((p, k) => p.classList.toggle("on", k === i));
        tabs.forEach((li) => {
          const p = li.querySelector<HTMLElement>(".prog");
          if (p) {
            p.style.transition = "none";
            p.style.width = "0";
          }
        });
        const p = tabs[i].querySelector<HTMLElement>(".prog");
        const running = auto && !paused && inView && !reduce;
        if (p) {
          void p.offsetWidth;
          p.style.transition = running ? `width ${ADV}ms linear` : "none";
          p.style.width = "100%";
        }
        clearTimeout(t);
        if (running) t = window.setTimeout(() => show((cur + 1) % tabs.length), ADV);
      };
      tabs.forEach((li, i) =>
        li.querySelector("button")?.addEventListener("click", () => {
          auto = false;
          show(i);
        }),
      );
      ev.addEventListener("mouseenter", () => {
        paused = true;
        show(cur);
      });
      ev.addEventListener("mouseleave", () => {
        paused = false;
        show(cur);
      });
      const eo = new IntersectionObserver(
        ([e]) => {
          inView = e.isIntersecting;
          show(cur);
        },
        { threshold: 0.4 },
      );
      eo.observe(ev);
      cleanups.push(() => {
        eo.disconnect();
        clearTimeout(t);
      });
    }

    return () => {
      cleanups.forEach((f) => f());
    };
  }, []);
  return null;
}
