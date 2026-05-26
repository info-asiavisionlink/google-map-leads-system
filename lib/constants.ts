/** 1回の検索成功時に消費するクレジット数 */
export const GOOGLE_MAP_SEARCH_CREDIT_COST = 30;

export const TOOL_KEY = "google_map_leads";
export const TOOL_NAME = "Googleマップ営業リスト作成";

export const MAX_RESULTS = 20;

export const RADIUS_OPTIONS = [500, 1000, 2000, 3000, 5000] as const;

export type RadiusM = (typeof RADIUS_OPTIONS)[number];

export const TOKEN_AUTH_EXPIRED_MESSAGE =
  "認証が切れています。ダッシュボードから再度ツールを開いてください。";

export const LOGIN_ERROR_MESSAGE =
  "ログインに失敗しました。ダッシュボードから再度ツールを開いてください。";

export const CREDIT_FETCH_FAILED_MESSAGE =
  "クレジット情報の取得に失敗しました。ダッシュボードから再度ツールを開くか、しばらくしてからお試しください。";

/** @deprecated トークン認証では TOKEN_AUTH_EXPIRED_MESSAGE を使用 */
export const AUTH_REQUIRED_MESSAGE = TOKEN_AUTH_EXPIRED_MESSAGE;

export const INSUFFICIENT_CREDIT_MESSAGE =
  "クレジットが不足しています。ダッシュボードからクレジットを追加してください。";

export const API_ERROR_MESSAGE =
  "検索中にエラーが発生しました。時間をおいて再度お試しください。";

export const CREDIT_CONSUME_FAILED_MESSAGE =
  "クレジットの消費に失敗しました。検索結果は表示されません。時間をおいて再度お試しください。";

export const NO_NEW_RESULTS_MESSAGE =
  "この検索範囲では新しい検索結果がありません。エリア、半径、キーワードを変更して再検索してください。";

export const TOOL_USER_QUERY_MISSING_MESSAGE =
  "ユーザー情報が不足しています。ダッシュボードから再度ツールを開いてください。";

export const TOOL_USER_ID_MISSING_MESSAGE =
  "user_id が指定されていません。ダッシュボードから再度ツールを開いてください。";

export const TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE =
  "管理システムへの接続に失敗しました。時間をおいて再度お試しください。";

export const TOOL_USER_NOT_FOUND_MESSAGE =
  "ユーザーが見つかりませんでした。ダッシュボードから再度ツールを開いてください。";

export const TOOL_USER_CREDIT_FETCH_FAILED_MESSAGE =
  "クレジット情報の取得に失敗しました。ダッシュボードをご確認ください。";

export const TOOL_USER_MISMATCH_MESSAGE = "ユーザー照合失敗";

export const TOOL_USER_VERIFY_FAILED_MESSAGE =
  "ユーザー情報の確認に失敗しました。ダッシュボードから再度ツールを開いてください。";
