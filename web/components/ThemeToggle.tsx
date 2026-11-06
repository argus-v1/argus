"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "./Icons";

type Theme = "light" | "dark";
const KEY = "argus.theme";

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Light / dark switch. The new theme spreads from the button in a circle (View Transitions API);
 * browsers without it, and visitors who prefer reduced motion, get an instant switch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => setTheme(current()), []);

  const flip = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      setTheme(next);
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (!doc.startViewTransition || reduce) return apply();

    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2;
    const y = e.clientY || r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement;
    root.classList.add("theme-vt");
    const t = doc.startViewTransition(() => flushSync(apply));
    t.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 560, easing: "cubic-bezier(.65, 0, .35, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
    t.finished.finally(() => root.classList.remove("theme-vt"));
  };

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="theme-btn" onClick={flip} aria-label={label} title={label}>
      <Icon id={theme === "dark" ? "i-sun" : "i-moon"} size={17} />
    </button>
  );
}
