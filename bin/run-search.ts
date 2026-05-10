#!/usr/bin/env tsx
/**
 * run-search.ts — Phase 2 keyword discovery.
 *
 * For every watchlist with `keywords:` defined in YAML, call Rainforest
 * type=search and persist the top N organic hits into:
 *   - search_results               (one row per (run, keyword, rank))
 *   - product_watchlist_memberships (source_type='keyword_search',
 *                                    source_value=<keyword>)
 *
 * Newly-discovered ASINs are NOT product-snapshotted in this run — the next
 * `npm run snapshot` picks them up via product_watchlist_memberships.
 *
 * Usage:
 *   npx tsx bin/run-search.ts                  # all watchlists, top 10
 *   TOP_N=20 npx tsx bin/run-search.ts         # top 20 per keyword
 *   SLUG=pet-backpack npx tsx bin/run-search.ts  # single watchlist
 */
import { getPool, closePool } from '../src/db.js';
import { loadWatchlists } from '../src/watchlists.js';
import { startRun, finishRun } from '../src/fetch.js';
import { searchProducts, RainforestError } from '../src/rainforest.js';
import { syncWatchlists } from './sync-watchlists.js';

const DEFAULT_TOP_N = 10;
const INCLUDE_SPONSORED = false;

async function getWatchlistIdBySlug(slug: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    `select id::text from watchlists where slug = $1`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

async function persistSearch(
  runId: bigint,
  watchlistId: string,
  keyword: string,
  amazonDomain: string,
  result: Awaited<ReturnType<typeof searchProducts>>,
  topN: number,
): Promise<{ stored: number; memberships: number }> {
  const pool = getPool();
  const client = await pool.connect();
  let stored = 0;
  let memberships = 0;
  try {
    await client.query('begin');
    const filtered = result.hits
      .filter((h) => INCLUDE_SPONSORED || !h.sponsored)
      .slice(0, topN);
    for (const h of filtered) {
      await client.query(
        `insert into search_results
          (run_id, watchlist_id, keyword, amazon_domain, rank, asin, sponsored,
           title, brand, price_amount, price_currency, rating, reviews_count,
           image_url, raw)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          runId.toString(),
          watchlistId,
          keyword,
          amazonDomain,
          h.rank,
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
      const upsert = await client.query<{ inserted: boolean }>(
        `insert into product_watchlist_memberships
          (watchlist_id, asin, amazon_domain, source_type, source_value, discovered_run_id)
         values ($1,$2,$3,'keyword_search',$4,$5)
         on conflict (watchlist_id, asin, amazon_domain, source_type, coalesce(source_value, ''))
           do update set removed_at = null
         returning (xmax = 0) as inserted`,
        [watchlistId, h.asin, amazonDomain, keyword, runId.toString()],
      );
      if (upsert.rows[0]?.inserted) memberships += 1;
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  return { stored, memberships };
}

async function main(): Promise<number> {
  const topN = Number(process.env.TOP_N ?? DEFAULT_TOP_N);
  const slugFilter = process.env.SLUG ?? null;

  console.log('[1/2] sync watchlists');
  await syncWatchlists();

  const allWatchlists = loadWatchlists();
  const target = slugFilter
    ? allWatchlists.filter((w) => w.slug === slugFilter)
    : allWatchlists;
  if (target.length === 0) {
    console.log(slugFilter ? `no watchlist with slug=${slugFilter}` : 'no watchlists');
    return 0;
  }

  console.log(`[2/2] keyword search across ${target.length} watchlist(s)`);
  const runId = await startRun(
    'search',
    `top ${topN}` + (slugFilter ? ` slug=${slugFilter}` : ''),
  );

  let requests = 0;
  let successes = 0;
  let errors = 0;
  let totalAsins = 0;
  let totalStored = 0;
  let totalNewMemberships = 0;

  for (const wl of target) {
    if (wl.keywords.length === 0) {
      console.log(`  ${wl.slug}: no keywords, skip`);
      continue;
    }
    const wlId = await getWatchlistIdBySlug(wl.slug);
    if (!wlId) {
      console.log(`  ${wl.slug}: not in DB, skip`);
      continue;
    }
    const domain = wl.amazon_domain ?? 'amazon.com';
    for (const kw of wl.keywords) {
      requests += 1;
      try {
        const result = await searchProducts(kw, domain);
        const { stored, memberships } = await persistSearch(
          runId,
          wlId,
          kw,
          domain,
          result,
          topN,
        );
        successes += 1;
        totalAsins += result.hits.length;
        totalStored += stored;
        totalNewMemberships += memberships;
        console.log(
          `  ok   ${wl.slug} · "${kw}" · ${stored} stored · +${memberships} new memberships`,
        );
      } catch (err) {
        errors += 1;
        const status = err instanceof RainforestError ? err.status ?? null : null;
        const msg = err instanceof Error ? err.message : String(err);
        await getPool()
          .query(
            `insert into fetch_errors (run_id, asin, amazon_domain, http_status, message)
             values ($1, null, $2, $3, $4)`,
            [runId.toString(), domain, status, `[search "${kw}"] ${msg}`],
          )
          .catch(() => {});
        console.error(`  err  ${wl.slug} · "${kw}": ${msg}`);
      }
    }
  }

  await finishRun(runId, {
    request_count: requests,
    asin_count: totalAsins,
    success_count: successes,
    error_count: errors,
  });
  console.log(
    `done — keywords=${requests} stored=${totalStored} new_memberships=${totalNewMemberships} err=${errors}`,
  );
  return errors > 0 && successes === 0 ? 1 : 0;
}

main()
  .then((code) => closePool().then(() => process.exit(code)))
  .catch((err) => {
    console.error(err);
    closePool().finally(() => process.exit(1));
  });
