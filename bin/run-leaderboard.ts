#!/usr/bin/env tsx
/**
 * run-leaderboard.ts — Phase 2.5 daily entry point.
 *
 * Flow:
 *   1. Load watchlist YAML, validate `tracker:` block.
 *   2. (P1 idempotency) If a tracker_runs row already exists for today
 *      (in tracker.timezone), skip the search call. FORCE=1 bypasses.
 *   3. Run Rainforest type=search, persist to search_results with both `rank`
 *      (raw page position) and `organic_rank` (P4 sponsored-aware index).
 *      Sponsored hits are recorded too with organic_rank=null.
 *      NO product_watchlist_memberships writes (P2 separation).
 *   4. Compute today's leaderboard target set via search_results lookup,
 *      scoped on watchlist_id (P3 isolation), with cooldown & cap.
 *   5. (P1 idempotency) Drop targets that already have a snapshot for today
 *      (same business_day in tracker.timezone).
 *   6. Snapshot remaining via existing fetchProducts(); record fetch_run.
 *   7. Update tracker_runs with leaderboard digest + run ids + finished_at.
 *
 * Usage:
 *   npm run leaderboard                       # default: first watchlist with a tracker
 *   SLUG=pet-backpack npm run leaderboard
 *   FORCE=1 npm run leaderboard               # bypass per-day idempotency
 */
import { closePool, getPool } from '../src/db.js';
import { loadWatchlists } from '../src/watchlists.js';
import {
  fetchProducts,
  finishRun,
  startRun,
} from '../src/fetch.js';
import { searchProducts } from '../src/rainforest.js';
import { loadConfig } from '../src/config.js';
import {
  findWatchlistIdBySlug,
  getLeaderboardWithDelta,
  getTodaysTrackerRun,
  resolveLeaderboardTargets,
  targetsMissingTodaySnapshot,
  upsertTrackerRun,
} from '../src/leaderboard.js';
import { syncWatchlists } from './sync-watchlists.js';
import type { ParsedWatchlist, TrackerConfig } from '../src/types.js';

interface PersistedSearch {
  storedRows: number;
  organicCount: number;
}

