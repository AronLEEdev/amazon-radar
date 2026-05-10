import 'server-only';
import { getPool } from './db';
import type {
  WatchlistRow,
  ProductRow,
  SnapshotRow,
  MembershipRow,
  RunRow,
  OverallStats,
} from './types';

export async function getOverallStats(): Promise<OverallStats> {
  const { rows } = await getPool().query<{
    watchlist_count: string;
    product_count: string;
    marketplace_count: string;
    snapshot_count: string;
    errors_7d: string;
    last_snapshot_at: Date | null;
  }>(`
    select
      (select count(*) from watchlists) as watchlist_count,
      (select count(*) from products) as product_count,
      (select count(distinct amazon_domain) from products) as marketplace_count,
      (select count(*) from product_snapshots) as snapshot_count,
      (select count(*) from fetch_errors where created_at > now() - interval '7 days') as errors_7d,
      (select max(captured_at) from product_snapshots) as last_snapshot_at
  `);
  const r = rows[0]!;
  return {
    watchlist_count: Number(r.watchlist_count),
    product_count: Number(r.product_count),
    marketplace_count: Number(r.marketplace_count),
    snapshot_count: Number(r.snapshot_count),
    errors_7d: Number(r.errors_7d),
    last_snapshot_at: r.last_snapshot_at,
  };
}

