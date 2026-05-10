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
