# Googleマップ営業リスト作成システム

Google Maps API で店舗情報を取得し、営業リストとして一覧表示・TSV コピーができる Web アプリです。

## プロジェクト構成

| 役割 | 説明 |
| --- | --- |
| **共通ダッシュボード**（別プロジェクト） | ログイン・ユーザー管理・クレジット残高・消費 |
| **本ツール**（このリポジトリ） | Google Maps 検索・Googleマップ専用 Supabase への保存 |

本ツールは **`profiles.credit` を直接参照・更新しません**。残高確認・消費は共通ダッシュボードの API 経由です。

## 認証（一時 access_token）

ダッシュボードの「ツールを開く」から `?access_token=xxxxx` で遷移します。

1. 初回表示時に URL から `access_token` を取得
2. `sessionStorage` キー `tool_access_token` に保存（**localStorage は使わない**）
3. URL から `access_token` クエリを削除（`history.replaceState`）
4. `GET {DASHBOARD}/api/tools/token/verify` でユーザー・残高・`credit_cost` を取得
5. 検索 API には `Authorization: Bearer <access_token>` を付与

- **パスワードは扱いません**
- `user_id` / `credit_cost` をフロントから送りません

## クレジット

- 1回の検索成功（新規1件以上取得・保存成功・消費 API 成功）で **30 Credit** 消費
- 消費量の表示用定数: `lib/constants.ts` の `GOOGLE_MAP_SEARCH_CREDIT_COST`
- **実際の減算額**はダッシュボード側が `tools` テーブルから決定（本ツールから `credit_cost` は送らない）

### 共通ダッシュボード API

| メソッド | パス |
| --- | --- |
| GET | `{DASHBOARD_BASE_URL}/api/tools/token/verify` |
| POST | `{DASHBOARD_BASE_URL}/api/credits/consume` |

本ツールの `/api/tools/verify` は上記 verify をサーバー経由でプロキシします（CORS 回避）。

消費リクエスト body:

```json
{
  "tool_key": "google_map_leads",
  "external_request_id": "{search_request_id}"
}
```

`external_request_id` に `search_requests.id` を渡し、二重消費を防止します。

## 必要な環境変数

`.env.local`（GitHub に上げない）:

```env
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DASHBOARD_BASE_URL=
NEXT_PUBLIC_TOOL_KEY=
```

- `NEXT_PUBLIC_DASHBOARD_BASE_URL` … 共通ダッシュボードのオリジン（例: `https://dashboard.example.com`）
- `NEXT_PUBLIC_TOOL_KEY` … 省略時は `google_map_leads`
- `SUPABASE_SERVICE_ROLE_KEY` … **Googleマップ専用 Supabase** のみ（検索履歴保存用）

```bash
cp .env.example .env.local
```

## Googleマップ専用 Supabase SQL

`supabase/schema.sql` を **Googleマップ専用** Supabase プロジェクトで実行してください。

主なテーブル:

- `search_requests`
- `search_results`
- `excluded_places`（`user_id` + `place_id` ユニーク）

`tool_usage_logs` は本ツールでは使用しません（クレジット履歴はダッシュボード側）。

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 動作確認手順

1. ダッシュボードでログインし、Credit ≥ 30 を確認
2. `.env.local` にダッシュボード URL・Googleマップ用 Supabase・Maps API キーを設定
3. 本ツールを開き「現在のクレジット」がダッシュボードと一致すること
4. 検索成功 → 結果表示・残高が 30 減ること
5. 新規0件の再検索 → 結果なし・**Credit 消費なし**
6. 未ログイン / 残高不足 → Google API 未実行
7. 保存後に消費 API が失敗した場合 → **結果を表示せず**エラー表示

## クレジット消費フロー（サーバー）

1. `Authorization: Bearer` でトークン検証（verify）
2. `credit` &lt; `tool.credit_cost` なら終了
4. Google Maps API 実行
5. 重複除外後、新規0件なら終了（消費なし）
6. Googleマップ専用 Supabase に保存
7. ダッシュボード `POST /api/credits/consume`（`external_request_id` = `search_request_id`）
8. 消費成功時のみ結果を JSON で返却

実装: `lib/dashboardCredits.ts` / `app/api/places/search/route.ts`

## セキュリティ

- API キー・`service_role` をリポジトリに含めない
- `profiles` / ダッシュボード DB への直接書き込みは行わない
- `user_id` は Auth セッションから取得

## ディレクトリ（主要）

```
lib/toolToken.ts          # URL / sessionStorage の access_token
lib/dashboardCredits.ts   # verify / consume API
lib/toolVerify.ts         # 検証レスポンスのパース
app/api/tools/verify/route.ts
components/ToolAuthBar.tsx
lib/supabaseAdmin.ts      # Googleマップ専用 DB
app/api/places/search/route.ts
app/api/user/credit/route.ts
```
