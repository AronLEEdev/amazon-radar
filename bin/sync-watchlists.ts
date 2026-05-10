#!/usr/bin/env tsx
/**
 * sync-watchlists.ts
 * Reconcile watchlists/*.yml into the DB:
 *   - upsert watchlists by slug
 *   - insert manual_asin memberships for new YAML entries
 *   - soft-remove (removed_at=now()) manual_asin memberships missing from YAML
 *   - keyword_search / category_rank memberships are NOT touched here
 */
import { getPool, closePool } from '../src/db.js';
import { loadWatchlists } from '../src/watchlists.js';
import { startRun, finishRun } from '../src/fetch.js';

interface SyncStats {
  watchlistAdded: number;
  watchlistUpdated: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  membershipsUnchanged: number;
}

export async function syncWatchlists(): Promise<SyncStats> {
  const pool = getPool();
  const runId = await startRun('sync', 'watchlist YAML reconcile');
  const stats: SyncStats = {
    watchlistAdded: 0,
    watchlistUpdated: 0,
    membershipsAdded: 0,
    membershipsRemoved: 0,
    membershipsUnchanged: 0,
  };

  try {
    const files = loadWatchlists();
    if (files.length === 0) {
      console.log('No watchlist files found in watchlists/');
    }

    // Soft-remove memberships of watchlists whose YAML file no longer exists.
    // The watchlist row itself is left in place (analytics may still reference it).
    const yamlSlugs = files.map((f) => f.slug);
    const orphan = await pool.query<{ slug: string; removed: string }>(
      `with affected as (
         update product_watchlist_memberships m
            set removed_at = now()
           from watchlists w
          where m.watchlist_id = w.id
            and m.removed_at is null
            and ($1::text[] is null or not (w.slug = any($1::text[])))
            ${yamlSlugs.length === 0 ? '' : ''}
         returning w.slug, m.id
       )
       select slug, count(*)::text as removed from affected group by slug`,
      [yamlSlugs.length > 0 ? yamlSlugs : null],
    );
    for (const row of orphan.rows) {
      stats.membershipsRemoved += Number(row.removed);
      console.log(`  orphan ${row.slug}: -${row.removed} memberships (YAML missing)`);
    }

    for (const wl of files) {
      const client = await pool.connect();
      try {
        await client.query('begin');

        // Upsert watchlist
        const { rows: wlRows } = await client.query<{
          id: string;
          xmax_was_zero: boolean;
        }>(
          `insert into watchlists (slug, name, description, amazon_domain)
           values ($1,$2,$3,$4)
           on conflict (slug) do update
             set name = excluded.name,
                 description = excluded.description,
                 amazon_domain = excluded.amazon_domain,
                 updated_at = now()
           returning id, (xmax = 0) as xmax_was_zero`,
          [wl.slug, wl.name, wl.description ?? null, wl.amazon_domain ?? null],
        );
        const wlId = wlRows[0]!.id;
        if (wlRows[0]!.xmax_was_zero) stats.watchlistAdded += 1;
        else stats.watchlistUpdated += 1;

        // Existing active manual memberships for this watchlist
        const { rows: existing } = await client.query<{
          id: string;
          asin: string;
          amazon_domain: string;
        }>(
          `select id, asin, amazon_domain
             from product_watchlist_memberships
            where watchlist_id = $1
              and source_type = 'manual_asin'
              and removed_at is null`,
          [wlId],
        );

        const existingByKey = new Map<string, { id: string }>();
        for (const r of existing) {
          existingByKey.set(`${r.asin}|${r.amazon_domain}`, { id: r.id });
        }

        const yamlKeys = new Set<string>();

        // Insert / re-activate memberships for current YAML entries
        for (const target of wl.asins) {
          const key = `${target.asin}|${target.amazon_domain}`;
          yamlKeys.add(key);
          if (existingByKey.has(key)) {
            stats.membershipsUnchanged += 1;
            continue;
          }
          // Use ON CONFLICT against the partial-style unique index — emulate via
          // upsert that re-activates a soft-removed row if present.
          const upsert = await client.query(
            `insert into product_watchlist_memberships
              (watchlist_id, asin, amazon_domain, source_type, source_value)
             values ($1, $2, $3, 'manual_asin', null)
             on conflict (watchlist_id, asin, amazon_domain, source_type, coalesce(source_value, ''))
               do update set removed_at = null,
                             added_at   = now()
             returning (xmax = 0) as inserted`,
            [wlId, target.asin, target.amazon_domain],
          );
          const inserted = (upsert.rows[0] as { inserted: boolean }).inserted;
          stats.membershipsAdded += inserted ? 1 : 0;
          if (!inserted) stats.membershipsUnchanged += 1;
        }

        // Soft-remove manual memberships missing from YAML
        for (const [key, row] of existingByKey) {
          if (yamlKeys.has(key)) continue;
          await client.query(
            `update product_watchlist_memberships
                set removed_at = now()
              where id = $1`,
            [row.id],
          );
          stats.membershipsRemoved += 1;
        }

        await client.query('commit');
        console.log(
          `  ${wl.slug}: ${wl.asins.length} active ASIN(s), ` +
            `+${stats.membershipsAdded} -${stats.membershipsRemoved}`,
        );
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    }

    await finishRun(runId, {
      request_count: 0,
      asin_count: stats.membershipsAdded + stats.membershipsUnchanged,
      success_count: stats.membershipsAdded + stats.membershipsUnchanged,
      error_count: 0,
    });
    return stats;
  } catch (err) {
    await finishRun(runId, {
      request_count: 0,
      asin_count: 0,
      success_count: 0,
      error_count: 1,
    }).catch(() => {});
    throw err;
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  syncWatchlists()
    .then((stats) => {
      console.log('sync done', stats);
      return closePool();
    })
    .catch((err) => {
      console.error(err);
      closePool().finally(() => process.exit(1));
    });
}
