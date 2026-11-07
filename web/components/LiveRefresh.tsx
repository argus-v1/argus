"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Re-renders the page's server data when the event log changes (Supabase Realtime).
 * `investigationIds` narrows event changes to the ones this page shows; investigations are always watched.
 * Falls back to a slow poll while a run is in progress, in case the socket drops.
 */
export function LiveRefresh({ investigationIds, running = false }: { investigationIds?: string[]; running?: boolean }) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const [live, setLive] = useState(false);
  const ids = investigationIds?.join(",") ?? "";

  useEffect(() => {
    const refresh = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => router.refresh(), 400);
    };
    const sb = supabase();
    const ch = sb.channel(`live-${ids || "all"}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "investigations" }, refresh);
    const wanted = ids ? new Set(ids.split(",")) : null;
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => {
      const row = p.new as { investigation_id?: string };
      if (!wanted || (row.investigation_id && wanted.has(row.investigation_id))) refresh();
    });
    ch.subscribe((status) => setLive(status === "SUBSCRIBED"));
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer.current) window.clearTimeout(timer.current);
      sb.removeChannel(ch);
    };
  }, [ids, router]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(t);
  }, [running, router]);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground" role="status">
      <i className={`size-1.5 rounded-full ${live ? "bg-ok motion-safe:animate-pulse" : "bg-faint"}`} aria-hidden />
      {live ? "Live" : "Connecting"}
    </span>
  );
}