export async function getWatchlists(): Promise<WatchlistRow[]> {
  const { rows } = await getPool().query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    amazon_domain: string | null;
    product_count: string;
    marketplace_count: string;
    last_snapshot_at: Date | null;
    median_price: string | null;
    avg_rating: string | null;
    min_bsr: string | null;
    max_bsr: string | null;
  }>(`
    with latest as (
      select distinct on (asin, amazon_domain)
             asin, amazon_domain, captured_at, price_amount, rating, bsr_rank
        from product_snapshots
       order by asin, amazon_domain, captured_at desc
    ),
    wl_products as (
      select w.id, w.slug, w.name, w.description, w.amazon_domain,
             m.asin, m.amazon_domain as m_domain
        from watchlists w
        left join product_watchlist_memberships m
          on m.watchlist_id = w.id and m.removed_at is null
    )
    select w.id::text, w.slug, w.name, w.description, w.amazon_domain,
           count(distinct (wp.asin, wp.m_domain)) filter (where wp.asin is not null) as product_count,
           count(distinct wp.m_domain) filter (where wp.m_domain is not null) as marketplace_count,
           max(l.captured_at) as last_snapshot_at,
           percentile_cont(0.5) within group (order by l.price_amount) as median_price,
           avg(l.rating) as avg_rating,
           min(l.bsr_rank) as min_bsr,
           max(l.bsr_rank) as max_bsr
      from watchlists w
      left join wl_products wp on wp.id = w.id
      left join latest l on l.asin = wp.asin and l.amazon_domain = wp.m_domain
     group by w.id, w.slug, w.name, w.description, w.amazon_domain
     order by w.name
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    amazon_domain: r.amazon_domain,
    product_count: Number(r.product_count ?? 0),
    marketplace_count: Number(r.marketplace_count ?? 0),
    last_snapshot_at: r.last_snapshot_at,
    median_price: r.median_price !== null ? Number(r.median_price) : null,
    avg_rating: r.avg_rating !== null ? Number(r.avg_rating) : null,
    min_bsr: r.min_bsr !== null ? Number(r.min_bsr) : null,
    max_bsr: r.max_bsr !== null ? Number(r.max_bsr) : null,
  }));
}

export async function getProductsByWatchlist(): Promise<ProductRow[]> {
  const { rows } = await getPool().query<{
    asin: string;
    amazon_domain: string;
    title: string | null;
    brand: string | null;
    main_category: string | null;
    watchlist_slug: string;
    watchlist_name: string;
    last_captured_at: Date | null;
    price_amount: string | null;
    price_currency: string | null;
    rating: string | null;
    reviews_count: number | null;
    bsr_rank: number | null;
    bsr_category: string | null;
    in_stock: boolean | null;
    image_url: string | null;
  }>(`
    with latest as (
      select distinct on (asin, amazon_domain)
             asin, amazon_domain, captured_at, price_amount, price_currency,
             rating, reviews_count, bsr_rank, bsr_category, in_stock,
             raw->'product'->'main_image'->>'link' as image_url
        from product_snapshots
       order by asin, amazon_domain, captured_at desc
    )
    select p.asin, p.amazon_domain, p.title, p.brand, p.main_category,
           w.slug as watchlist_slug, w.name as watchlist_name,
           l.captured_at as last_captured_at,
           l.price_amount, l.price_currency, l.rating, l.reviews_count,
           l.bsr_rank, l.bsr_category, l.in_stock, l.image_url
      from product_watchlist_memberships m
      join watchlists w on w.id = m.watchlist_id
      join products p on p.asin = m.asin and p.amazon_domain = m.amazon_domain
      left join latest l on l.asin = p.asin and l.amazon_domain = p.amazon_domain
     where m.removed_at is null
       and m.source_type = 'manual_asin'
     group by p.asin, p.amazon_domain, p.title, p.brand, p.main_category,
              w.slug, w.name, l.captured_at, l.price_amount, l.price_currency,
              l.rating, l.reviews_count, l.bsr_rank, l.bsr_category, l.in_stock, l.image_url
     order by w.name, l.reviews_count desc nulls last, p.title
  `);
  return rows.map((r) => ({
    asin: r.asin,
    amazon_domain: r.amazon_domain,
    title: r.title,
    brand: r.brand,
    main_category: r.main_category,
    watchlist_slug: r.watchlist_slug,
    watchlist_name: r.watchlist_name,
    last_captured_at: r.last_captured_at,
    price_amount: r.price_amount !== null ? Number(r.price_amount) : null,
    price_currency: r.price_currency,
    rating: r.rating !== null ? Number(r.rating) : null,
    reviews_count: r.reviews_count,
    bsr_rank: r.bsr_rank,
    bsr_category: r.bsr_category,
    in_stock: r.in_stock,
    image_url: r.image_url,
  }));
}

export async function getProduct(
  asin: string,
  amazonDomain: string,
): Promise<ProductRow | null> {
  const { rows } = await getPool().query<{
    asin: string;
    amazon_domain: string;
    title: string | null;
    brand: string | null;
    main_category: string | null;
    last_captured_at: Date | null;
    price_amount: string | null;
    price_currency: string | null;
    rating: string | null;
    reviews_count: number | null;
    bsr_rank: number | null;
    bsr_category: string | null;
    in_stock: boolean | null;
    image_url: string | null;
  }>(
    `
    with latest as (
      select asin, amazon_domain, captured_at, price_amount, price_currency,
             rating, reviews_count, bsr_rank, bsr_category, in_stock,
             raw->'product'->'main_image'->>'link' as image_url
        from product_snapshots
       where asin = $1 and amazon_domain = $2
       order by captured_at desc
       limit 1
    )
    select p.asin, p.amazon_domain, p.title, p.brand, p.main_category,
           l.captured_at as last_captured_at,
           l.price_amount, l.price_currency, l.rating, l.reviews_count,
           l.bsr_rank, l.bsr_category, l.in_stock, l.image_url
      from products p
      left join latest l on l.asin = p.asin and l.amazon_domain = p.amazon_domain
     where p.asin = $1 and p.amazon_domain = $2
    `,
    [asin, amazonDomain],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    asin: r.asin,
    amazon_domain: r.amazon_domain,
    title: r.title,
    brand: r.brand,
    main_category: r.main_category,
    watchlist_slug: '',
    watchlist_name: '',
    last_captured_at: r.last_captured_at,
    price_amount: r.price_amount !== null ? Number(r.price_amount) : null,
    price_currency: r.price_currency,
    rating: r.rating !== null ? Number(r.rating) : null,
    reviews_count: r.reviews_count,
    bsr_rank: r.bsr_rank,
    bsr_category: r.bsr_category,
    in_stock: r.in_stock,
    image_url: r.image_url,
  };
}

export async function getSnapshots(asin: string, amazonDomain: string): Promise<SnapshotRow[]> {
  const { rows } = await getPool().query<{
    captured_at: Date;
    price_amount: string | null;
    price_currency: string | null;
    rating: string | null;
    reviews_count: number | null;
    bsr_rank: number | null;
  }>(
    `select captured_at, price_amount, price_currency, rating, reviews_count, bsr_rank
       from product_snapshots
      where asin = $1 and amazon_domain = $2
      order by captured_at asc`,
    [asin, amazonDomain],
  );
  return rows.map((r) => ({
    captured_at: r.captured_at,
    price_amount: r.price_amount !== null ? Number(r.price_amount) : null,
    price_currency: r.price_currency,
    rating: r.rating !== null ? Number(r.rating) : null,
    reviews_count: r.reviews_count,
    bsr_rank: r.bsr_rank,
  }));
}

export async function getLatestRaw(
  asin: string,
  amazonDomain: string,
): Promise<unknown | null> {
  const { rows } = await getPool().query<{ raw: unknown }>(
    `select raw from product_snapshots
      where asin = $1 and amazon_domain = $2
      order by captured_at desc limit 1`,
    [asin, amazonDomain],
  );
  return rows[0]?.raw ?? null;
}

export async function getMemberships(
  asin: string,
  amazonDomain: string,
): Promise<MembershipRow[]> {
  const { rows } = await getPool().query<{
    watchlist_slug: string;
    watchlist_name: string;
    source_type: MembershipRow['source_type'];
    source_value: string | null;
    added_at: Date;
  }>(
    `select w.slug as watchlist_slug, w.name as watchlist_name,
            m.source_type, m.source_value, m.added_at
       from product_watchlist_memberships m
       join watchlists w on w.id = m.watchlist_id
      where m.asin = $1 and m.amazon_domain = $2 and m.removed_at is null
      order by m.added_at`,
    [asin, amazonDomain],
  );
  return rows;
}

export async function getRecentRuns(limit = 5): Promise<RunRow[]> {
  const { rows } = await getPool().query<{
    id: string;
    source: RunRow['source'];
    started_at: Date;
    finished_at: Date | null;
    request_count: number;
    asin_count: number;
    success_count: number;
    error_count: number;
  }>(
    `select id::text, source, started_at, finished_at,
            request_count, asin_count, success_count, error_count
       from fetch_runs
       order by started_at desc
       limit $1`,
    [limit],
  );
  return rows;
}
