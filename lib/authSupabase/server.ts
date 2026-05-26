import type { SupabaseClient } from "@supabase/supabase-js";
import { getDashboardSupabaseAdmin } from "@/lib/dashboardSupabase/server";

/**
 * 管理システム側 Supabase（サーバー専用）
 * @deprecated getDashboardSupabaseAdmin を使用
 */
export function getAuthSupabaseAdmin(): SupabaseClient {
  return getDashboardSupabaseAdmin();
}
