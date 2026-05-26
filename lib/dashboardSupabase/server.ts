import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DASHBOARD_SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/constants";

let dashboardSupabaseAdmin: SupabaseClient | null = null;

export type DashboardSupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  envSource: "DASHBOARD_SUPABASE" | "AUTH_SUPABASE";
};

/** 共通ダッシュボード側 Supabase の接続情報（サーバー専用） */
export function getDashboardSupabaseConfig(): DashboardSupabaseConfig | null {
  const dashboardUrl = process.env.DASHBOARD_SUPABASE_URL?.trim();
  const dashboardKey = process.env.DASHBOARD_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (dashboardUrl && dashboardKey) {
    return {
      url: dashboardUrl,
      serviceRoleKey: dashboardKey,
      envSource: "DASHBOARD_SUPABASE",
    };
  }

  const authUrl = process.env.AUTH_SUPABASE_URL?.trim();
  const authServiceKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (authUrl && authServiceKey) {
    return {
      url: authUrl,
      serviceRoleKey: authServiceKey,
      envSource: "AUTH_SUPABASE",
    };
  }

  return null;
}

export function isDashboardSupabaseConfigured(): boolean {
  return getDashboardSupabaseConfig() !== null;
}

/**
 * 共通ダッシュボード側 Supabase（profiles / クレジット正本）
 * Service Role Key はサーバー API のみで使用すること。
 */
export function getDashboardSupabaseAdmin(): SupabaseClient {
  if (dashboardSupabaseAdmin) {
    return dashboardSupabaseAdmin;
  }

  const config = getDashboardSupabaseConfig();
  if (!config) {
    throw new Error(DASHBOARD_SUPABASE_NOT_CONFIGURED_MESSAGE);
  }

  dashboardSupabaseAdmin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return dashboardSupabaseAdmin;
}
