-- Googleマップ営業リスト作成システム

create extension if not exists "pgcrypto";

-- 検索実行履歴
create table if not exists search_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  area text not null,
  keyword1 text not null,
  keyword2 text,
  radius_m integer not null,
  latitude double precision,
  longitude double precision,
  result_count integer not null default 0,
  status text not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_search_requests_user_id on search_requests (user_id);
create index if not exists idx_search_requests_created_at on search_requests (created_at desc);

-- 検索結果の詳細
create table if not exists search_results (
  id uuid primary key default gen_random_uuid(),
  search_request_id uuid not null references search_requests (id) on delete cascade,
  user_id text not null,
  place_id text not null,
  name text not null,
  address text,
  rating numeric,
  review_count integer,
  opening_hours text,
  phone_number text,
  website_url text,
  google_maps_url text,
  latitude double precision,
  longitude double precision,
  email text,
  international_phone_number text,
  business_status text,
  category text,
  primary_type text,
  closed_days text,
  reviews_text text,
  editorial_summary text,
  price_level text,
  photo_names text,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_search_results_search_request_id on search_results (search_request_id);
create index if not exists idx_search_results_place_id on search_results (place_id);

-- 一度表示済みの place_id（重複排除）
create table if not exists excluded_places (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  place_id text not null,
  first_seen_search_request_id uuid references search_requests (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, place_id)
);

create index if not exists idx_excluded_places_user_id on excluded_places (user_id);

-- 既存テーブル向けマイグレーション（重複実行可）
alter table search_results add column if not exists email text;
alter table search_results add column if not exists international_phone_number text;
alter table search_results add column if not exists business_status text;
alter table search_results add column if not exists category text;
alter table search_results add column if not exists primary_type text;
alter table search_results add column if not exists closed_days text;
alter table search_results add column if not exists reviews_text text;
alter table search_results add column if not exists editorial_summary text;
alter table search_results add column if not exists price_level text;
alter table search_results add column if not exists photo_names text;
