import { Topbar } from '@/components/topbar';
import { LeftList } from '@/components/left-list';
import { WatchlistOverview } from '@/components/watchlist-overview';
import { RightPane } from '@/components/right-pane';
import { Leaderboard } from '@/components/leaderboard';
import {
  getMemberships,
  getOverallStats,
  getProduct,
  getProductsByWatchlist,
  getRecentRuns,
  getSnapshots,
  getWatchlists,
  getLatestRaw,
  getTrackers,
  getLeaderboard,
} from '@/lib/queries';
import { formatRelative } from '@/lib/format';
import { getLocale } from 'next-intl/server';
import type { LeaderboardRow, TrackerInfo } from '@/lib/types';

type Tab = 'trends' | 'snapshots' | 'raw' | 'memberships';

interface SearchParams {
  asin?: string;
  domain?: string;
  tab?: string;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const asin = sp.asin?.trim() || null;
  const domain = sp.domain?.trim() || null;
  const tab: Tab =
    sp.tab === 'snapshots' || sp.tab === 'raw' || sp.tab === 'memberships'
      ? sp.tab
      : 'trends';

  // Always-loaded data for the shell.
  const [stats, watchlists, products, runs, trackers] = await Promise.all([
    getOverallStats(),
    getWatchlists(),
    getProductsByWatchlist(),
    getRecentRuns(8),
    getTrackers(),
  ]);

  // For each tracker, fetch its leaderboard rows. Skipped when no detail view.
  const leaderboards: Array<{ tracker: TrackerInfo; rows: LeaderboardRow[] }> = [];
  if (!asin || !domain) {
    const boards = await Promise.all(
      trackers.map(async (t) => ({ tracker: t, rows: await getLeaderboard(t) })),
    );
    leaderboards.push(...boards);
  }

  // If a product is selected, load its detail data.
  let detail: Awaited<ReturnType<typeof loadDetail>> = null;
  if (asin && domain) {
    detail = await loadDetail(asin, domain);
  }

  const locale = await getLocale();
  const lastSnapLabel = stats.last_snapshot_at
    ? formatRelative(stats.last_snapshot_at, locale)
    : undefined;

  return (
    <div className="flex h-screen flex-col">
      <Topbar lastSnapshotLabel={lastSnapLabel} />
      <div className="flex flex-1 overflow-hidden">
        <LeftList
          products={products}
          selected={asin && domain ? { asin, domain } : null}
          totalProducts={stats.product_count}
        />
        {detail ? (
          <RightPane
            product={detail.product}
            snapshots={detail.snapshots}
            memberships={detail.memberships}
            raw={detail.raw}
            activeTab={tab}
          />
        ) : (
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {leaderboards.length > 0 && (
              <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6 pb-0">
                {leaderboards.map(({ tracker, rows }) => (
                  <Leaderboard
                    key={tracker.watchlist_id}
                    tracker={tracker}
                    rows={rows}
                  />
                ))}
              </div>
            )}
            <WatchlistOverview stats={stats} watchlists={watchlists} runs={runs} />
          </main>
        )}
      </div>
    </div>
  );
}

async function loadDetail(asin: string, domain: string) {
  const [product, snapshots, memberships, raw] = await Promise.all([
    getProduct(asin, domain),
    getSnapshots(asin, domain),
    getMemberships(asin, domain),
    getLatestRaw(asin, domain),
  ]);
  if (!product) return null;
  return { product, snapshots, memberships, raw };
}
