# Amazon Radar

Niche-agnostic Amazon product radar. Define one or more "watchlists" as YAML files; a daily job pulls product data from the [Rainforest API](https://www.rainforestapi.com/) and writes time-series snapshots into Supabase Postgres. Future phases plug in keyword/category discovery, review ingestion + AI clustering, and an opportunity-score dashboard.

## Architecture

```
watchlists/*.yml ──▶ sync-watchlists ──▶ Postgres
                                          ▲
                                          │
                                       snapshot ◀── Rainforest API
```

- `sync-watchlists` reconciles YAML files into `watchlists` + `product_watchlist_memberships`.
- `snapshot` runs sync first, then calls Rainforest `type=product` for every active `(asin, amazon_domain)` and inserts a row into `product_snapshots`.
- Same ASIN on different marketplaces is a separate product row — composite key `(asin, amazon_domain)`.
- Membership rows record *how* an ASIN entered a watchlist (`manual_asin` today; `keyword_search` / `category_rank` once Phase 2 lands).

## Prerequisites

- Node 20+
- A Supabase project (free tier is fine)
- A Rainforest API key

## Setup

```bash
git clone https://github.com/AronLEEdev/amazon-radar.git
cd amazon-radar
npm install

cp .env.example .env
# Fill in RAINFOREST_API_KEY and DATABASE_URL.
# DATABASE_URL: Supabase Project Settings → Database → Session pooler (port 5432).
# Append ?sslmode=require.

npm run migrate          # creates tables and tracks applied files in _migrations
```

## Adding a watchlist

Create `watchlists/<slug>.yml`:

```yaml
slug: bike-accessories
name: Bike Accessories
description: Bike mounts, lights, bags, tools
amazon_domain: amazon.com
asins:
  - B07CSZHHZ7
  - asin: B08L8KNYDH
    amazon_domain: amazon.co.uk
keywords:
  - bike phone mount
categories:
  - id: "3403201"
    name: Cycling Accessories
    types: [bestsellers, new_releases, movers_and_shakers]
```

Then:

```bash
npm run sync             # validates files, upserts watchlists, diffs memberships
```

See [`watchlists/README.md`](watchlists/README.md) for the full file schema.

## Daily operation

```bash
npm run snapshot         # sync + fetch all active (asin, amazon_domain) targets
```

Inspect runs:

```sql
select id, source, started_at, finished_at,
       request_count, success_count, error_count
  from fetch_runs
 order by started_at desc
 limit 5;
```

Cron (macOS, daily 09:00):

```cron
0 9 * * * cd /Users/<you>/path/to/amazon-radar && /usr/local/bin/node ./node_modules/.bin/tsx bin/snapshot.ts >> logs/cron.log 2>&1
```

Adjust the node path with `which node`. Make sure `logs/` exists or redirect elsewhere.

## Schema overview

| Table | Purpose |
|---|---|
| `watchlists` | One row per YAML file, keyed by `slug` |
| `products` | One row per `(asin, amazon_domain)` |
| `product_watchlist_memberships` | Many-to-many between watchlists and products, with provenance (`source_type`, `source_value`) and soft-removal |
| `product_snapshots` | Time-series price / rating / review-count / BSR / buybox per `(asin, amazon_domain, captured_at)`; full Rainforest payload kept in `raw jsonb` |
| `fetch_runs` | One row per ingestion run; `source` distinguishes `product` / `search` / `category` / `reviews` / `offers` / `sync` |
| `fetch_errors` | Per-target failures, linked to a run |

Full DDL: [`migrations/001_init.sql`](migrations/001_init.sql).

## Useful queries

```sql
-- latest snapshot per product
select distinct on (asin, amazon_domain)
       asin, amazon_domain, captured_at, price_amount, rating, reviews_count, bsr_rank
  from product_snapshots
 order by asin, amazon_domain, captured_at desc;

-- per-watchlist active product count
select w.slug, count(*) as products
  from watchlists w
  join product_watchlist_memberships m on m.watchlist_id = w.id
 where m.removed_at is null
 group by w.slug
 order by products desc;

-- per-marketplace coverage
select amazon_domain, count(*) from products group by 1 order by 2 desc;

-- recent errors
select run_id, asin, amazon_domain, http_status, message, created_at
  from fetch_errors
 order by created_at desc
 limit 20;

-- (Phase 2 ready) active memberships by source
select source_type, count(*)
  from product_watchlist_memberships
 where removed_at is null
 group by source_type;
```

## Web UI

A read-only Next.js dashboard lives under [`web/`](web/). Mail.app two-pane shell: grouped product list on the left, header + tabbed detail (Trends / Snapshots / Raw / Memberships) on the right. Empty state shows per-watchlist rollup cards and recent runs. shadcn-light theme with DataPulse-style cards. `next-intl` powers `en` + `zh` from day 1.

```bash
cd web
npm install
# .env.local is already symlinked to ../.env so DATABASE_URL is shared with the scraper
npm run dev          # http://localhost:3210
```

Switch language via the toggle in the top right; URL becomes `/zh` for Chinese, `/` for English (default).

Routes:
- `/` — watchlist overview (no selection)
- `/?asin=B07...&domain=amazon.com` — product detail
- `/?asin=...&domain=...&tab=snapshots` — deep-link to a tab
- `/zh`, `/zh?asin=...` — same in Chinese

## Roadmap

- **Week 2** — trend queries / charts (schema already supports).
- **Phase 2** — keyword + category discovery (`type=search`, `type=bestsellers/new_releases/movers_and_shakers`).
- **Phase 3** — review ingestion + LLM negative-review clustering.
- **Phase 4** — offer / buybox tracking.
- **Phase 5** — opportunity score + Next.js + shadcn/ui dashboard.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## License

TBD.
