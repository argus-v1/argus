import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Event, Investigation } from "./types";

// The anon key is public by design: row level security allows select only (see the T2 migration).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  client ??= createClient(URL, KEY, { auth: { persistSession: false } });
  return client;
}

export async function listInvestigations(repo?: string): Promise<Investigation[]> {
  let q = supabase().from("investigations").select("*").order("started_at", { ascending: false }).limit(500);
  if (repo) q = q.eq("repo", repo);
  const { data, error } = await q;
  if (error) throw new Error(`investigations: ${error.message}`);
  return (data ?? []) as Investigation[];
}

export async function getAttempts(repo: string, pr: number): Promise<Investigation[]> {
  const { data, error } = await supabase()
    .from("investigations")
    .select("*")
    .eq("repo", repo)
    .eq("pr_number", pr)
    .order("attempt", { ascending: true });
  if (error) throw new Error(`investigations: ${error.message}`);
  return (data ?? []) as Investigation[];
}

export async function getEvents(investigationIds: string[]): Promise<Event[]> {
  if (!investigationIds.length) return [];
  const out: Event[] = [];
  // PostgREST caps a page at 1000 rows; page through to be safe.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase()
      .from("events")
      .select("*")
      .in("investigation_id", investigationIds)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`events: ${error.message}`);
    out.push(...((data ?? []) as Event[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function countVerified(): Promise<number | null> {
  try {
    const { data, error } = await supabase().from("investigations").select("repo,pr_number").eq("verdict", "verified");
    if (error) return null;
    return new Set((data ?? []).map((r) => `${r.repo}#${r.pr_number}`)).size;
  } catch {
    return null;
  }
}
