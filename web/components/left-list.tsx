import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search } from 'lucide-react';
import type { ProductRow } from '@/lib/types';
import { cn } from '@/lib/cn';
import { formatCompact, formatPrice } from '@/lib/format';

export function LeftList({
  products,
  selected,
  totalProducts,
}: {
  products: ProductRow[];
  selected: { asin: string; domain: string } | null;
  totalProducts: number;
}) {
  const t = useTranslations('shell');

  // Group by watchlist (preserve order from query)
  const groups = new Map<string, { name: string; items: ProductRow[] }>();
  for (const p of products) {
    const g = groups.get(p.watchlist_slug);
    if (g) g.items.push(p);
    else groups.set(p.watchlist_slug, { name: p.watchlist_name, items: [p] });
  }

  return (
    <aside className="flex h-full w-[320px] flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-2.5">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            placeholder={t('search')}
            className="h-7 w-full rounded-md border border-zinc-200 bg-zinc-50 pl-7 pr-2 text-xs outline-none placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-zinc-400">
          <span>
            {totalProducts} {t('products')}
          </span>
          <span>{groups.size} {t('watchlists')}</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin">
        {[...groups.entries()].map(([slug, group]) => (
          <div key={slug} className="border-b border-zinc-100 last:border-b-0">
            <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-zinc-50/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur">
              <ChevronDown size={11} />
              <span className="flex-1 normal-case tracking-normal text-zinc-700">{group.name}</span>
              <span className="rounded bg-zinc-200/70 px-1.5 py-0.5 tabular text-zinc-600">
                {group.items.length}
              </span>
            </div>
            {group.items.map((p) => {
              const isSel =
                selected?.asin === p.asin && selected.domain === p.amazon_domain;
              return (
                <Link
                  key={`${p.asin}-${p.amazon_domain}`}
                  href={{
                    pathname: '/',
                    query: { asin: p.asin, domain: p.amazon_domain },
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50',
                    isSel && 'bg-blue-50 hover:bg-blue-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex-1 truncate',
                      isSel ? 'font-semibold text-zinc-900' : 'text-zinc-700',
                    )}
                  >
                    {p.title ?? p.asin}
                  </span>
                  <span className="tabular text-[10.5px] text-zinc-500">
                    {formatCompact(p.reviews_count)}
                  </span>
                  <span className="tabular text-[10.5px] text-zinc-700">
                    {formatPrice(p.price_amount, p.price_currency)}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
        {groups.size === 0 && (
          <div className="p-6 text-center text-xs text-zinc-500">{t('noWatchlists')}</div>
        )}
      </nav>
    </aside>
  );
}
