import { Topbar } from '@/components/topbar';
import { LeftList } from '@/components/left-list';
import { WatchlistOverview } from '@/components/watchlist-overview';
import { RightPane } from '@/components/right-pane';
import {
  getMemberships,
  getOverallStats,
  getProduct,
  getProductsByWatchlist,
  getRecentRuns,
  getSnapshots,
  getWatchlists,
  getLatestRaw,
} from '@/lib/queries';
import { formatRelative } from '@/lib/format';
import { getLocale } from 'next-intl/server';

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
  const [stats, watchlists, products, runs] = await Promise.all([
    getOverallStats(),
    getWatchlists(),
    getProductsByWatchlist(),
    getRecentRuns(8),
  ]);

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
