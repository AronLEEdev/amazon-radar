import { loadConfig } from './config.js';
import type {
  ProductCore,
  ProductSnapshotFields,
  ProductTarget,
} from './types.js';

const ENDPOINT = 'https://api.rainforestapi.com/request';

export class RainforestError extends Error {
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function callRainforest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const cfg = loadConfig();
  const url = new URL(ENDPOINT);
  url.searchParams.set('api_key', cfg.RAINFOREST_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RainforestError(`Rainforest ${res.status}: ${body.slice(0, 500)}`, res.status);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ─── Search (type=search) ───────────────────────────────────────────────────

export interface SearchHit {
  /** Raw page position from Rainforest (sponsored hits included; counts everything in the SERP). */
  rank: number;
  /**
   * 1-based index after filtering out sponsored results. `null` for sponsored hits.
   * Use this for any "leaderboard" / "top N" semantics — page rank is misleading
   * because sponsored placements break contiguity (e.g. organic ranks would be
   * 1, 2, 3 even if their page positions are 1, 2, 4).
   */
  organic_rank: number | null;
  asin: string;
  sponsored: boolean | null;
  title: string | null;
  brand: string | null;
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  reviews_count: number | null;
  image_url: string | null;
}

export interface SearchResult {
  keyword: string;
  amazon_domain: string;
  hits: SearchHit[];
  raw: unknown;
}

export async function searchProducts(
  keyword: string,
  amazonDomain: string,
): Promise<SearchResult> {
  const data = await callRainforest({
    type: 'search',
    amazon_domain: amazonDomain,
    search_term: keyword,
  });
  const list = (data.search_results ?? []) as Array<Record<string, unknown>>;
  let organicCounter = 0;
  const hits: SearchHit[] = list
    .map((r, i): SearchHit | null => {
      const asin = String(r.asin ?? '');
      if (asin.length !== 10) return null;
      const sponsored =
        typeof r.sponsored === 'boolean' ? (r.sponsored as boolean) : null;
      const isSponsored = sponsored === true;
      const position = (r.position as number | undefined) ?? i + 1;
      const organic_rank = isSponsored ? null : ++organicCounter;
      const price = (r.price as Record<string, unknown> | undefined) ?? {};
      const image = r.image as string | undefined;
      return {
        rank: position,
        organic_rank,
        asin,
        sponsored,
        title: typeof r.title === 'string' ? r.title : null,
        brand: typeof r.brand === 'string' ? r.brand : null,
        price_amount:
          typeof price.value === 'number' && Number.isFinite(price.value)
            ? (price.value as number)
            : null,
        price_currency:
          typeof price.currency === 'string' ? (price.currency as string) : null,
        rating: typeof r.rating === 'number' ? (r.rating as number) : null,
        reviews_count:
          typeof r.ratings_total === 'number'
            ? Math.trunc(r.ratings_total as number)
            : null,
        image_url: typeof image === 'string' && image.length > 0 ? image : null,
      };
    })
    .filter((h): h is SearchHit => h !== null);
  return { keyword, amazon_domain: amazonDomain, hits, raw: data };
}

// ─── Category lists (type=bestsellers / new_releases / movers_and_shakers) ──

export type CategoryListType = 'bestsellers' | 'new_releases' | 'movers_and_shakers';

export interface CategoryHit {
  rank: number;
  asin: string;
  title: string | null;
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  reviews_count: number | null;
  image_url: string | null;
}

export interface CategoryListResult {
  category_id: string;
  category_name: string | null;
  amazon_domain: string;
  list_type: CategoryListType;
  hits: CategoryHit[];
  raw: unknown;
}

// Rainforest doesn't expose Amazon's bestsellers/new_releases/movers lists keyed by
// the public Amazon node ID — those endpoints need Rainforest-internal IDs (or a URL
// that doesn't combine with amazon_domain). For Phase 2 we just call `type=category`
// with the Amazon node ID and store the default category browse order. All three
// `list_type` enum values currently produce the same payload — we keep the column so
// later versions can swap in true bestseller/new_release endpoints when we get the
// ID mapping right.
export async function getCategoryList(
  categoryId: string,
  amazonDomain: string,
  listType: CategoryListType,
): Promise<CategoryListResult> {
  const data = await callRainforest({
    type: 'category',
    amazon_domain: amazonDomain,
    category_id: categoryId,
  });
  // type=category returns rows under `category_results`.
  const list = (data.category_results ?? data.results ?? []) as Array<
    Record<string, unknown>
  >;
  const catInfo = (data.category_information ?? data.category) as
    | Record<string, unknown>
    | undefined;
  const categoryName =
    typeof catInfo?.name === 'string'
      ? (catInfo.name as string)
      : typeof catInfo?.title === 'string'
        ? (catInfo.title as string)
        : null;
  const hits: CategoryHit[] = list.map((r, i) => {
    const position = (r.rank as number | undefined) ?? (r.position as number | undefined) ?? i + 1;
    const price = (r.price as Record<string, unknown> | undefined) ?? {};
    const image = r.image as string | undefined;
    return {
      rank: position,
      asin: String(r.asin ?? ''),
      title: typeof r.title === 'string' ? r.title : null,
      price_amount:
        typeof price.value === 'number' && Number.isFinite(price.value)
          ? (price.value as number)
          : null,
      price_currency: typeof price.currency === 'string' ? (price.currency as string) : null,
      rating: typeof r.rating === 'number' ? (r.rating as number) : null,
      reviews_count:
        typeof r.ratings_total === 'number' ? Math.trunc(r.ratings_total as number) : null,
      image_url: typeof image === 'string' && image.length > 0 ? image : null,
    };
  }).filter((h) => h.asin.length === 10);
  return {
    category_id: categoryId,
    category_name: categoryName,
    amazon_domain: amazonDomain,
    list_type: listType,
    hits,
    raw: data,
  };
}

export interface ProductResult {
  target: ProductTarget;
  core: ProductCore;
  snapshot: ProductSnapshotFields;
  raw: unknown;
}

/**
 * Call Rainforest type=product for one (asin, amazon_domain).
 * Throws RainforestError on non-2xx. Lets caller log to fetch_errors and continue.
 */
export async function getProduct(
  target: ProductTarget,
): Promise<ProductResult> {
  const cfg = loadConfig();
  const url = new URL(ENDPOINT);
  url.searchParams.set('api_key', cfg.RAINFOREST_API_KEY);
  url.searchParams.set('type', 'product');
  url.searchParams.set('amazon_domain', target.amazon_domain);
  url.searchParams.set('asin', target.asin);

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RainforestError(
      `Rainforest ${res.status}: ${body.slice(0, 500)}`,
      res.status,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const product = (data.product ?? {}) as Record<string, unknown>;
  const buybox = (data.buybox_winner ?? product.buybox_winner ?? {}) as Record<
    string,
    unknown
  >;

  const core: ProductCore = {
    title: pickString(product, 'title'),
    brand: pickString(product, 'brand'),
    main_category: pickString(product, 'main_category'),
  };

  const snapshot: ProductSnapshotFields = {
    price_amount: extractPriceAmount(buybox, product),
    price_currency: extractPriceCurrency(buybox, product),
    rating: extractRating(product),
    reviews_count: extractReviewCount(product),
    bsr_rank: extractBsrRank(product),
    bsr_category: extractBsrCategory(product),
    buybox_seller: extractSeller(buybox),
    in_stock: extractInStock(buybox, product),
  };

  return { target, core, snapshot, raw: data };
}

// --- best-effort extractors over Rainforest's flexible response shape ---

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function extractPriceAmount(
  buybox: Record<string, unknown>,
  product: Record<string, unknown>,
): number | null {
  const candidates: unknown[] = [
    (buybox.price as Record<string, unknown> | undefined)?.value,
    (product.buybox_winner as Record<string, unknown> | undefined)?.price &&
      ((product.buybox_winner as Record<string, unknown>).price as Record<
        string,
        unknown
      >).value,
    (product.price as Record<string, unknown> | undefined)?.value,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

function extractPriceCurrency(
  buybox: Record<string, unknown>,
  product: Record<string, unknown>,
): string | null {
  const candidates: unknown[] = [
    (buybox.price as Record<string, unknown> | undefined)?.currency,
    (product.price as Record<string, unknown> | undefined)?.currency,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

function extractRating(product: Record<string, unknown>): number | null {
  const v = product.rating;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function extractReviewCount(product: Record<string, unknown>): number | null {
  const v =
    product.ratings_total ??
    product.reviews_total ??
    (product.reviews as Record<string, unknown> | undefined)?.total_reviews;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return null;
}

function extractBsrRank(product: Record<string, unknown>): number | null {
  const arr = product.bestsellers_rank;
  if (Array.isArray(arr) && arr.length > 0) {
    const top = arr[0] as Record<string, unknown>;
    const r = top.rank;
    if (typeof r === 'number' && Number.isFinite(r)) return Math.trunc(r);
  }
  return null;
}

function extractBsrCategory(product: Record<string, unknown>): string | null {
  const arr = product.bestsellers_rank;
  if (Array.isArray(arr) && arr.length > 0) {
    const top = arr[0] as Record<string, unknown>;
    const cat = top.category;
    if (typeof cat === 'string' && cat.length > 0) return cat;
  }
  return null;
}

function extractSeller(buybox: Record<string, unknown>): string | null {
  const seller = buybox.seller;
  if (seller && typeof seller === 'object') {
    const name = (seller as Record<string, unknown>).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return null;
}

function extractInStock(
  buybox: Record<string, unknown>,
  product: Record<string, unknown>,
): boolean | null {
  const a = (buybox.availability as Record<string, unknown> | undefined)?.in_stock;
  if (typeof a === 'boolean') return a;
  const b = (product.availability as Record<string, unknown> | undefined)?.in_stock;
  if (typeof b === 'boolean') return b;
  return null;
}
