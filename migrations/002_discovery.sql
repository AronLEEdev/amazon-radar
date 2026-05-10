-- 002_discovery.sql — Phase 2 discovery tables
-- search_results       : Rainforest type=search outputs per (watchlist, keyword, domain, run)
-- category_rank_snapshots: Rainforest type=bestsellers / new_releases / movers_and_shakers
-- Both feed product_watchlist_memberships with source_type = keyword_search / category_rank.

create table if not exists search_results (
  id              bigserial primary key,
  run_id          bigint references fetch_runs(id) on delete cascade,
  watchlist_id    bigint references watchlists(id) on delete cascade,
  keyword         text not null,
  amazon_domain   text not null,
  captured_at     timestamptz not null default now(),
  rank            integer not null,           -- 1-based position
  asin            text not null,
  sponsored       boolean,
  title           text,
  brand           text,
  price_amount    numeric(12,2),
  price_currency  text,
  rating          numeric(3,2),
  reviews_count   integer,
  image_url       text,
  raw             jsonb not null
);
create index if not exists search_results_keyword
  on search_results (keyword, amazon_domain, captured_at desc);
create index if not exists search_results_watchlist
  on search_results (watchlist_id, captured_at desc);
create index if not exists search_results_asin
  on search_results (asin, amazon_domain, captured_at desc);

create table if not exists category_rank_snapshots (
  id              bigserial primary key,
  run_id          bigint references fetch_runs(id) on delete cascade,
  watchlist_id    bigint references watchlists(id) on delete cascade,
  category_id     text not null,
  category_name   text,
  amazon_domain   text not null,
  list_type       text not null check (list_type in
                    ('bestsellers','new_releases','movers_and_shakers')),
  captured_at     timestamptz not null default now(),
  rank            integer not null,
  asin            text not null,
  title           text,
  price_amount    numeric(12,2),
  price_currency  text,
  rating          numeric(3,2),
  reviews_count   integer,
  image_url       text,
  raw             jsonb not null
);
create index if not exists category_rank_lookup
  on category_rank_snapshots (category_id, amazon_domain, list_type, captured_at desc);
create index if not exists category_rank_watchlist
  on category_rank_snapshots (watchlist_id, captured_at desc);
create index if not exists category_rank_asin
  on category_rank_snapshots (asin, amazon_domain, captured_at desc);
