# Googleマップ企業リスト作成システム（MVP）

Google Maps API を使い、エリア・キーワード・半径を指定して店舗・企業情報を最大20件取得し、一覧表示と TSV コピーができる Web アプリです。

## プロジェクト概要

- **フロント**: Next.js App Router + TypeScript + Tailwind CSS
- **バックエンド**: Next.js API Routes（サーバー側で Google Maps API / Supabase を呼び出し）
- **DB**: Supabase（検索履歴・結果・除外 place_id）
- **デプロイ**: Vercel 前提

認証・決済・外部連携は MVP では含みません。仮ユーザー ID（`demo-user`）で動作します。

## 使用 API

| API | 用途 |
| --- | --- |
| Geocoding API | エリア名から緯度・経度を取得 |
| Places API Text Search | キーワードと位置・半径で店舗候補を検索 |
| Places API Details | 営業時間・電話・Web サイトなど詳細を取得 |

Google Cloud Console で上記 API を有効化し、課金・API キー制限（HTTP リファラー / IP 等）を設定してください。

## 必要な環境変数

`.env.local` に以下を設定します（値は空のままコミットしないでください）。

```env
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- `GOOGLE_MAPS_API_KEY` … サーバー側のみ（API Route / `lib/googleMaps.ts`）
- `SUPABASE_SERVICE_ROLE_KEY` … **サーバー側のみ**。クライアントコンポーネントや `page.tsx` へ渡さないこと
- `NEXT_PUBLIC_*` … 将来のクライアント用。MVP では主に URL 参照用

テンプレートは `.env.example` をコピーして作成してください。

```bash
cp .env.example .env.local
```

## Supabase SQL の実行方法

1. [Supabase](https://supabase.com/) でプロジェクトを作成
2. ダッシュボードの **SQL Editor** を開く
3. リポジトリ内の `supabase/schema.sql` の内容を貼り付けて実行
4. `.env.local` に Project URL と API キーを設定

## ローカル起動方法

```bash
npm install
cp .env.example .env.local
# .env.local に実際の値を入力
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 動作確認手順

1. Supabase で `schema.sql` を実行済みであること
2. `.env.local` に Google Maps API キーと Supabase キーを設定
3. `npm run dev` で起動
4. フォームに例を入力して検索  
   - エリア: `新宿`  
   - キーワード1: `美容室`  
   - キーワード2: `髪質改善`（任意）  
   - 半径: `2000m`
5. 最大20件がテーブル表示されること
6. 「TSVをコピー」でスプレッドシートに貼り付けできること
7. **同じ条件で再検索**し、前回表示した店舗が出ないこと（`excluded_places`）
8. すべて除外された場合は「新しい検索結果がありません」メッセージが表示されること

## 注意事項

- **API キー・秘密鍵をソースコードや GitHub に含めない**こと。必ず `.env.local` で管理し、`.env.local` は `.gitignore` に含めています
- `SUPABASE_SERVICE_ROLE_KEY` は RLS をバイパスできる強力なキーです。Vercel の Environment Variables にのみ設定し、クライアントに露出させないでください
- Google Maps API は従量課金です。Text Search + Details を最大20件分呼ぶため、テスト時はリクエスト数に注意してください
- 本番では API キーにドメイン制限・API 制限を必ず設定してください

## ディレクトリ構成（主要）

```
app/
  page.tsx
  api/places/search/route.ts
components/
  SearchForm.tsx
  ResultsTable.tsx
  CopyTsvButton.tsx
  SearchPage.tsx
lib/
  constants.ts
  googleMaps.ts
  supabaseAdmin.ts
  tsv.ts
  types.ts
supabase/
  schema.sql
```

## API

`POST /api/places/search`

リクエスト例:

```json
{
  "area": "新宿",
  "keyword1": "美容室",
  "keyword2": "髪質改善",
  "radiusM": 2000
}
```

レスポンス: `status` が `success` | `no_results` | `error` の JSON（詳細は実装参照）。
