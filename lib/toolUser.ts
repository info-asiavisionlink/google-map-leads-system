/** 管理システム Supabase profiles の正規化ユーザー（正本） */
export type ToolUser = {
  id: string;
  username: string | null;
  email: string;
  credit: number;
};

/** ダッシュボードから URL で渡されるユーザー情報 */
export type ToolUserQuery = {
  user_id: string;
  username: string;
  email: string;
  remaining_credit: number;
};

export type ToolUserAuthStatus = "loading" | "authenticated" | "unauthenticated";

export type ToolUserAuthErrorCode =
  | "query_missing"
  | "user_id_missing"
  | "supabase_connection_failed"
  | "user_not_found"
  | "credit_fetch_failed"
  | "mismatch"
  | "verify_request_failed";

export type ToolUserVerifyApiResponse =
  | {
      ok: true;
      user: ToolUser;
      matched: boolean;
    }
  | {
      ok: false;
      code: ToolUserAuthErrorCode;
      error: string;
    };

export type AuthProfileRow = {
  id: string;
  username: string | null;
  email: string;
  credit: number | null;
};
