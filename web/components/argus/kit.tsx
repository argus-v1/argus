"use client";

// Shared Argus pieces on top of shadcn/ui + motion. Status always shows a glyph and a word (never colour
// alone); role colours only identify roles. All motion settles under prefers-reduced-motion and ?static
// (the pre-paint script in app/layout.tsx adds `still` to <html>).

import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, CircleDot, Hand, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtDuration, ROLE_NAME, STATE_WORDS, type State } from "@/lib/derive";
import { STAGES, STAGE_ROLE, type Role, type Stage } from "@/lib/types";

export const ROLE_TEXT: Record<Role, string> = {
  orchestrator: "text-gold", triager: "text-tri", reproducer: "text-rep", skeptic: "text-skp", scribe: "text-scr",
};
export const ROLE_BG: Record<Role, string> = {
  orchestrator: "bg-gold", triager: "bg-tri", reproducer: "bg-rep", skeptic: "bg-skp", scribe: "bg-scr",
};

function useStill() {
  const reduce = useReducedMotion();
  const [still, setStill] = useState(false);
  useEffect(() => setStill(document.documentElement.classList.contains("still")), []);
  return reduce || still;
}

/** Fade-up on first view; children with `index` stagger. */
export function Reveal({ children, className, index = 0, as = "div" }: { children: React.ReactNode; className?: string; index?: number; as?: "div" | "section" | "li" }) {
  const still = useStill();
  const M = motion[as];
  if (still) return <M className={className}>{children}</M>;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </M>
  );
}

const STATE_STYLE: Record<State, { icon: React.ElementType; cls: string }> = {
  verified: { icon: CheckCircle2, cls: "text-ok border-ok/40" },
  "changes-needed": { icon: XCircle, cls: "text-bad border-bad/40" },
  "not-reproduced": { icon: XCircle, cls: "text-bad border-bad/40" },
  "needs-human": { icon: Hand, cls: "text-amb border-amb/40" },
  running: { icon: Loader2, cls: "text-foreground border-border" },
  stopped: { icon: CircleDot, cls: "text-muted-foreground border-border bg-muted" },
};

export function StateBadge({ state, size = "sm", className }: { state: State; size?: "sm" | "lg"; className?: string }) {
  const { icon: Icon, cls } = STATE_STYLE[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", size === "lg" && "px-3 py-1 text-sm", cls, className)}>
      <Icon className={cn(size === "lg" ? "size-4" : "size-3.5", state === "running" && "animate-spin motion-reduce:animate-none")} aria-hidden />
      {STATE_WORDS[state]}
    </Badge>
  );
}

export function RoleTag({ role, className }: { role: Role; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <i className={cn("size-1.5 rounded-full", ROLE_BG[role])} aria-hidden />
      <span className="text-muted-foreground">{ROLE_NAME[role]}</span>
    </span>
  );
}

/** The five stages, coloured by the role that owns each; the current one pulses while it runs. */
export function StageTracker({
  stage, status, durations = {}, attempt = 1, compact = false,
}: { stage: Stage; status: string; durations?: Partial<Record<Stage, number>>; attempt?: number; compact?: boolean }) {
  const still = useStill();
  const at = STAGES.indexOf(stage);
  return (
    <ol className={cn("grid grid-cols-5 gap-1.5", !compact && "gap-2")} aria-label={`Stage ${at + 1} of 5: ${stage}`}>
      {STAGES.map((s, i) => {
        const role = STAGE_ROLE[s];
        const done = status === "done" || i < at || (i === at && status !== "running");
        const now = i === at && status === "running";
        const skipped = s === "scoping" && attempt > 1 && durations[s] == null;
        return (
          <li key={s} className="min-w-0">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.i
                className={cn("absolute inset-y-0 left-0 rounded-full", now ? "bg-foreground/80" : "bg-foreground/35", skipped && "opacity-40")}
                initial={still ? false : { width: 0 }}
                animate={{ width: done || now ? "100%" : "0%" }}
                transition={{ duration: still ? 0 : 0.6, delay: still ? 0 : i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
              {now && !still && (
                <motion.i
                  className="absolute inset-y-0 w-1/3 bg-white/40"
                  animate={{ left: ["-35%", "105%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
            {!compact && (
              <div className="mt-2 space-y-0.5">
                <RoleTag role={role} />
                <div className="text-sm capitalize text-foreground">{s}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {durations[s] != null ? fmtDuration(durations[s]) : now ? "working…" : skipped ? "from attempt 1" : done ? "–" : "waiting"}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PageHeader({ eyebrow, title, accent, lede, children }: { eyebrow?: string; title: string; accent?: string; lede?: string; children?: React.ReactNode }) {
  return (
    <Reveal className="flex flex-col gap-6 border-b border-border pb-8 pt-28 md:flex-row md:items-end md:justify-between md:pt-32">
      <div className="max-w-3xl space-y-3">
        {eyebrow && <div className="font-mono text-xs uppercase tracking-[0.18em] text-gold">{eyebrow}</div>}
        <h1 className="font-serif text-4xl font-light leading-[1.05] tracking-tight text-balance md:text-5xl">
          {title} {accent && <em className="text-gold">{accent}</em>}
        </h1>
        {lede && <p className="max-w-2xl text-base text-pretty text-muted-foreground">{lede}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </Reveal>
  );
}

export function Hint({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">{children}</span></TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Quiet pass/fail: the glyph carries the colour; only a failure earns red text. */
export function Outcome({ outcome }: { outcome?: string }) {
  if (outcome === "passed") return <span className="inline-flex items-center gap-1 text-muted-foreground"><CheckCircle2 className="size-3.5 text-ok" aria-hidden />passed</span>;
  return <span className="inline-flex items-center gap-1 text-bad"><XCircle className="size-3.5" aria-hidden />{outcome ?? "failed"}</span>;
}
