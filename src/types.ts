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
