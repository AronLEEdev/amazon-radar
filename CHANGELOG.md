# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [Semantic Versioning](https://semver.org/).
Entries are grouped by **major version**; minor/patch work is recorded in the
`[Unreleased]` section until the next major bump.

## [Unreleased]

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
