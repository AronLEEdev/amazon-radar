-- 003_leaderboard.sql — Phase 2.5 leaderboard tracker
-- Adds:
--   * organic_rank column to search_results (P4: organic vs raw page rank)
--   * business_day(ts, tz) helper function (P5: explicit timezone)
--   * tracker_runs table — idempotency anchor keyed on (watchlist, tracker, business_day) (P1)

-- ─── (P4) organic rank ────────────────────────────────────────────────────
alter table search_results
  add column if not exists organic_rank integer;

-- Backfill: existing rows already have sponsored filtered out before insert,
-- so the stored `rank` is effectively the organic rank (best-effort).
update search_results
   set organic_rank = rank
 where organic_rank is null;

create index if not exists search_results_organic
  on search_results (watchlist_id, keyword, amazon_domain, organic_rank, captured_at desc);

-- ─── (P5) business day helper ─────────────────────────────────────────────
-- Convert any timestamptz to a date in the tracker's timezone. Single source
-- of truth — every "today / yesterday / cooldown" comparison must use it.
create or replace function business_day(ts timestamptz, tz text)
  returns date
  language sql
  immutable
  parallel safe
as $$
  select (ts at time zone tz)::date
$$;

-- ─── (P1) tracker_runs: idempotency anchor ────────────────────────────────
create table if not exists tracker_runs (
  id                bigserial primary key,
  watchlist_id      bigint not null references watchlists(id) on delete cascade,
  tracker_identity  text   not null,                  -- "<watchlist_id>:<mode>:<query|category_id>"
  business_day      date   not null,
  timezone          text   not null,
  search_run_id     bigint references fetch_runs(id) on delete set null,
  product_run_id    bigint references fetch_runs(id) on delete set null,
  leaderboard_size  integer,
  notes             text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  unique (watchlist_id, tracker_identity, business_day)
);
create index if not exists tracker_runs_lookup
  on tracker_runs (watchlist_id, tracker_identity, business_day desc);
