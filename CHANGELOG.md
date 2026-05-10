# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [Semantic Versioning](https://semver.org/).
Entries are grouped by **major version**; minor/patch work is recorded in the
`[Unreleased]` section until the next major bump.

## [Unreleased]

### Added — Phase 2.5 leaderboard tracker (the new daily flow)
- New `bin/run-leaderboard.ts` (`npm run leaderboard`) — single command: search → resolve targets → snapshot. Replaces `bin/snapshot.ts` as the daily entry point for niches with a `tracker:` block. `bin/snapshot.ts` is retained as an "expensive escape hatch".
- New `tracker:` block on watchlist YAML — `mode` (`search` for now, `category` reserved), `query`, `top_n` (default 10), `cooldown_days` (default 3), `max_targets_per_day` (default 15), `timezone` (default `America/Los_Angeles`).
- Migration `003_leaderboard.sql` adds:
  - `search_results.organic_rank` (sponsored-skipped 1..N) alongside the existing `rank` (raw page position) — addresses the rank-contiguity issue introduced by sponsored slots in the SERP.
  - `business_day(ts, tz)` SQL function — single source of truth for "today / yesterday / cooldown" boundaries; respects per-tracker timezone.
  - `tracker_runs` table — idempotency anchor keyed on `(watchlist_id, tracker_identity, business_day)`. Same-day re-runs short-circuit; only `FORCE=1` bypasses.
- `src/leaderboard.ts` helpers: `resolveLeaderboardTargets`, `targetsMissingTodaySnapshot`, `getLeaderboardWithDelta`, `upsertTrackerRun`. All scoped on `watchlist_id` so two trackers sharing a query don't cross-contaminate.
- `searchProducts()` now exposes both `rank` (raw page position from Rainforest) and `organic_rank` (1-based index after filtering sponsored). `bin/run-search.ts` updated to populate both columns.
- Web UI: new `<Leaderboard>` component on the home view — today's top-N organic with rank, ↑/↓ delta vs yesterday, "new today" / "↓ off" / cooldown badges, mini metrics, Amazon outbound link. Loads via `getLeaderboard()` + `getTrackers()` (which read the YAML for tracker config to avoid fragile DB string parsing). New `leaderboard.*` keys in `messages/en.json` and `messages/zh.json`.
- `web/lib/watchlists.ts` — small server-only YAML loader for tracker config.
- README rewritten around the leaderboard flow; added explicit P1–P5 design notes (idempotency, membership separation, tracker isolation, organic vs raw rank, timezone correctness) and a maintenance section reminding you to update README + CHANGELOG on every release.

### Notes
- Leaderboard runs do **not** write `product_watchlist_memberships`. The active set is recomputed from `search_results` each day, so historical search hits don't leak into future daily targets.
- Backfill quirk: rows in `search_results` ingested before migration `003` had `organic_rank` set to the previously-stored `rank` (which was raw page position). New rows produced by the leaderboard flow have contiguous organic ranks; old rows may not.

### Deprecated
- `npm run snapshot` is no longer the recommended daily flow for niches with a `tracker:` block. Still useful as an escape hatch (`TOP_N=N npm run snapshot` to bound cost).

### Added — earlier in this release cycle
- `TOP_N` and `SLUG` env vars for `npm run snapshot`. Targets are ordered (never-snapshotted → manual → discovered, then by review count) so a `TOP_N=20` daily run hits the highest-value 20 first. Lets the daily snapshot fit predictably inside a Rainforest plan budget.
- `bin/sync-watchlists.ts` now soft-removes memberships of watchlists whose YAML file has been deleted (orphan sweep). Watchlist row stays for analytics history; only its active memberships are zeroed out.

### Removed
- `watchlists/bike-accessories.yml` (Week-1 placeholder niche). The `bike-accessories` watchlist row remains in the DB; orphan sweep zeroed its memberships.

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
