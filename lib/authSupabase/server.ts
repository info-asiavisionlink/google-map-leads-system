import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let authSupabaseAdmin: SupabaseClient | null = null;

/**
 * 管理システム側 Supabase（サーバー専用）
 * profiles 照合は API Route からのみ呼び出す（service_role はクライアントに露出しない）
 */
export function getAuthSupabaseAdmin(): SupabaseClient {
  if (authSupabaseAdmin) {
    return authSupabaseAdmin;
  }

  const url = process.env.AUTH_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.AUTH_SUPABASE_ANON_KEY?.trim();
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new Error(
      "管理システム Supabase の環境変数 (AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY または AUTH_SUPABASE_SERVICE_ROLE_KEY) が設定されていません"
    );
  }

  authSupabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return authSupabaseAdmin;
}
