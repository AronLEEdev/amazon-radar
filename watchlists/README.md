# Watchlists

Each `*.yml` file in this directory defines one niche / topic that Amazon Radar tracks.

## File schema

```yaml
slug: my-niche                # required, kebab-case lowercase, unique across all files
name: My Niche                # required, human-readable
description: optional         # free text
amazon_domain: amazon.com     # optional default for this watchlist; per-ASIN override wins

asins:                        # ingested by sync-watchlists as source_type=manual_asin
  - B0XXXXXXXX                # 10-char ASIN, uppercase letters/digits
  - asin: B0YYYYYYYY
    amazon_domain: amazon.co.uk

keywords:                     # Phase 2: drives type=search discovery
  - example keyword

categories:                   # Phase 2: drives type=bestsellers/new_releases/movers
  - id: "3403201"             # Amazon category id (string or number)
    name: Cycling Accessories
    types: [bestsellers, new_releases, movers_and_shakers]
```

## Lifecycle

- Add an ASIN here → `npx tsx bin/sync-watchlists.ts` (or just run snapshot, it auto-syncs) → row appears in `product_watchlist_memberships` with `source_type='manual_asin'`.
- Remove an ASIN → next sync soft-removes the membership (`removed_at = now()`). Historical snapshots stay.
- Re-add later → membership row is re-activated (`removed_at` cleared).

## Conventions

- One slug per file. Filename ≠ slug (slug is the DB key).
- Don't reuse a slug after deletion; future analytics rely on stable slugs.
- Same ASIN can live in multiple watchlists — each gets its own membership row.
- Same ASIN in multiple marketplaces is supported via the per-ASIN `amazon_domain` form; `(asin, amazon_domain)` is the product key.
