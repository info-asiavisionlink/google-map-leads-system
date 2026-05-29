/** 1回の検索成功時に消費するクレジット数（表示用。実際の減算はダッシュボード側） */
export const GOOGLE_MAP_SEARCH_CREDIT_COST = 30;

/** AIチャット1回あたりのクレジット消費数（表示用） */
export const AI_CHAT_CREDIT_COST = 2;

export const TOOL_KEY = "google_map_leads";
export const TOOL_AI_CHAT_KEY = "google_map_leads_ai_chat";
export const TOOL_NAME = "Googleマップ営業リスト作成";

/** 1回の検索で取得する最大件数 */
export const MAX_RESULTS = 200;

/** Text Search で収集する候補の上限（除外後200件確保用） */
export const MAX_CANDIDATE_PLACES = 300;

export const USER_INFO_MISSING_MESSAGE =
  "ユーザー情報が取得できません。ダッシュボードから開いてください。";

export const NOT_LOGGED_IN_MESSAGE = USER_INFO_MISSING_MESSAGE;

export const SEARCH_JOB_POLL_MS = 2500;

export const SEARCH_PROGRESS_STEPS = [
  { key: "scanning", label: "AIがGoogleマップ上の店舗情報をスキャンしています" },
  { key: "fetching", label: "店舗候補を取得中" },
  { key: "details", label: "詳細情報を確認中" },
  { key: "deduping", label: "重複データを除外中" },
  { key: "saving", label: "営業リストを保存中" },
] as const;

export type SearchJobStepKey = (typeof SEARCH_PROGRESS_STEPS)[number]["key"];

export const TOKEN_AUTH_EXPIRED_MESSAGE =
  "認証が切れています。ダッシュボードから再度ツールを開いてください。";

export const AUTH_REQUIRED_MESSAGE = TOKEN_AUTH_EXPIRED_MESSAGE;

export const INSUFFICIENT_CREDIT_MESSAGE =
  "クレジットが不足しています。";

export const AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE =
  "AIチャットには2クレジット必要です。ダッシュボードからクレジットを追加してください。";

export const API_ERROR_MESSAGE =
  "Google APIでエラーが発生しました。";

export const CREDIT_CONSUME_FAILED_MESSAGE =
  "クレジット消費に失敗しました。";

export const NO_NEW_RESULTS_MESSAGE =
  "この検索範囲では新しい検索結果がありません。エリア、半径、キーワードを変更して再検索してください。";

export const WEBSITE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const OPENAI_MAX_CONTEXT_CHARS = 12000;

export const WEBSITE_FETCH_TIMEOUT_MS = 12000;

export const WEBSITE_MAX_TEXT_CHARS = 8000;
