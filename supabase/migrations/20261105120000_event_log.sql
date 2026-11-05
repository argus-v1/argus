-- Argus event log (T2).
-- One log feeds the website, the evals, and the GitHub comments.
-- Writes come only from the orchestrator using the service key (bypasses RLS).
-- The public website reads with the anon key: select only.

-- One row per verification run. Adding the `argus` label starts attempt 1;
-- each new push to a labelled PR starts the next attempt (T15).
create table public.investigations (
  id                uuid primary key default gen_random_uuid(),
  repo              text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),  -- owner/name
  pr_number         integer not null check (pr_number > 0),
  attempt           integer not null default 1 check (attempt > 0),
  pr_title          text,
  pr_url            text,
  contributor       text,                       -- GitHub login of the PR author
  base_sha          text,
  head_sha          text,
  trigger           text not null check (trigger in ('label', 'push')),
  stage             text not null default 'scoping'
                    check (stage in ('scoping', 'reproducing', 'challenging', 'reporting', 'verdict')),
  status            text not null default 'running'
                    check (status in ('running', 'done', 'error')),
  verdict           text check (verdict in ('verified', 'changes-needed', 'not-reproduced', 'needs-human')),
  reproducer_model  text,                       -- denormalised for the evals model-pair matrix
  skeptic_model     text,
  comment_url       text,                       -- the Scribe comment on GitHub
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  updated_at        timestamptz not null default now(),
  unique (repo, pr_number, attempt),
  check (verdict is null or stage = 'verdict'),
  check (finished_at is null or finished_at >= started_at)
);

create index investigations_started_at_idx on public.investigations (started_at desc);
create index investigations_repo_pr_idx    on public.investigations (repo, pr_number);

-- Every step of a run: stage banners, agent messages, test runs, GitHub writes.
create table public.events (
  id                bigint generated always as identity primary key,  -- also the display order
  investigation_id  uuid not null references public.investigations (id) on delete cascade,
  stage             text not null
                    check (stage in ('scoping', 'reproducing', 'challenging', 'reporting', 'verdict')),
  role              text not null
                    check (role in ('orchestrator', 'triager', 'reproducer', 'skeptic', 'scribe')),
  kind              text not null default 'message'
                    check (kind in ('banner', 'message', 'test_run', 'label', 'comment', 'error')),
  model             text,                       -- null for the orchestrator
  message           text not null,
  artifact_path     text,                       -- relative to shared/evidence/pr-<n>/
  data              jsonb not null default '{}'::jsonb,  -- e.g. {"command": ..., "outcome": "failed", "ref": "main"}
  started_at        timestamptz,
  duration_ms       integer check (duration_ms is null or duration_ms >= 0),
  created_at        timestamptz not null default now(),
  check (role = 'orchestrator' or kind <> 'banner'),
  check (artifact_path is null or (artifact_path !~ '(^/|\.\.)'))  -- no absolute paths or ../
);

create index events_investigation_idx on public.events (investigation_id, id);

-- Keep investigations.updated_at current.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger investigations_touch_updated_at
  before update on public.investigations
  for each row execute function public.touch_updated_at();

-- Public, read-only access for the website.
alter table public.investigations enable row level security;
alter table public.events         enable row level security;

revoke all on public.investigations, public.events from anon, authenticated;
grant select on public.investigations, public.events to anon, authenticated;

create policy "public read" on public.investigations for select to anon, authenticated using (true);
create policy "public read" on public.events         for select to anon, authenticated using (true);

-- Live timeline on the website (Supabase Realtime). Skipped where the publication doesn't exist.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.investigations, public.events;
  end if;
end $$;
