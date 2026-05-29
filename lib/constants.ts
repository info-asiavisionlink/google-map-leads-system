/** 1回の検索で取得・保存する目標件数 */
export const SEARCH_TARGET_RESULTS = 200;

/** @deprecated SEARCH_TARGET_RESULTS を使用 */
export const MAX_RESULTS = SEARCH_TARGET_RESULTS;

/** 検索・保存ループの1バッチ件数（50×4回で200件） */
export const SEARCH_BATCH_SIZE = 50;

/** 1件あたりのクレジット消費 */
export const CREDIT_PER_RESULT = 2;

/** 検索開始に必要な最低クレジット（1件分） */
export const MIN_CREDIT_TO_SEARCH = CREDIT_PER_RESULT;

/** 最大消費クレジット（200件 × 2） */
export const MAX_CREDIT_COST = MAX_RESULTS * CREDIT_PER_RESULT;

/** @deprecated 固定消費は廃止。表示互換用 */
export const GOOGLE_MAP_SEARCH_CREDIT_COST = MAX_CREDIT_COST;

/** AIチャット1回あたりのクレジット消費数 */
export const AI_CHAT_CREDIT_COST = 2;

/** AIチャット tool_id / tool_key（tool_usage_logs 用） */
export const AI_CHAT_TOOL_ID = "google_map_leads_ai_chat";

export const TOOL_KEY = "google_map_leads";
export const TOOL_AI_CHAT_KEY = AI_CHAT_TOOL_ID;
export const TOOL_NAME = "Googleマップ営業リスト作成";

/** Text Search で収集する候補の上限（互換用） */
export const MAX_CANDIDATE_PLACES = 300;

/** 都道府県ベース検索の DB 互換用（半径は未使用） */
export const LEGACY_RADIUS_M = 0;

export const USER_INFO_MISSING_MESSAGE =
  "ユーザー情報が取得できません。ダッシュボードから開いてください。";

export const NOT_LOGGED_IN_MESSAGE = USER_INFO_MISSING_MESSAGE;

/** @deprecated USER_INFO_MISSING_MESSAGE を使用 */
export const AUTH_REQUIRED_MESSAGE = USER_INFO_MISSING_MESSAGE;

export const TOKEN_AUTH_EXPIRED_MESSAGE =
  "認証が切れています。ダッシュボードから再度ツールを開いてください。";

export const LOGIN_ERROR_MESSAGE =
  "ログインに失敗しました。ダッシュボードから再度ツールを開いてください。";

export const CREDIT_FETCH_FAILED_MESSAGE =
  "クレジット情報の取得に失敗しました。ダッシュボードから再度ツールを開くか、しばらくしてからお試しください。";

export const INSUFFICIENT_CREDIT_MESSAGE =
  "クレジットが不足しています。";

export const AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE =
  "AIチャットには2クレジット必要です。ダッシュボードからクレジットを追加してください。";

export const API_ERROR_MESSAGE =
  "Google APIでエラーが発生しました。";

export const CREDIT_CONSUME_FAILED_MESSAGE =
  "クレジット消費に失敗しました。";

export const DASHBOARD_SUPABASE_NOT_CONFIGURED_MESSAGE =
  "共通ダッシュボードSupabaseの接続情報が設定されていません。";

export const SAVE_RESULTS_FAILED_MESSAGE =
  "検索結果の保存に失敗しました。";

export const NO_RESULTS_FOUND_MESSAGE = "検索結果が見つかりませんでした。";

export const EXHAUSTED_NO_NEW_RESULTS_MESSAGE =
  "この条件では新規店舗が見つかりませんでした。";

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

export const SEARCH_JOB_POLL_MS = 2500;

/** 1地点あたりの Text Search ページング上限（20件×ページ数） */
export const MAX_PAGES_PER_POINT = 3;

/** スパイラル追加フェッチの上限 */
export const MAX_SPIRAL_FETCHES = 120;

/** 広域都道府県検索の locationBias 半径（m） */
export const SEARCH_POINT_RADIUS_M = 6000;

/** 東京都向け検索半径（m） */
export const SEARCH_POINT_RADIUS_M_TOKYO = 8000;

export const SEARCH_PROGRESS_STEPS = [
  { key: "scanning", label: "AIがGoogleマップ上の店舗情報をスキャンしています" },
  { key: "fetching", label: "店舗候補を取得中" },
  { key: "details", label: "詳細情報を確認中" },
  { key: "deduping", label: "重複データを除外中" },
  { key: "saving", label: "営業リストを保存中" },
] as const;

export type SearchJobStepKey = (typeof SEARCH_PROGRESS_STEPS)[number]["key"];

export const WEBSITE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const OPENAI_MAX_CONTEXT_CHARS = 12000;

export const WEBSITE_FETCH_TIMEOUT_MS = 12000;

export const WEBSITE_MAX_TEXT_CHARS = 8000;

export function calculateCreditCost(resultCount: number): number {
  return resultCount * CREDIT_PER_RESULT;
}
