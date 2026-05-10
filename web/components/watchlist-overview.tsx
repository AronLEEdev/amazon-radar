import { useTranslations, useLocale } from 'next-intl';
import { Layers, Database, Globe, AlertTriangle } from 'lucide-react';
import type { OverallStats, WatchlistRow, RunRow } from '@/lib/types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { formatCompact, formatPrice, formatRating, formatRelative } from '@/lib/format';

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </div>
        {icon ? <div className="text-zinc-300">{icon}</div> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular tracking-tight text-zinc-900">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div> : null}
    </Card>
  );
}

function WatchlistCard({ w }: { w: WatchlistRow }) {
  const t = useTranslations('watchlistCard');
  const tShell = useTranslations('shell');
  const locale = useLocale();

  const priceBand =
    w.median_price !== null
      ? `~${formatPrice(w.median_price, 'USD')}`
      : '—';
  const bsrBand =
    w.min_bsr !== null && w.max_bsr !== null
      ? `${formatCompact(w.min_bsr)}–${formatCompact(w.max_bsr)}`
      : '—';
  const last =
    w.last_snapshot_at ? formatRelative(w.last_snapshot_at, locale) : tShell('neverSnapshotted');

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div>
          <div className="text-sm font-semibold tracking-tight">{w.name}</div>
          {w.description ? (
            <div className="mt-0.5 text-xs text-zinc-500">{w.description}</div>
          ) : null}
        </div>
        <Badge variant="primary">{t('products', { count: w.product_count })}</Badge>
      </div>
      <div className="grid grid-cols-3 border-t border-zinc-100 text-xs">
        <div className="border-r border-zinc-100 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            {t('priceRange')}
          </div>
          <div className="mt-1 font-semibold tabular text-zinc-900">{priceBand}</div>
        </div>
        <div className="border-r border-zinc-100 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            {t('avgRating')}
          </div>
          <div className="mt-1 font-semibold tabular text-zinc-900">
            {formatRating(w.avg_rating)}
            <span className="ml-0.5 text-amber-500">★</span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            {t('bsrRange')}
          </div>
          <div className="mt-1 font-semibold tabular text-zinc-900">{bsrBand}</div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[11px] text-zinc-500">
        <span>{tShell('lastSnapshot')}: {last}</span>
        {w.amazon_domain ? <span className="text-zinc-400">{w.amazon_domain}</span> : null}
      </div>
    </Card>
  );
}

function RunRowItem({ run }: { run: RunRow }) {
  const t = useTranslations('runs');
  const locale = useLocale();
  const total = run.asin_count;
  const ok = run.success_count;
  const err = run.error_count;
  const variant: 'success' | 'danger' | 'muted' =
    err > 0 ? 'danger' : ok > 0 ? 'success' : 'muted';
  return (
    <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs last:border-b-0">
      <Badge variant="outline" className="min-w-[64px] justify-center">
        {t(`source.${run.source}`)}
      </Badge>
      <span className="flex-1 text-zinc-600">{formatRelative(run.started_at, locale)}</span>
      <Badge variant={variant} className="tabular">
        {err > 0
          ? t('withErrors', { success: ok, total, errors: err })
          : t('summary', { success: ok, total })}
      </Badge>
    </div>
  );
}

export function WatchlistOverview({
  stats,
  watchlists,
  runs,
}: {
  stats: OverallStats;
  watchlists: WatchlistRow[];
  runs: RunRow[];
}) {
  const tShell = useTranslations('shell');
  const tRuns = useTranslations('runs');
  const locale = useLocale();
  const lastSnap = stats.last_snapshot_at
    ? formatRelative(stats.last_snapshot_at, locale)
    : tShell('neverSnapshotted');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={tShell('products')}
          value={String(stats.product_count)}
          sub={`${stats.watchlist_count} ${tShell('watchlists')}`}
          icon={<Layers size={16} />}
        />
        <StatCard
          label={tShell('snapshots')}
          value={formatCompact(stats.snapshot_count)}
          sub={lastSnap}
          icon={<Database size={16} />}
        />
        <StatCard
          label={tShell('marketplaces')}
          value={String(stats.marketplace_count)}
          icon={<Globe size={16} />}
        />
        <StatCard
          label={tShell('errors7d')}
          value={String(stats.errors_7d)}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            {tShell('watchlistOverview')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {watchlists.map((w) => (
            <WatchlistCard key={w.id} w={w} />
          ))}
          {watchlists.length === 0 && (
            <Card className="col-span-full p-8 text-center text-sm text-zinc-500">
              {tShell('noWatchlists')}
            </Card>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            {tShell('recentRuns')}
          </h2>
        </div>
        <Card>
          {runs.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">{tRuns('noRuns')}</div>
          ) : (
            runs.map((r) => <RunRowItem key={r.id} run={r} />)
          )}
        </Card>
      </section>
    </div>
  );
}
