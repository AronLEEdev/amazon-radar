# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [Semantic Versioning](https://semver.org/).
Entries are grouped by **major version**; minor/patch work is recorded in the
`[Unreleased]` section until the next major bump.

## [Unreleased]

### Added — Phase 2 discovery
- `bin/run-search.ts` (`npm run search`): for each watchlist keyword, calls Rainforest `type=search` and stores top-N organic hits in `search_results`; auto-adds `product_watchlist_memberships` rows with `source_type='keyword_search'` and `source_value=<keyword>`.
- `bin/run-category.ts` (`npm run category`): for each watchlist category, calls Rainforest `type=category` and stores the default browse results in `category_rank_snapshots`; auto-adds memberships with `source_type='category_rank'`. (Note: Rainforest's amazon.com endpoints don't expose true `bestsellers/new_releases/movers_and_shakers` lists keyed by Amazon node id, so the YAML's `types:` field is currently folded onto a single `bestsellers` row per category.)
- Migration `002_discovery.sql` adds `search_results` and `category_rank_snapshots`.
- `bin/snapshot.ts` automatically picks up newly-discovered ASINs on the next run because they appear in `product_watchlist_memberships`.
- Showcase result: pet-backpack expanded from 10 manual ASINs to 61 distinct `(asin, amazon_domain)` targets across 50 keyword hits + 20 category hits + 13 manual rows.

### Added
- Read-only Next.js 15 dashboard under `web/`:
  - Mail.app two-pane shell — grouped+dense left list, tabbed right pane (Trends / Snapshots / Raw / Memberships).
  - Per-watchlist rollup cards + recent runs as the empty-state home.
  - 4 sparkline charts (price, reviews, rating, BSR-inverted) on Trends; raw JSON viewer with copy.
  - Brand mark + DataPulse-flavored shadcn-light theme (blue `#3b82f6`, violet `#8b5cf6`, rounded-xl cards, soft borders).
  - Deep-linkable selection and tabs via URL search params (no client state).
- `next-intl` i18n with `en` and `zh` locale bundles; `/zh` prefix for Chinese, default English unprefixed.
- Showcase niche `pet-backpack` with 10 real ASINs from Rainforest type=search "pet backpack" — Texsens, Morpilot, Pecute, Cawypety, plus emerging listings.

## [0.1.0] - 2026-05-10

### Added
- Initial MVP: niche-agnostic Amazon product radar.
- YAML watchlists in `watchlists/*.yml` with `asins`, `keywords`, `categories` fields.
- Composite product key `(asin, amazon_domain)` to support multiple marketplaces per ASIN.
- `product_watchlist_memberships` with provenance (`source_type` + `source_value`) so future keyword/category discovery can co-exist with manual entries.
- `fetch_runs.source` distinguishes `product` / `search` / `category` / `reviews` / `offers` / `sync` runs; tracks `request_count`.
- Daily snapshot pipeline: `sync-watchlists` → `snapshot` (Rainforest `type=product`) → Supabase Postgres.
- Tiny migration runner (`src/db.ts migrate`) that records applied files in `_migrations`.
- Setup, schema, and operations docs in `README.md`.

### Versioning rules

- **0.x.0** during pre-stable iteration; bump the minor for any breaking schema change.
- **1.0.0** when the dashboard or first AI analyzer ships and the data model is considered stable.
- **Major bumps** (1.x → 2.0, etc.) reserved for incompatible schema/API changes; document migration steps in the entry.
