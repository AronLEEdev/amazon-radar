# Amazon Radar

Amazon leaderboard tracker. Pick a search keyword (e.g. *"pet backpack"*); the radar fetches today's top-N organic results once a day, snapshots their price / rating / reviews / BSR into Postgres, and tracks rank deltas vs yesterday — plus a 3-day cooldown for products that briefly fall off the list. A read-only Next.js dashboard renders the live leaderboard, per-product trend charts, and the raw Rainforest payload, in English or Chinese.

Scope is deliberately tight: **one Rainforest call per day to discover the top N, plus N product snapshot calls** — designed to fit a 500 reqs/month budget on Rainforest's Starter plan with headroom for review pulls later.

```
                                  ┌─────────────────────────┐
                                  │   Rainforest API        │
                                  │   type=search · product │
                                  └────────────┬────────────┘
                                               │
   watchlists/<slug>.yml ──┐                   │
   (anchor + tracker)      │                   │
                           ▼                   ▼
                       sync           run-leaderboard
                           │                   │
                           ▼                   ▼
                              Supabase Postgres
                              (search_results, product_snapshots,
                               tracker_runs, fetch_runs)
                                       ▲
                                       │
                              web/  Next.js dashboard
                              (Mail.app shell + leaderboard view, en+zh)
```

## Prerequisites

- Node 20+
- A Supabase project (free tier is fine)
- A Rainforest API key (Starter plan ≥ ~$50/mo for daily ops)

## Setup

```bash
git clone https://github.com/AronLEEdev/amazon-radar.git
cd amazon-radar
npm install

cp .env.example .env
# Fill in RAINFOREST_API_KEY and DATABASE_URL.
# DATABASE_URL: Supabase Project Settings → Database → Session pooler (port 5432).
# Append ?sslmode=require.

npm run migrate          # 001_init.sql, 002_discovery.sql, 003_leaderboard.sql
```

## Daily operation — leaderboard tracker

The default daily entry point is `npm run leaderboard`. One command, one search call, ≤ N product calls, idempotent within a business day.

```bash
npm run leaderboard                       # default: first watchlist with a tracker block
SLUG=pet-backpack npm run leaderboard     # explicit watchlist
FORCE=1 npm run leaderboard               # bypass per-day idempotency
```

What it does:

1. Resolves the tracker config from the YAML.
2. Looks up `tracker_runs` to see whether today's leaderboard has already been pulled (in the tracker's timezone). If yes → skip the search, ≤ 0 reqs.
3. Otherwise calls Rainforest `type=search`, stores the SERP into `search_results` with both `rank` (raw page position, sponsored included) and `organic_rank` (sponsored-aware index).
4. Computes the active set: today's top-N organic ∪ ASINs in the last `cooldown_days` that were on the leaderboard. Cap at `max_targets_per_day`.
5. For any target that doesn't yet have a snapshot for today (in tracker timezone), calls `type=product` and writes `product_snapshots`.
6. Records the leaderboard digest + run ids in `tracker_runs`.

Daily cost: **1 search + ≤ 10 product + 0–5 cooldown** ≈ 11–15 reqs (~330–460/mo).

Other commands:

```bash
npm run sync             # validate watchlists/*.yml and reconcile DB metadata only
npm run search           # ad-hoc: type=search across all keywords[]; writes memberships
npm run category         # ad-hoc: type=category per category_id; writes memberships
npm run snapshot         # ESCAPE HATCH: snapshot every active membership ever discovered
                         # — expensive, not the daily flow. Use TOP_N to bound.
```

Cron (macOS, daily 09:00 local):

```cron
0 9 * * * cd /Users/<you>/path/to/amazon-radar && /usr/local/bin/node ./node_modules/.bin/tsx bin/run-leaderboard.ts >> logs/cron.log 2>&1
```

Adjust the node path with `which node`. Cron retries are safe — the run is idempotent within a business day.

## Configuring a watchlist

Each `*.yml` in `watchlists/` describes one niche. The `tracker:` block opts the watchlist into the daily leaderboard flow.

```yaml
slug: pet-backpack
name: Pet Backpack
description: Pet carrier backpacks (cat / small dog) on amazon.com
amazon_domain: amazon.com

tracker:
  mode: search                       # 'search' (today) | 'category' (future)
  query: "pet backpack"              # required when mode=search
  top_n: 10
  cooldown_days: 3                   # re-snapshot ASINs on the board in last N days
  max_targets_per_day: 15            # hard cap to bound Rainforest cost
  timezone: America/Los_Angeles      # IANA name; sets the business day boundary

# Optional — used by ad-hoc `npm run search` / `npm run category`, NOT the daily flow.
keywords:
  - pet backpack
categories:
  - id: "2975312011"
    name: Cat Carriers & Travel Products
    types: [bestsellers, new_releases, movers_and_shakers]
```

Full schema reference: [`watchlists/README.md`](watchlists/README.md).

## Design notes

The daily flow is engineered around five concerns that are easy to get wrong:

| # | Concern | Mitigation |
|---|---|---|
| **P1** | Same-day re-runs double-spend | `tracker_runs` row keyed on `(watchlist_id, tracker_identity, business_day)`. Re-runs short-circuit. `FORCE=1` is the only bypass. Snapshot step is also de-duped per target per business day. |
| **P2** | Membership history pollutes daily targets | Leaderboard run **never writes** `product_watchlist_memberships`. The active set is recomputed each day from `search_results`. Membership table stays clean for `manual_asin` curation. |
| **P3** | Two trackers sharing a query cross-contaminate | Cooldown lookup is keyed on `tracker_identity = "<watchlist_id>:<mode>:<query\|category_id>"`, not the keyword alone. |
| **P4** | Sponsored slots break rank contiguity | `search_results` stores both `rank` (raw page position) and `organic_rank` (sponsored-skipped 1..N). Leaderboard, cooldown, and UI use `organic_rank`. |
| **P5** | Local clock vs Amazon vs server timezone | Tracker has an explicit `timezone:` (default `America/Los_Angeles`). All "today / yesterday / cooldown" arithmetic uses a Postgres `business_day(ts, tz)` helper — never the OS clock or implicit UTC. |

