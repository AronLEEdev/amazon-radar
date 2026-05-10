import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowDown, ArrowUp, Crown, ExternalLink, Minus } from 'lucide-react';
import type { LeaderboardRow, TrackerInfo } from '@/lib/types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  amazonUrl,
  formatBsr,
  formatCompact,
  formatPrice,
  formatRating,
  formatRelative,
} from '@/lib/format';
import { cn } from '@/lib/cn';

function DeltaBadge({ row }: { row: LeaderboardRow }) {
  if (!row.is_today) {
    return (
      <Badge variant="muted" className="text-[10px]">
        ↓ off
      </Badge>
    );
  }
  if (row.yesterday_rank === null) {
    return (
      <Badge variant="primary" className="text-[10px]">
        new
      </Badge>
    );
  }
  if (row.delta === null || row.delta === 0) {
    return (
      <Badge variant="muted" className="text-[10px]">
        <Minus size={10} />
        same
      </Badge>
    );
  }
  if (row.delta > 0) {
    return (
      <Badge variant="success" className="text-[10px]">
        <ArrowUp size={10} />
        {row.delta}
      </Badge>
    );
  }
  return (
    <Badge variant="danger" className="text-[10px]">
      <ArrowDown size={10} />
      {-row.delta}
    </Badge>
  );
}

export function Leaderboard({
  tracker,
  rows,
}: {
  tracker: TrackerInfo;
  rows: LeaderboardRow[];
}) {
  const t = useTranslations('leaderboard');
  const tProd = useTranslations('product');
  const locale = useLocale();
  const lastBd = tracker.last_business_day;

  const todayRows = rows.filter((r) => r.is_today);
  const cooldownRows = rows.filter((r) => !r.is_today && r.is_cooldown);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-gradient-to-br from-blue-50/60 to-violet-50/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Crown size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              {t('title', { name: tracker.watchlist_name })}
            </h2>
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {tracker.mode === 'search' ? (
              <>
                {t('source.search')}: <span className="font-medium text-zinc-700">{tracker.query}</span>
                {' · '}
                {tracker.amazon_domain}
                {' · '}
                {t('topN', { n: tracker.top_n })}
                {' · '}
                {t('cooldown', { d: tracker.cooldown_days })}
              </>
            ) : (
              <>category {tracker.category_id}</>
            )}
          </div>
        </div>
        <div className="text-right text-[10px] text-zinc-500">
          <div>
            {t('businessDay')}:{' '}
            <span className="font-medium tabular text-zinc-700">{lastBd ?? '—'}</span>
          </div>
          <div className="mt-0.5 text-zinc-400">{tracker.timezone}</div>
        </div>
      </div>

      {todayRows.length === 0 && cooldownRows.length === 0 ? (
        <div className="p-6 text-center text-sm text-zinc-500">{t('empty')}</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-zinc-50/60 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-10 p-2 text-right font-medium">#</th>
              <th className="w-9 p-2"></th>
              <th className="p-2 text-left font-medium">{t('product')}</th>
              <th className="p-2 text-right font-medium">{tProd('metrics.price')}</th>
              <th className="p-2 text-right font-medium">{tProd('metrics.reviews')}</th>
              <th className="p-2 text-right font-medium">{tProd('metrics.rating')}</th>
              <th className="p-2 text-right font-medium">BSR</th>
              <th className="w-16 p-2 text-center font-medium">{t('vsYest')}</th>
              <th className="w-9 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {todayRows.map((row) => (
              <LeaderboardTableRow key={`t-${row.asin}`} row={row} locale={locale} />
            ))}
            {cooldownRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={9}
                    className="border-t border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500"
                  >
                    {t('cooldownGroup', { d: tracker.cooldown_days })}
                  </td>
                </tr>
                {cooldownRows.map((row) => (
                  <LeaderboardTableRow key={`c-${row.asin}`} row={row} locale={locale} />
                ))}
              </>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function LeaderboardTableRow({
  row,
  locale,
}: {
  row: LeaderboardRow;
  locale: string;
}) {
  const tProd = useTranslations('product');
  const detailHref = {
    pathname: '/' as const,
    query: { asin: row.asin, domain: row.amazon_domain } as const,
  };
  return (
    <tr
      className={cn(
        'border-t border-zinc-100 transition-colors hover:bg-blue-50/40',
        !row.is_today && 'opacity-70',
      )}
    >
      <td className="p-2 text-right tabular text-zinc-700">
        {row.is_today ? row.today_rank : '·'}
      </td>
      <td className="p-2">
        {row.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.image_url}
            alt=""
            className="h-8 w-8 rounded border border-zinc-200 object-contain"
          />
        ) : (
          <div className="h-8 w-8 rounded border border-dashed border-zinc-200" />
        )}
      </td>
      <td className="min-w-0 p-2">
        <Link href={detailHref} className="block group">
          <div className="truncate font-medium text-zinc-800 group-hover:text-blue-700">
            {row.title ?? row.asin}
          </div>
          <div className="text-[10px] text-zinc-400">
            {row.asin}
            {row.brand ? ` · ${row.brand}` : null}
            {row.last_captured_at
              ? ` · ${formatRelative(row.last_captured_at, locale)}`
              : null}
          </div>
        </Link>
      </td>
      <td className="p-2 text-right tabular text-zinc-800">
        {formatPrice(row.price_amount, row.price_currency)}
      </td>
      <td className="p-2 text-right tabular text-zinc-700">
        {formatCompact(row.reviews_count)}
      </td>
      <td className="p-2 text-right tabular text-zinc-700">
        {formatRating(row.rating)}
        <span className="ml-0.5 text-amber-500">★</span>
      </td>
      <td className="p-2 text-right tabular text-zinc-700">
        {formatBsr(row.bsr_rank)}
      </td>
      <td className="p-2 text-center">
        <DeltaBadge row={row} />
      </td>
      <td className="p-2 text-right">
        <a
          href={amazonUrl(row.asin, row.amazon_domain)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          title={tProd('openOnAmazon')}
        >
          <ExternalLink size={12} />
        </a>
      </td>
    </tr>
  );
}
