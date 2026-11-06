"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { INSTALL_URL } from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";

const LINKS: [string, string][] = [
  ["/console", "Console"],
  ["/investigations", "Investigations"],
  ["/evals", "Evals"],
];

/** Light over the landing painting, solid once the page scrolls past it. Always solid inside the console. */
export function Nav() {
  const path = usePathname();
  const overArt = path === "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overArt) return;
    const on = () => setScrolled(window.scrollY > window.innerHeight * 0.55);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overArt]);
  const solid = !overArt || scrolled;

  return (
    <header className={`nav${solid ? " solid" : " ink over"}`}>
      <nav className="wrap">
        <Link className="brand" href="/" aria-label="Argus home">
          <Icon id="i-eye" size={30} />
          <span>Argus</span>
        </Link>
        <div className="links">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-end">
          <ThemeToggle />
          <a className="btn btn-light btn-sm" href={INSTALL_URL}>
            Install on GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