Backfill caveat: rows ingested before migration `003` had `organic_rank` set to the stored `rank` column (which was the raw page position from the original `bin/run-search.ts`). Old rows can therefore have non-contiguous organic ranks. New runs going forward produce contiguous ranks.

## Schema

| Table | Purpose |
|---|---|
| `watchlists` | One row per YAML file, keyed by `slug` |
| `products` | One row per `(asin, amazon_domain)` |
| `product_watchlist_memberships` | Many-to-many between watchlists and products, with provenance (`source_type` ∈ `manual_asin`, `keyword_search`, `category_rank`, ...). Leaderboard run does not touch this table. |
| `product_snapshots` | Time-series price / rating / reviews / BSR per `(asin, amazon_domain, captured_at)`; full Rainforest payload in `raw jsonb` |
| `search_results` | Per-run SERP rows: `(watchlist_id, keyword, amazon_domain, rank, organic_rank, asin, sponsored, …)` |
| `category_rank_snapshots` | Per-run category browse rows |
| `tracker_runs` | Phase-2.5 idempotency anchor — one row per `(watchlist_id, tracker_identity, business_day)` |
| `fetch_runs` | Per-API-call accounting; `source` ∈ `product`, `search`, `category`, `reviews`, `offers`, `sync` |
| `fetch_errors` | Per-target failures, linked to a run |

Full DDL: [`migrations/`](migrations/) — applied in lexical order, tracked in `_migrations`.

## Useful queries

```sql
-- today's leaderboard (organic) for pet-backpack
select organic_rank, asin, title, ratings_total
  from search_results sr
  join (select id from watchlists where slug = 'pet-backpack') w on w.id = sr.watchlist_id
 where business_day(captured_at, 'America/Los_Angeles') = business_day(now(), 'America/Los_Angeles')
   and organic_rank is not null
 order by organic_rank;

-- rank delta vs yesterday
with t as (
  select asin, organic_rank as today_rank from search_results
   where keyword = 'pet backpack' and organic_rank is not null
     and business_day(captured_at, 'America/Los_Angeles')
       = business_day(now(), 'America/Los_Angeles')
), y as (
  select asin, organic_rank as yest_rank from search_results
   where keyword = 'pet backpack' and organic_rank is not null
     and business_day(captured_at, 'America/Los_Angeles')
       = business_day(now() - interval '1 day', 'America/Los_Angeles')
)
select coalesce(t.asin, y.asin) asin, t.today_rank, y.yest_rank
  from t full outer join y using (asin)
 order by today_rank nulls last;

-- daily request budget audit
select business_day(started_at, 'America/Los_Angeles') as d, source, sum(request_count)
  from fetch_runs
 where source in ('search', 'product', 'category', 'reviews')
   and started_at > now() - interval '14 days'
 group by 1, 2
 order by 1 desc, 2;

-- latest snapshot per product
select distinct on (asin, amazon_domain)
       asin, amazon_domain, captured_at, price_amount, rating, reviews_count, bsr_rank
  from product_snapshots
 order by asin, amazon_domain, captured_at desc;
```

## Web UI

A read-only Next.js dashboard lives under [`web/`](web/).

```bash
cd web
npm install
# .env.local is symlinked to ../.env, so DATABASE_URL is shared with the scraper
npm run dev          # http://localhost:3210
```

- Mail.app two-pane shell: grouped product list (left) + tabbed detail (right).
- Today's leaderboard renders at the top of the home view: rank, ↑/↓ delta vs yesterday, "new today" / "↓ off" badges, mini metrics + thumbnail. Click any row → existing product detail.
- Tabs in detail: **Trends** (4 sparklines) · **Snapshots** · **Raw JSON** · **Memberships**.
- shadcn-light theme with rounded-xl cards, blue/violet accents.
- `next-intl` powers `en` + `zh` (toggle top-right; URL becomes `/zh` for Chinese).

Routes:

| URL | What it shows |
|---|---|
| `/` | Leaderboard(s) + watchlist rollup cards + recent runs |
| `/?asin=B07...&domain=amazon.com` | Product detail (Trends tab) |
| `/?asin=...&domain=...&tab=snapshots\|raw\|memberships` | Deep-link to a specific tab |
| `/zh`, `/zh?asin=...` | Same in Chinese |

## Maintenance

Whenever a version is pushed:

- **Update [`CHANGELOG.md`](CHANGELOG.md)** under the corresponding `[X.Y.Z]` heading (or `[Unreleased]` for in-flight work). Follow [Keep a Changelog](https://keepachangelog.com/) sections (Added / Changed / Removed / Fixed / Security).
- **Update this README** if any of the following changed: schema, daily flow, env vars, npm scripts, design principles (P1–P5), or the YAML schema.
- Bump `version` in `package.json` and `web/package.json` together. The repo follows [Semantic Versioning](https://semver.org/) — minor bump for additive changes, major for incompatible schema or CLI changes.

## Roadmap

- **Phase 3** — review ingestion (`type=reviews`) + LLM negative-theme clustering across the leaderboard.
- **Phase 4** — offer / buybox tracking (`type=offers`) for ASINs with active price wars.
- **Phase 5** — opportunity score (combining BSR trajectory, review velocity, negative-theme density) + scoring view in the dashboard.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## License

TBD.
