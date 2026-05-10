import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import type { ProductRow, SnapshotRow, MembershipRow } from '@/lib/types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Sparkline, type SparkPoint } from './charts/sparkline';
import { RawJson } from './raw-json';
import {
  amazonUrl,
  formatBsr,
  formatCompact,
  formatPrice,
  formatRating,
  formatRelative,
} from '@/lib/format';
import { cn } from '@/lib/cn';

type Tab = 'trends' | 'snapshots' | 'raw' | 'memberships';
const TABS: Tab[] = ['trends', 'snapshots', 'raw', 'memberships'];

export function RightPane({
  product,
  snapshots,
  memberships,
  raw,
  activeTab,
}: {
  product: ProductRow;
  snapshots: SnapshotRow[];
  memberships: MembershipRow[];
  raw: unknown;
  activeTab: Tab;
}) {
  const t = useTranslations('product');
  const tShell = useTranslations('shell');
  const locale = useLocale();

  const series = (key: 'price_amount' | 'rating' | 'reviews_count' | 'bsr_rank'): SparkPoint[] =>
    snapshots.map((s) => ({ t: new Date(s.captured_at).getTime(), v: s[key] as number | null }));

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden bg-surface-2">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-start gap-4">
          {product.image_url ? (
            // Using <img> since arbitrary Amazon CDN host whitelist is configured but Image
            // requires width/height we don't always know in advance.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt=""
              className="h-16 w-16 rounded-md border border-zinc-200 object-contain"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-zinc-200 text-[10px] text-zinc-400">
              no image
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-zinc-900">
              {product.title ?? product.asin}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              <span className="tabular">{product.asin}</span>
              <span>·</span>
              <span>{product.amazon_domain}</span>
              {product.brand ? (
                <>
                  <span>·</span>
                  <span>{product.brand}</span>
                </>
              ) : null}
              {product.main_category ? (
                <>
                  <span>·</span>
                  <span className="truncate">{product.main_category}</span>
                </>
              ) : null}
              <Link
                href={amazonUrl(product.asin, product.amazon_domain)}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto flex items-center gap-1 text-blue-600 hover:underline"
              >
                {t('openOnAmazon')}
                <ExternalLink size={11} />
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="primary">
                {formatPrice(product.price_amount, product.price_currency)}
              </Badge>
              <Badge variant="warning">
                {formatRating(product.rating)}
                <span className="ml-0.5">★</span>
              </Badge>
              <Badge variant="muted">
                {formatCompact(product.reviews_count)} {t('metrics.reviews').toLowerCase()}
              </Badge>
              <Badge variant="default">BSR {formatBsr(product.bsr_rank)}</Badge>
              {product.in_stock !== null ? (
                <Badge variant={product.in_stock ? 'success' : 'danger'}>
                  {product.in_stock ? t('metrics.inStock') : t('metrics.outOfStock')}
                </Badge>
              ) : null}
              {product.last_captured_at ? (
                <Badge variant="outline">
                  {tShell('lastSnapshot')}: {formatRelative(product.last_captured_at, locale)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <nav className="mt-4 flex gap-1 border-b border-transparent">
          {TABS.map((tab) => (
            <Link
              key={tab}
              href={{
                pathname: '/',
                query: { asin: product.asin, domain: product.amazon_domain, tab },
              }}
              scroll={false}
              className={cn(
                'border-b-2 px-3 pb-2 pt-1 text-xs font-medium transition-colors',
                activeTab === tab
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800',
              )}
            >
              {t(`tabs.${tab}`)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        {activeTab === 'trends' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard label={t('metrics.price')} value={formatPrice(product.price_amount, product.price_currency)}>
              <Sparkline data={series('price_amount')} color="#3b82f6" />
            </ChartCard>
            <ChartCard label={t('metrics.reviews')} value={formatCompact(product.reviews_count)}>
              <Sparkline data={series('reviews_count')} color="#8b5cf6" />
            </ChartCard>
            <ChartCard label={t('metrics.rating')} value={formatRating(product.rating)}>
              <Sparkline data={series('rating')} color="#f59e0b" />
            </ChartCard>
            <ChartCard label="BSR" value={formatBsr(product.bsr_rank)}>
              <Sparkline data={series('bsr_rank')} color="#10b981" invertY />
            </ChartCard>
            {snapshots.length < 2 && (
              <Card className="col-span-full p-4 text-center text-xs text-zinc-500">
                {t('needMoreData')}
              </Card>
            )}
          </div>
        )}

        {activeTab === 'snapshots' && (
          <Card className="overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50/60 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="p-2 text-left font-medium">{t('snapshotsTable.capturedAt')}</th>
                  <th className="p-2 text-right font-medium">{t('snapshotsTable.price')}</th>
                  <th className="p-2 text-right font-medium">{t('snapshotsTable.rating')}</th>
                  <th className="p-2 text-right font-medium">{t('snapshotsTable.reviews')}</th>
                  <th className="p-2 text-right font-medium">{t('snapshotsTable.bsr')}</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots]
                  .reverse()
                  .map((s, i) => (
                    <tr key={i} className="border-t border-zinc-100">
                      <td className="p-2 text-zinc-700">
                        {new Date(s.captured_at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                      </td>
                      <td className="p-2 text-right tabular">
                        {formatPrice(s.price_amount, s.price_currency)}
                      </td>
                      <td className="p-2 text-right tabular">{formatRating(s.rating)}</td>
                      <td className="p-2 text-right tabular">{formatCompact(s.reviews_count)}</td>
                      <td className="p-2 text-right tabular">{formatBsr(s.bsr_rank)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {snapshots.length === 0 && (
              <div className="p-6 text-center text-xs text-zinc-500">{t('noSnapshots')}</div>
            )}
          </Card>
        )}

        {activeTab === 'raw' && <RawJson data={raw} />}

        {activeTab === 'memberships' && (
          <Card>
            <table className="w-full text-xs">
              <thead className="bg-zinc-50/60 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="p-2 text-left font-medium">{t('membership.watchlist')}</th>
                  <th className="p-2 text-left font-medium">{t('membership.source')}</th>
                  <th className="p-2 text-right font-medium">{t('membership.addedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="p-2 font-medium text-zinc-800">{m.watchlist_name}</td>
                    <td className="p-2 text-zinc-600">
                      <Badge variant="muted">{t(`membership.${m.source_type}`)}</Badge>
                      {m.source_value ? (
                        <span className="ml-2 text-zinc-500">{m.source_value}</span>
                      ) : null}
                    </td>
                    <td className="p-2 text-right text-zinc-500">
                      {formatRelative(m.added_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </main>
  );
}

function ChartCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 mb-2 text-xl font-semibold tabular tracking-tight text-zinc-900">
        {value}
      </div>
      {children}
    </Card>
  );
}
