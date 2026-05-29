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

-- 検索進捗（user_id + 都道府県 + キーワード単位で再開位置を保持）
create table if not exists search_progress (
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  area text not null,
  keyword1 text not null,
  keyword2 text null,
  keyword2_normalized text not null default '',
  last_latitude double precision null,
  last_longitude double precision null,
  center_latitude double precision null,
  center_longitude double precision null,
  current_radius_km integer not null default 1,
  current_angle integer not null default 0,
  current_ring_index integer not null default 0,
  current_leg_length integer not null default 1,
  total_saved_count integer not null default 0,
  is_exhausted boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint search_progress_pkey primary key (id),
  constraint search_progress_user_query_unique unique (user_id, area, keyword1, keyword2_normalized)
);

create index if not exists idx_search_progress_user_id on search_progress (user_id);

-- 既存テーブル向けマイグレーション（重複実行可）
alter table search_progress add column if not exists current_leg_length integer not null default 1;
comment on column search_progress.current_radius_km is 'スパイラル: current_step';
comment on column search_progress.current_angle is 'スパイラル: current_direction (0=E,1=N,2=W,3=S)';
comment on column search_progress.current_ring_index is 'スパイラル: current_leg_progress';
comment on column search_progress.current_leg_length is 'スパイラル: current_leg_length';

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

-- Googleマップツール利用履歴（共通ダッシュボード連携）
create table if not exists tool_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tool_key text not null,
  tool_name text not null,
  credit_cost integer not null default 0,
  credit_before integer not null,
  credit_after integer not null,
  status text not null,
  message text,
  search_request_id uuid references search_requests (id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_tool_usage_logs_user_id on tool_usage_logs (user_id);
create index if not exists idx_tool_usage_logs_created_at on tool_usage_logs (created_at desc);
create index if not exists idx_tool_usage_logs_tool_key on tool_usage_logs (tool_key);

-- user_id は Supabase Auth の user.id（uuid 文字列）を text で保存
comment on column search_requests.user_id is 'Supabase Auth user.id';
comment on column search_results.user_id is 'Supabase Auth user.id';
comment on column excluded_places.user_id is 'Supabase Auth user.id';

-- 検索ジョブ（非同期検索・進捗管理）
create table if not exists search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  search_request_id uuid references search_requests (id) on delete cascade,
  area text not null,
  keyword1 text not null,
  keyword2 text,
  radius_m integer not null,
  status text not null default 'pending',
  current_step text,
  fetched_count integer not null default 0,
  saved_count integer not null default 0,
  target_count integer not null default 200,
  error_message text,
  credit_consumed boolean not null default false,
  access_token text,
  credit_cost integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone
);

-- 検索ジョブ進捗統計（2025-05 追加）
alter table search_jobs add column if not exists candidate_count integer not null default 0;
alter table search_jobs add column if not exists duplicate_count integer not null default 0;
alter table search_jobs add column if not exists previously_saved_count integer not null default 0;
alter table search_jobs add column if not exists search_point_count integer not null default 0;
alter table search_jobs add column if not exists page_fetch_count integer not null default 0;
alter table search_jobs add column if not exists current_location_label text;

create index if not exists idx_search_jobs_user_id on search_jobs (user_id);
create index if not exists idx_search_jobs_status on search_jobs (status);
create index if not exists idx_search_jobs_search_request_id on search_jobs (search_request_id);

-- 店舗AIチャット履歴
create table if not exists place_ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  place_id text not null,
  search_result_id uuid references search_results (id) on delete set null,
  question text not null,
  answer text not null,
  credit_cost integer not null default 2,
  used_website boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_place_ai_chats_user_id on place_ai_chats (user_id);
create index if not exists idx_place_ai_chats_place_id on place_ai_chats (place_id);

-- 店舗Webサイト本文キャッシュ（24時間）
create table if not exists place_website_cache (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,
  website_url text not null,
  page_text text,
  fetched_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_place_website_cache_fetched_at on place_website_cache (fetched_at desc);
