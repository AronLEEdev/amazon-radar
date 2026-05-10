#!/usr/bin/env tsx
/**
 * snapshot.ts
 * Daily cron entry. Runs sync first (idempotent), then fetches a product
 * snapshot for every active (asin, amazon_domain) target across all watchlists.
 */
import { closePool } from '../src/db.js';
import {
  startRun,
  finishRun,
  loadActiveTargets,
  fetchProducts,
} from '../src/fetch.js';
import { syncWatchlists } from './sync-watchlists.js';

async function main(): Promise<number> {
  console.log('[1/3] sync watchlists');
  await syncWatchlists();

  console.log('[2/3] resolve targets');
  const topN = process.env.TOP_N ? Math.max(0, Number(process.env.TOP_N)) : undefined;
  const slug = process.env.SLUG ?? undefined;
  const targets = await loadActiveTargets({ topN, slug });
  const filterParts: string[] = [];
  if (slug) filterParts.push(`slug=${slug}`);
  if (topN) filterParts.push(`top ${topN}`);
  const filter = filterParts.length > 0 ? ` (${filterParts.join(', ')})` : '';
  console.log(`     ${targets.length} active target(s)${filter}`);
  if (targets.length === 0) {
    console.log('nothing to do');
    return 0;
  }

  console.log('[3/3] fetch products');
  const runId = await startRun('product');
  const counts = await fetchProducts(runId, targets);
  await finishRun(runId, {
    request_count: counts.request_count,
    asin_count: targets.length,
    success_count: counts.success_count,
    error_count: counts.error_count,
  });
  console.log(
    `done — ok=${counts.success_count} err=${counts.error_count} reqs=${counts.request_count}`,
  );
  // Non-zero only if every target failed
  return counts.success_count === 0 && counts.error_count > 0 ? 1 : 0;
}

main()
  .then((code) => closePool().then(() => process.exit(code)))
  .catch((err) => {
    console.error(err);
    closePool().finally(() => process.exit(1));
  });
