import { getPool } from './db.js';
import { getProduct, RainforestError, type ProductResult } from './rainforest.js';
import type { FetchSource, ProductTarget } from './types.js';
import { loadConfig } from './config.js';

export interface RunRow {
  id: string;
}

export async function startRun(source: FetchSource, notes?: string): Promise<bigint> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into fetch_runs (source, notes) values ($1, $2) returning id`,
    [source, notes ?? null],
  );
  return BigInt(rows[0]!.id);
}

export async function finishRun(
  runId: bigint,
  counts: { request_count: number; asin_count: number; success_count: number; error_count: number },
): Promise<void> {
  await getPool().query(
    `update fetch_runs
       set finished_at = now(),
           request_count = $2,
           asin_count = $3,
           success_count = $4,
           error_count = $5
     where id = $1`,
    [
      runId.toString(),
      counts.request_count,
      counts.asin_count,
      counts.success_count,
      counts.error_count,
    ],
  );
}

async function logError(
  runId: bigint,
  target: ProductTarget,
  err: unknown,
): Promise<void> {
  const status = err instanceof RainforestError ? err.status ?? null : null;
  const message =
    err instanceof Error ? err.message : `unknown: ${String(err)}`;
  await getPool().query(
    `insert into fetch_errors (run_id, asin, amazon_domain, http_status, message)
     values ($1, $2, $3, $4, $5)`,
    [runId.toString(), target.asin, target.amazon_domain, status, message],
  );
}

async function persistProduct(result: ProductResult): Promise<void> {
  const { target, core, snapshot, raw } = result;
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into products (asin, amazon_domain, title, brand, main_category)
       values ($1, $2, $3, $4, $5)
       on conflict (asin, amazon_domain) do update
         set title = coalesce(excluded.title, products.title),
             brand = coalesce(excluded.brand, products.brand),
             main_category = coalesce(excluded.main_category, products.main_category),
             last_seen_at = now()`,
      [
        target.asin,
        target.amazon_domain,
        core.title,
        core.brand,
        core.main_category,
      ],
    );
    await client.query(
      `insert into product_snapshots
        (asin, amazon_domain, price_amount, price_currency, rating,
         reviews_count, bsr_rank, bsr_category, buybox_seller, in_stock, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        target.asin,
        target.amazon_domain,
        snapshot.price_amount,
        snapshot.price_currency,
        snapshot.rating,
        snapshot.reviews_count,
        snapshot.bsr_rank,
        snapshot.bsr_category,
        snapshot.buybox_seller,
        snapshot.in_stock,
        JSON.stringify(raw),
      ],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export interface LoadTargetsOpts {
  /** When set (>0), keep only the top N targets after ordering. */
  topN?: number;
  /** Filter to a single watchlist slug. */
  slug?: string;
}

/**
 * Returns the distinct (asin, amazon_domain) targets currently active across all
 * watchlists.
 *
 * Ordering when `topN` is in play prioritises:
 *   1. ASINs never snapshotted yet — gives discovered ASINs their first datapoint
 *      so they don't get starved out by the limit.
 *   2. Manual entries before discovered (keyword_search / category_rank).
 *   3. Highest review_count (proxy for incumbents worth tracking).
 *   4. Stable tie-breaker on asin to make runs reproducible.
 */
export async function loadActiveTargets(opts: LoadTargetsOpts = {}): Promise<ProductTarget[]> {
  const { topN, slug } = opts;
  const params: unknown[] = [];
  let where = `m.removed_at is null`;
  if (slug) {
    params.push(slug);
    where += ` and w.slug = $${params.length}`;
  }
  let limitClause = '';
  if (topN && topN > 0) {
    params.push(topN);
    limitClause = `limit $${params.length}`;
  }
  const { rows } = await getPool().query<{ asin: string; amazon_domain: string }>(
    `with latest as (
       select distinct on (asin, amazon_domain) asin, amazon_domain,
              reviews_count, captured_at
         from product_snapshots
        order by asin, amazon_domain, captured_at desc
     ),
     active as (
       select m.asin, m.amazon_domain,
              bool_or(m.source_type = 'manual_asin') as is_manual
         from product_watchlist_memberships m
         join watchlists w on w.id = m.watchlist_id
        where ${where}
        group by m.asin, m.amazon_domain
     )
     select a.asin, a.amazon_domain
       from active a
       left join latest l on l.asin = a.asin and l.amazon_domain = a.amazon_domain
      order by (l.captured_at is null) desc,
               a.is_manual desc,
               l.reviews_count desc nulls last,
               a.asin
      ${limitClause}`,
    params,
  );
  return rows.map((r) => ({ asin: r.asin, amazon_domain: r.amazon_domain }));
}

/** Run product fetch over `targets`, write snapshots, log errors. Returns counts. */
export async function fetchProducts(
  runId: bigint,
  targets: ProductTarget[],
): Promise<{ request_count: number; success_count: number; error_count: number }> {
  const cfg = loadConfig();
  const concurrency = cfg.FETCH_CONCURRENCY;
  let success = 0;
  let errors = 0;
  let requests = 0;

  const queue = [...targets];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const target = queue.shift();
      if (!target) return;
      requests += 1;
      try {
        const result = await getProduct(target);
        await persistProduct(result);
        success += 1;
        console.log(`  ok   ${target.asin} @ ${target.amazon_domain}`);
      } catch (err) {
        errors += 1;
        await logError(runId, target, err).catch((e) =>
          console.error('  failed to write fetch_errors row:', e),
        );
        console.error(
          `  err  ${target.asin} @ ${target.amazon_domain}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { request_count: requests, success_count: success, error_count: errors };
}
