"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Evidence code: mono, quiet, one copy button. */
export function CodeBlock({ code, title, className, lang }: { code: string; title?: string; className?: string; lang?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <figure className={cn("overflow-hidden rounded-lg border border-border bg-muted/50", className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{title ?? lang ?? "code"}</span>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={copy} aria-label={done ? "Copied" : "Copy"}>
          {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
        </Button>
      </figcaption>
      <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[12.5px] leading-relaxed"><code>{code}</code></pre>
      <span role="status" className="sr-only">{done ? "Copied" : ""}</span>
    </figure>
  );
}