async function persistSearchResults(
  runId: bigint,
  watchlistId: string,
  keyword: string,
  amazonDomain: string,
  hits: Awaited<ReturnType<typeof searchProducts>>['hits'],
  topNOrganic: number,
): Promise<PersistedSearch> {
  // We persist sponsored hits too (rank captured) for forensic value, but the
  // leaderboard uses only organic_rank; we cap insertion at topNOrganic organic
  // rows + their interleaved sponsored neighbours (we just store the head of
  // the SERP up to the topNOrganic-th organic hit).
  const headHits: typeof hits = [];
  let organicSeen = 0;
  for (const h of hits) {
    headHits.push(h);
    if (h.organic_rank !== null) {
      organicSeen += 1;
      if (organicSeen >= topNOrganic) break;
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  let stored = 0;
  let organic = 0;
  try {
    await client.query('begin');
    for (const h of headHits) {
      await client.query(
        `insert into search_results
          (run_id, watchlist_id, keyword, amazon_domain, rank, organic_rank, asin,
           sponsored, title, brand, price_amount, price_currency, rating,
           reviews_count, image_url, raw)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          runId.toString(),
          watchlistId,
          keyword,
          amazonDomain,
          h.rank,
          h.organic_rank,
          h.asin,
          h.sponsored,
          h.title,
          h.brand,
          h.price_amount,
          h.price_currency,
          h.rating,
          h.reviews_count,
          h.image_url,
          JSON.stringify(h),
        ],
      );
      stored += 1;
      if (h.organic_rank !== null) organic += 1;
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  return { storedRows: stored, organicCount: organic };
}

function pickWatchlist(slug: string | null): ParsedWatchlist {
  const all = loadWatchlists();
  const candidates = all.filter((w) => !!w.tracker);
  if (slug) {
    const hit = candidates.find((w) => w.slug === slug);
    if (!hit) {
      throw new Error(
        `no watchlist with slug=${slug} has a tracker: block; have ${candidates.map((c) => c.slug).join(', ') || '(none)'}`,
      );
    }
    return hit;
  }
  if (candidates.length === 0) {
    throw new Error('no watchlist has a tracker: block defined');
  }
  return candidates[0]!;
}

async function main(): Promise<number> {
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true';
  const slugFilter = process.env.SLUG ?? null;

  console.log('[1/5] sync watchlists');
  await syncWatchlists();

  const wl = pickWatchlist(slugFilter);
  const tracker = wl.tracker as TrackerConfig;
  const wlId = await findWatchlistIdBySlug(wl.slug);
  if (!wlId) throw new Error(`watchlist ${wl.slug} not in DB after sync`);
  const cfg = loadConfig();
  const amazonDomain = wl.amazon_domain ?? cfg.AMAZON_DOMAIN;
  const keyword = tracker.query!;

  console.log(
    `[2/5] resolve tracker — slug=${wl.slug} mode=${tracker.mode} query="${keyword}" tz=${tracker.timezone} top_n=${tracker.top_n} cooldown=${tracker.cooldown_days}d`,
  );

  // (P1) idempotency check
  const existing = await getTodaysTrackerRun(wlId, tracker);
  let searchSkipped = false;
  if (existing && !force) {
    console.log(
      `     today's tracker_run already exists (id=${existing.id}, business_day=${existing.business_day}). Skipping search. Use FORCE=1 to bypass.`,
    );
    searchSkipped = true;
  }

  let searchRunId: bigint | null = null;
  let storedRows = 0;
  let organicCount = 0;

  if (!searchSkipped) {
    console.log('[3/5] search');
    searchRunId = await startRun('search', `[leaderboard ${wl.slug}] "${keyword}"`);
    try {
      const result = await searchProducts(keyword, amazonDomain);
      const persisted = await persistSearchResults(
        searchRunId,
        wlId,
        keyword,
        amazonDomain,
        result.hits,
        tracker.top_n,
      );
      storedRows = persisted.storedRows;
      organicCount = persisted.organicCount;
      console.log(`     stored ${storedRows} rows (${organicCount} organic)`);
      await finishRun(searchRunId, {
        request_count: 1,
        asin_count: organicCount,
        success_count: 1,
        error_count: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('     search failed:', msg);
      await finishRun(searchRunId, {
        request_count: 1,
        asin_count: 0,
        success_count: 0,
        error_count: 1,
      });
      // Persist tracker_runs row with the failed search id so the idempotency
      // record exists; subsequent runs can retry only with FORCE=1.
      await upsertTrackerRun(wlId, tracker, {
        search_run_id: searchRunId.toString(),
        notes: `search failed: ${msg.slice(0, 200)}`,
        finished_at: new Date(),
      });
      return 1;
    }
  } else {
    console.log('[3/5] search — skipped');
  }

  // (P2) compute leaderboard targets from search_results, no membership writes
  console.log('[4/5] resolve leaderboard targets');
  const candidates = await resolveLeaderboardTargets(wlId, amazonDomain, tracker);
  console.log(`     ${candidates.length} candidate target(s) (top_n + cooldown)`);

  // (P1) drop ones already snapshotted today
  const todoTargets = await targetsMissingTodaySnapshot(candidates, tracker.timezone);
  const skipped = candidates.length - todoTargets.length;
  if (skipped > 0) {
    console.log(`     ${skipped} already snapshotted today — skipping`);
  }

  let productRunId: bigint | null = null;
  let okSnaps = 0;
  let errSnaps = 0;

  if (todoTargets.length > 0) {
    console.log(`[5/5] snapshot ${todoTargets.length} target(s)`);
    productRunId = await startRun('product', `[leaderboard ${wl.slug}] daily`);
    const counts = await fetchProducts(productRunId, todoTargets);
    okSnaps = counts.success_count;
    errSnaps = counts.error_count;
    await finishRun(productRunId, {
      request_count: counts.request_count,
      asin_count: todoTargets.length,
      success_count: counts.success_count,
      error_count: counts.error_count,
    });
  } else {
    console.log('[5/5] snapshot — nothing to do');
  }

  // Audit digest + finalise tracker_runs
  const board = await getLeaderboardWithDelta(wlId, amazonDomain, tracker);
  const digest = board
    .slice(0, tracker.top_n)
    .map((e) => {
      const d =
        e.delta === null
          ? e.today_rank === null
            ? '↓ off'
            : 'NEW'
          : e.delta > 0
            ? `▲${e.delta}`
            : e.delta < 0
              ? `▼${-e.delta}`
              : '·';
      return `${e.today_rank ?? '-'}.${e.asin}(${d})`;
    })
    .join(' ');

  await upsertTrackerRun(wlId, tracker, {
    search_run_id: searchRunId?.toString() ?? null,
    product_run_id: productRunId?.toString() ?? null,
    leaderboard_size: board.filter((e) => e.today_rank !== null).length,
    notes: digest.length > 0 ? digest : null,
    finished_at: new Date(),
  });

  const totalReqs = (searchSkipped ? 0 : 1) + okSnaps + errSnaps;
  console.log(
    `done — slug=${wl.slug} reqs=${totalReqs} snapshots=${okSnaps} err=${errSnaps} ${searchSkipped ? '(search skipped)' : ''}`,
  );
  return errSnaps > 0 && okSnaps === 0 && !searchSkipped ? 1 : 0;
}

main()
  .then((code) => closePool().then(() => process.exit(code)))
  .catch((err) => {
    console.error(err);
    closePool().finally(() => process.exit(1));
  });
