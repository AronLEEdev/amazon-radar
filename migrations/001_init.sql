-- 001_init.sql — Amazon Radar initial schema
-- Idempotent-ish: safe to re-run on a fresh DB; for live DBs, use a migration runner.

create table if not exists watchlists (
  id              bigserial primary key,
  slug            text not null unique,
  name            text not null,
  description     text,
  amazon_domain   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists products (
  asin            text not null,
  amazon_domain   text not null,
  title           text,
  brand           text,
  main_category   text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (asin, amazon_domain)
);

create table if not exists fetch_runs (
  id              bigserial primary key,
  source          text not null check (source in
                    ('product','search','category','reviews','offers','sync')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  request_count   integer not null default 0,
  asin_count      integer not null default 0,
  success_count   integer not null default 0,
  error_count     integer not null default 0,
  notes           text
);

create table if not exists product_watchlist_memberships (
  id                bigserial primary key,
  watchlist_id      bigint not null references watchlists(id) on delete cascade,
  asin              text not null,
  amazon_domain     text not null,
  source_type       text not null check (source_type in
                      ('manual_asin','keyword_search','category_rank','related','manual_other')),
  source_value      text,
  discovered_run_id bigint references fetch_runs(id) on delete set null,
  added_at          timestamptz not null default now(),
  removed_at        timestamptz
);
-- One active+source tuple per product per watchlist
create unique index if not exists product_watchlist_memberships_uniq
  on product_watchlist_memberships
  (watchlist_id, asin, amazon_domain, source_type, coalesce(source_value, ''));
create index if not exists product_watchlist_memberships_active_asin
  on product_watchlist_memberships (asin, amazon_domain) where removed_at is null;
create index if not exists product_watchlist_memberships_active_wl
  on product_watchlist_memberships (watchlist_id) where removed_at is null;

create table if not exists product_snapshots (
  id              bigserial primary key,
  asin            text not null,
  amazon_domain   text not null,
  captured_at     timestamptz not null default now(),
  price_amount    numeric(12,2),
  price_currency  text,
  rating          numeric(3,2),
  reviews_count   integer,
  bsr_rank        integer,
  bsr_category    text,
  buybox_seller   text,
  in_stock        boolean,
  raw             jsonb not null,
  foreign key (asin, amazon_domain) references products(asin, amazon_domain) on delete cascade
);
create index if not exists product_snapshots_by_product
  on product_snapshots (asin, amazon_domain, captured_at desc);

create table if not exists fetch_errors (
  id              bigserial primary key,
  run_id          bigint references fetch_runs(id) on delete cascade,
  asin            text,
  amazon_domain   text,
  http_status     integer,
  message         text,
  created_at      timestamptz not null default now()
);
create index if not exists fetch_errors_by_run on fetch_errors (run_id);
