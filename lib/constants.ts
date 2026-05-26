/** 1回の検索で取得できる最大件数 */
export const MAX_RESULTS = 200;

/** 1件あたりのクレジット消費 */
export const CREDIT_PER_RESULT = 2;

/** 検索開始に必要な最低クレジット（1件分） */
export const MIN_CREDIT_TO_SEARCH = CREDIT_PER_RESULT;

/** 最大消費クレジット（200件 × 2） */
export const MAX_CREDIT_COST = MAX_RESULTS * CREDIT_PER_RESULT;

/** @deprecated 固定消費は廃止。表示互換用に MAX_CREDIT_COST を参照 */
export const GOOGLE_MAP_SEARCH_CREDIT_COST = MAX_CREDIT_COST;

export const TOOL_KEY = "google_map_leads";
export const TOOL_NAME = "Googleマップ営業リスト作成";

/** 都道府県ベース検索の DB 互換用（半径は未使用） */
export const LEGACY_RADIUS_M = 0;

export const TOKEN_AUTH_EXPIRED_MESSAGE =
  "認証情報が切れています。再度ダッシュボードから開いてください。";

export const NOT_LOGGED_IN_MESSAGE =
  "未ログインです。ダッシュボードから利用してください。";

export const USER_INFO_MISSING_MESSAGE =
  "ユーザー情報が取得できません。ダッシュボードから開いてください。";

export const LOGIN_ERROR_MESSAGE =
  "ログインに失敗しました。ダッシュボードから再度ツールを開いてください。";

export const CREDIT_FETCH_FAILED_MESSAGE =
  "クレジット情報の取得に失敗しました。ダッシュボードから再度ツールを開くか、しばらくしてからお試しください。";

/** @deprecated トークン認証では TOKEN_AUTH_EXPIRED_MESSAGE を使用 */
export const AUTH_REQUIRED_MESSAGE = TOKEN_AUTH_EXPIRED_MESSAGE;

export const INSUFFICIENT_CREDIT_MESSAGE =
  "クレジットが不足しています。";

export const API_ERROR_MESSAGE =
  "Google APIでエラーが発生しました。";

export const CREDIT_CONSUME_FAILED_MESSAGE =
  "クレジット消費に失敗しました。";

export const SAVE_RESULTS_FAILED_MESSAGE =
  "検索結果の保存に失敗しました。";

export const NO_RESULTS_FOUND_MESSAGE = "検索結果が見つかりませんでした。";

/** @deprecated NO_RESULTS_FOUND_MESSAGE を使用 */
export const NO_NEW_RESULTS_MESSAGE = NO_RESULTS_FOUND_MESSAGE;

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

export function calculateCreditCost(resultCount: number): number {
  return resultCount * CREDIT_PER_RESULT;
}
