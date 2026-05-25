/** 認証未実装時の仮ユーザーID。認証追加後はここを差し替える */
export const DEMO_USER_ID = "demo-user";

export const MAX_RESULTS = 20;

export const RADIUS_OPTIONS = [500, 1000, 2000, 3000, 5000] as const;

export type RadiusM = (typeof RADIUS_OPTIONS)[number];
