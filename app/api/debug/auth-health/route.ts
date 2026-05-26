import { NextResponse } from "next/server";
import { TOOL_KEY } from "@/lib/constants";
import {
  authDebugInfo,
  getAuthSystemApiUrlInfo,
  isServerAuthDebugEnabled,
  resolveAuthSystemApiUrl,
} from "@/lib/authDebug";
import { getToolKey } from "@/lib/dashboardCredits";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  if (!isServerAuthDebugEnabled()) {
    return NextResponse.json(
      { error: "AUTH_DEBUG が無効です。AUTH_DEBUG=true を設定してください。" },
      { status: 404 }
    );
  }

  const apiInfo = getAuthSystemApiUrlInfo();
  const baseUrl = resolveAuthSystemApiUrl();

  let authSystemReachable: boolean | null = null;
  let verifyProbeStatus: number | null = null;
  let probeError: string | null = null;

  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/tools/token/verify`, {
        method: "GET",
        cache: "no-store",
      });
      verifyProbeStatus = res.status;
      authSystemReachable = true;
      authDebugInfo("auth-health", {
        probe_url: `${baseUrl}/api/tools/token/verify`,
        probe_status: res.status,
        note: "401/403 はトークンなしのため正常な場合あり",
      });
    } catch (err) {
      authSystemReachable = false;
      probeError = err instanceof Error ? err.message : String(err);
      authDebugInfo("auth-health", {
        probe_url: `${baseUrl}/api/tools/token/verify`,
        probe_failed: true,
        probe_error: probeError,
      });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const googleMapSupabaseConfigured = Boolean(supabaseUrl && serviceKey);

  let googleMapSupabaseOk: boolean | null = null;
  let googleMapSupabaseError: string | null = null;

  if (googleMapSupabaseConfigured) {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from("search_requests")
        .select("id")
        .limit(1);

      googleMapSupabaseOk = !error;
      if (error) {
        googleMapSupabaseError = error.message;
      }
    } catch (err) {
      googleMapSupabaseOk = false;
      googleMapSupabaseError =
        err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    auth_system_api_url: apiInfo.url,
    auth_system_api_source: apiInfo.source,
    auth_system_api_configured: apiInfo.configured,
    env_mismatch_warning: apiInfo.mismatch_warning,
    tool_key: getToolKey() || TOOL_KEY,
    google_map_supabase_configured: googleMapSupabaseConfigured,
    google_map_supabase_ok: googleMapSupabaseOk,
    google_map_supabase_error: googleMapSupabaseError,
    auth_system_reachable: authSystemReachable,
    auth_system_verify_probe_status: verifyProbeStatus,
    auth_system_probe_error: probeError,
    server_auth_debug_enabled: true,
  });
}
