export interface WatchlistRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  amazon_domain: string | null;
  product_count: number;
  marketplace_count: number;
  last_snapshot_at: Date | null;
  median_price: number | null;
  avg_rating: number | null;
  min_bsr: number | null;
  max_bsr: number | null;
}

export interface ProductRow {
  asin: string;
  amazon_domain: string;
  title: string | null;
  brand: string | null;
  main_category: string | null;
  watchlist_slug: string;
  watchlist_name: string;
  last_captured_at: Date | null;
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  reviews_count: number | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  in_stock: boolean | null;
  image_url: string | null;
}

export interface SnapshotRow {
  captured_at: Date;
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  reviews_count: number | null;
  bsr_rank: number | null;
}

export interface MembershipRow {
  watchlist_slug: string;
  watchlist_name: string;
  source_type: 'manual_asin' | 'keyword_search' | 'category_rank' | 'related' | 'manual_other';
  source_value: string | null;
  added_at: Date;
}

export interface RunRow {
  id: string;
  source: 'product' | 'search' | 'category' | 'reviews' | 'offers' | 'sync';
  started_at: Date;
  finished_at: Date | null;
  request_count: number;
  asin_count: number;
  success_count: number;
  error_count: number;
}

export interface OverallStats {
  watchlist_count: number;
  product_count: number;
  marketplace_count: number;
  snapshot_count: number;
  errors_7d: number;
  last_snapshot_at: Date | null;
}
