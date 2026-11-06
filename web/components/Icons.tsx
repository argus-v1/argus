import type { Role } from "@/lib/types";

/** One SVG sprite for the whole site: the eye mark, the four role icons, arrows and status glyphs. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-tri" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6z" /></g></symbol>
        <symbol id="i-rep" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d="M9.5 3h5M10.5 3v5.6L5.2 18.2A1.9 1.9 0 0 0 6.9 21h10.2a1.9 1.9 0 0 0 1.7-2.8L13.5 8.6V3" /><path d="M7.6 14h8.8" /></g></symbol>
        <symbol id="i-skp" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.4 15.4 5.1 5.1" /></g></symbol>
        <symbol id="i-scr" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z" /><path d="M6 4a2 2 0 0 0-2 2v1h2M9.5 9h5M9.5 12.5h5M9.5 16h3" /></g></symbol>
        <symbol id="i-eye" viewBox="0 0 32 32"><path d="M2.5 16C6.6 9.6 11 6.6 16 6.6S25.4 9.6 29.5 16C25.4 22.4 21 25.4 16 25.4S6.6 22.4 2.5 16Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="16" cy="16" r="6.2" fill="#d9b673" /><circle cx="16" cy="16" r="2.6" fill="#0d0d0b" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 16 16"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-out" viewBox="0 0 16 16"><path d="M5.5 3.5h7v7M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-ok" viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-no" viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-dot" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5" fill="currentColor" /></symbol>
        <symbol id="i-hand" viewBox="0 0 16 16"><path d="M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V3.8a1 1 0 0 1 2 0V8M11 6.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-8.2 2.6L3.2 10.2a1 1 0 0 1 1.6-1.2L5 9.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-sun" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5" /></g></symbol>
        <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></symbol>
        <symbol id="i-copy" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></g></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ id, size = 16, className, style }: { id: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} className={className} style={style} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export const ROLE_ICON: Record<Role, string> = {
  orchestrator: "i-eye",
  triager: "i-tri",
  reproducer: "i-rep",
  skeptic: "i-skp",
  scribe: "i-scr",
};

export const ROLE_VAR: Record<Role, string> = {
  orchestrator: "var(--gold)",
  triager: "var(--tri)",
  reproducer: "var(--rep)",
  skeptic: "var(--skp)",
  scribe: "var(--scr)",
};
