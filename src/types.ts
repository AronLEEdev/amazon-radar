export type SourceType =
  | 'manual_asin'
  | 'keyword_search'
  | 'category_rank'
  | 'related'
  | 'manual_other';

export type FetchSource =
  | 'product'
  | 'search'
  | 'category'
  | 'reviews'
  | 'offers'
  | 'sync';

export interface ProductTarget {
  asin: string;
  amazon_domain: string;
}

export interface ParsedWatchlist {
  slug: string;
  name: string;
  description?: string | undefined;
  amazon_domain?: string | undefined;
  asins: ProductTarget[];
  keywords: string[];
  categories: WatchlistCategory[];
  tracker?: TrackerConfig | undefined;
}

export type TrackerMode = 'search' | 'category';

export interface TrackerConfig {
  mode: TrackerMode;
  query?: string | undefined; // required when mode=search
  category_id?: string | undefined; // required when mode=category (future)
  top_n: number;
  cooldown_days: number;
  max_targets_per_day: number;
  timezone: string; // IANA tz, e.g. "America/Los_Angeles"
}

/** Stable identity for cooldown/idempotency lookups across runs of the same tracker. */
export function trackerIdentity(watchlistId: string | number, t: TrackerConfig): string {
  const value = t.mode === 'search' ? (t.query ?? '') : (t.category_id ?? '');
  return `${watchlistId}:${t.mode}:${value}`;
}

export interface WatchlistCategory {
  id: string;
  name?: string | undefined;
  types: Array<'bestsellers' | 'new_releases' | 'movers_and_shakers'>;
}

export interface ProductSnapshotFields {
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  reviews_count: number | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  buybox_seller: string | null;
  in_stock: boolean | null;
}

export interface ProductCore {
  title: string | null;
  brand: string | null;
  main_category: string | null;
}
