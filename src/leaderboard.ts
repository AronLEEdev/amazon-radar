import { getPool } from './db.js';
import {
  type ProductTarget,
  type TrackerConfig,
  trackerIdentity,
} from './types.js';

/**
 * Phase-2.5 leaderboard tracker helpers. All "today / yesterday / cooldown"
 * arithmetic uses the tracker's timezone via the `business_day(ts, tz)` SQL
 * function, never the OS clock — see migration 003 for the helper.
 */

export interface TrackerRunRow {
  id: string;
  watchlist_id: string;
  business_day: string; // ISO date (YYYY-MM-DD)
  search_run_id: string | null;
  product_run_id: string | null;
}

export async function findWatchlistIdBySlug(slug: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    `select id::text from watchlists where slug = $1`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

/**
 * Returns the tracker_runs row for today (if any) for this watchlist+tracker.
 * Used to skip duplicate work when called multiple times within a business day.
 */
export async function getTodaysTrackerRun(
  watchlistId: string,
  tracker: TrackerConfig,
): Promise<TrackerRunRow | null> {
  const identity = trackerIdentity(watchlistId, tracker);
  const { rows } = await getPool().query<TrackerRunRow>(
    `select id::text, watchlist_id::text, business_day::text,
            search_run_id::text, product_run_id::text
       from tracker_runs
      where watchlist_id = $1
        and tracker_identity = $2
        and business_day = business_day(now(), $3)`,
    [watchlistId, identity, tracker.timezone],
  );
  return rows[0] ?? null;
}

/**
 * Insert (or update) the tracker_runs row for today. Returns the row id.
 * Idempotent — the unique constraint covers (watchlist, tracker, business_day).
 */
export async function upsertTrackerRun(
  watchlistId: string,
  tracker: TrackerConfig,
  patch: {
    search_run_id?: string | null;
    product_run_id?: string | null;
    leaderboard_size?: number | null;
    notes?: string | null;
    finished_at?: Date | null;
  } = {},
): Promise<TrackerRunRow> {
  const identity = trackerIdentity(watchlistId, tracker);
  const { rows } = await getPool().query<TrackerRunRow>(
    `insert into tracker_runs
      (watchlist_id, tracker_identity, business_day, timezone,
       search_run_id, product_run_id, leaderboard_size, notes, finished_at)
     values ($1, $2, business_day(now(), $3), $3, $4, $5, $6, $7, $8)
     on conflict (watchlist_id, tracker_identity, business_day) do update
       set search_run_id    = coalesce($4, tracker_runs.search_run_id),
           product_run_id   = coalesce($5, tracker_runs.product_run_id),
           leaderboard_size = coalesce($6, tracker_runs.leaderboard_size),
           notes            = coalesce($7, tracker_runs.notes),
           finished_at      = coalesce($8, tracker_runs.finished_at)
     returning id::text, watchlist_id::text, business_day::text,
               search_run_id::text, product_run_id::text`,
    [
      watchlistId,
      identity,
      tracker.timezone,
      patch.search_run_id ?? null,
      patch.product_run_id ?? null,
      patch.leaderboard_size ?? null,
      patch.notes ?? null,
      patch.finished_at ?? null,
    ],
  );
  return rows[0]!;
}

/**
 * Compute the active leaderboard target set for today.
 *
 * Active set = (today's organic top-N for this tracker)
 *            ∪ (any ASIN whose latest organic_rank within `cooldown_days`
 *               for this tracker was ≤ top_n).
 *
 * Returned ordered: today's leaderboard first by organic_rank, then cooldown
 * ASINs by most-recent organic rank. Capped at `max_targets_per_day`.
 *
 * IMPORTANT: this query is scoped on `watchlist_id` (P3 cooldown isolation)
 * and uses `organic_rank` (P4) and `business_day(captured_at, tz)` (P5).
 */
export async function resolveLeaderboardTargets(
  watchlistId: string,
  amazonDomain: string,
  tracker: TrackerConfig,
): Promise<ProductTarget[]> {
  if (tracker.mode !== 'search') {
    throw new Error(`leaderboard mode=${tracker.mode} not implemented`);
  }
  const { top_n, cooldown_days, max_targets_per_day, timezone } = tracker;
  const keyword = tracker.query!;
  const { rows } = await getPool().query<{
    asin: string;
    is_today: boolean;
    today_rank: number | null;
    last_rank: number | null;
    last_seen: Date;
  }>(
    `with bounds as (
       select business_day(now(), $5) as today,
              business_day(now(), $5) - ($4::int) as floor
     ),
     scoped as (
       select sr.asin, sr.organic_rank, sr.captured_at,
              business_day(sr.captured_at, $5) as bd
         from search_results sr
         join bounds b on true
        where sr.watchlist_id = $1
          and sr.amazon_domain = $2
          and sr.keyword = $3
          and sr.organic_rank is not null
          and sr.organic_rank <= $6
          and business_day(sr.captured_at, $5) >= b.floor
     ),
     today as (
       select asin, organic_rank as today_rank
         from scoped, bounds
        where scoped.bd = bounds.today
     ),
     last_seen as (
       select distinct on (asin)
              asin, organic_rank as last_rank, captured_at as last_seen
         from scoped
        order by asin, captured_at desc
     )
     select ls.asin,
            (t.asin is not null) as is_today,
            t.today_rank,
            ls.last_rank,
            ls.last_seen
       from last_seen ls
       left join today t using (asin)
      order by (t.asin is not null) desc,
               t.today_rank asc nulls last,
               ls.last_seen desc
      limit $7`,
    [
      watchlistId,
      amazonDomain,
      keyword,
      cooldown_days,
      timezone,
      top_n,
      max_targets_per_day,
    ],
  );
  return rows.map((r) => ({ asin: r.asin, amazon_domain: amazonDomain }));
}

/**
 * Of the given targets, return only those that DO NOT yet have a
 * product_snapshots row whose business day equals today (per the tracker's
 * timezone). Used so a partial re-run picks up where it left off without
 * re-billing.
 */
export async function targetsMissingTodaySnapshot(
  targets: ProductTarget[],
  timezone: string,
): Promise<ProductTarget[]> {
  if (targets.length === 0) return [];
  const asins = targets.map((t) => t.asin);
  const domains = targets.map((t) => t.amazon_domain);
  const { rows } = await getPool().query<{ asin: string; amazon_domain: string }>(
    `with want as (
       select unnest($1::text[]) as asin, unnest($2::text[]) as amazon_domain
     ),
     have as (
       select asin, amazon_domain
         from product_snapshots
        where business_day(captured_at, $3) = business_day(now(), $3)
          and asin = any($1::text[])
          and amazon_domain = any($2::text[])
     )
     select w.asin, w.amazon_domain
       from want w
       left join have h using (asin, amazon_domain)
      where h.asin is null`,
    [asins, domains, timezone],
  );
  return rows.map((r) => ({ asin: r.asin, amazon_domain: r.amazon_domain }));
}

/**
 * Today's leaderboard with rank deltas vs yesterday. Pure read query — used by
 * both the orchestrator (for `notes` digest) and by the web UI.
 */
export interface LeaderboardEntry {
  asin: string;
  today_rank: number | null;
  yesterday_rank: number | null;
  delta: number | null; // positive = improved (smaller rank), null = new or unknown
}

export async function getLeaderboardWithDelta(
  watchlistId: string,
  amazonDomain: string,
  tracker: TrackerConfig,
): Promise<LeaderboardEntry[]> {
  if (tracker.mode !== 'search') return [];
  const { rows } = await getPool().query<{
    asin: string;
    today_rank: number | null;
    yesterday_rank: number | null;
  }>(
    `with t as (
       select asin, organic_rank as today_rank
         from search_results
        where watchlist_id = $1
          and amazon_domain = $2
          and keyword = $3
          and organic_rank is not null
          and business_day(captured_at, $4) = business_day(now(), $4)
     ),
     y as (
       select asin, organic_rank as yesterday_rank
         from search_results
        where watchlist_id = $1
          and amazon_domain = $2
          and keyword = $3
          and organic_rank is not null
          and business_day(captured_at, $4) = business_day(now(), $4) - 1
     )
     select coalesce(t.asin, y.asin) as asin,
            t.today_rank, y.yesterday_rank
       from t
       full outer join y using (asin)
      order by t.today_rank asc nulls last, y.yesterday_rank asc nulls last`,
    [watchlistId, amazonDomain, tracker.query!, tracker.timezone],
  );
  return rows.map((r) => ({
    asin: r.asin,
    today_rank: r.today_rank,
    yesterday_rank: r.yesterday_rank,
    delta:
      r.today_rank !== null && r.yesterday_rank !== null
        ? r.yesterday_rank - r.today_rank // +ve = climbed (smaller rank today)
        : null,
  }));
}
