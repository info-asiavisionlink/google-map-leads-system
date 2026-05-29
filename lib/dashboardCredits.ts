import { NextRequest } from "next/server";
import {
  authDebugError,
  authDebugInfo,
  getAuthSystemApiUrlInfo,
  maskToken,
  resolveAuthSystemApiUrl,
  safeJsonForLog,
} from "@/lib/authDebug";
import {
  DASHBOARD_SUPABASE_NOT_CONFIGURED_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
  TOOL_AI_CHAT_KEY,
  TOOL_KEY,
  TOOL_NAME,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import {
  getDashboardSupabaseAdmin,
  getDashboardSupabaseConfig,
  isDashboardSupabaseConfigured,
} from "@/lib/dashboardSupabase/server";
import {
  extractErrorFromBody,
  getBearerTokenFromHeader,
  parseToolVerifyResponse,
  type ToolVerifyResult,
} from "@/lib/toolVerify";

export class InsufficientCreditError extends Error {
  constructor() {
    super("クレジットが不足しています");
    this.name = "InsufficientCreditError";
  }
}

export class DashboardCreditsError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "DashboardCreditsError";
    this.status = status;
    this.code = code;
  }
}

export function getDashboardBaseUrl(): string {
  const url = resolveAuthSystemApiUrl();
  if (!url) {
    throw new Error(
      "管理システム API URL が未設定です (NEXT_PUBLIC_DASHBOARD_BASE_URL または AUTH_SYSTEM_API_URL)"
    );
  }
  return url;
}

export function getToolKey(): string {
  return process.env.NEXT_PUBLIC_TOOL_KEY?.trim() || TOOL_KEY;
}

export function getAiChatToolKey(): string {
  return process.env.NEXT_PUBLIC_TOOL_AI_CHAT_KEY?.trim() || TOOL_AI_CHAT_KEY;
}

export function getAccessTokenFromRequest(
  request: NextRequest
): string | null {
  return getBearerTokenFromHeader(request.headers.get("authorization"));
}

/** 共通ダッシュボード GET /api/tools/token/verify */
export async function verifyToolAccessToken(
  accessToken: string
): Promise<ToolVerifyResult> {
  const baseUrl = getDashboardBaseUrl();
  const apiInfo = getAuthSystemApiUrlInfo();
  const verifyUrl = `${baseUrl}/api/tools/token/verify`;
  const tokenMeta = maskToken(accessToken);

  authDebugInfo("auth-system-verify-request", {
    AUTH_SYSTEM_API_URL: baseUrl,
    env_source: apiInfo.source,
    request_url: verifyUrl,
    authorization_header_exists: true,
    token_exists: tokenMeta.token_exists,
    token_length: tokenMeta.token_length,
    tool_key: getToolKey(),
  });

  const res = await fetch(verifyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  authDebugInfo("auth-system-verify-response", {
    response_status: res.status,
    response_ok: res.ok,
    response_body: safeJsonForLog(body),
  });

  if (!res.ok) {
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code: unknown }).code)
        : undefined;
    const message = extractErrorFromBody(
      body,
      "トークンの検証に失敗しました"
    );
    authDebugError("auth-system-verify-failed", {
      response_status: res.status,
      error_code: code ?? "(none)",
      error_message: message,
      response_body: safeJsonForLog(body),
    });
    throw new DashboardCreditsError(message, res.status, code);
  }

  try {
    const parsed = parseToolVerifyResponse(body);
    authDebugInfo("auth-system-verify-success", {
      user_id: parsed.user.id,
      username: parsed.user.username ?? "(null)",
      email: parsed.user.email,
      remaining_credit: parsed.credit,
    });
    return parsed;
  } catch (parseErr) {
    authDebugError(
      "auth-system-verify-parse-error",
      { response_body: safeJsonForLog(body) },
      parseErr
    );
    throw new DashboardCreditsError(
      parseErr instanceof Error
        ? parseErr.message
        : "トークン検証レスポンスの解析に失敗しました",
      500
    );
  }
}

export async function verifyToolAccessTokenFromRequest(
  request: NextRequest
): Promise<ToolVerifyResult> {
  const token = getAccessTokenFromRequest(request);
  if (!token) {
    throw new DashboardCreditsError(
      "認証トークンがありません",
      401,
      "UNAUTHORIZED"
    );
  }
  return verifyToolAccessToken(token);
}

export function hasEnoughCredit(credit: number, creditCost: number): boolean {
  return credit >= creditCost;
}

type ProfileCreditRow = {
  id: string;
  credit: number | null;
};

function parseProfileCredit(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return null;
}

function logDashboardSupabaseConfig(): void {
  const config = getDashboardSupabaseConfig();
  authDebugInfo("dashboard-supabase-config", {
    configured: isDashboardSupabaseConfigured(),
    env_source: config?.envSource ?? "(none)",
    url_exists: Boolean(config?.url),
    service_role_key_exists: Boolean(config?.serviceRoleKey),
  });
}

/** 共通ダッシュボード Supabase profiles からクレジット残高を取得 */
export async function getDashboardUserCredit(userId: string): Promise<number> {
  if (!userId.trim()) {
    throw new DashboardCreditsError(USER_INFO_MISSING_MESSAGE, 401, "unauthorized");
  }

  logDashboardSupabaseConfig();

  const supabase = getDashboardSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, credit")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    authDebugError("dashboard-credit-fetch", {
      user_id: userId,
      error: error.message,
    });
    throw new DashboardCreditsError(
      "クレジット残高の取得に失敗しました。",
      500,
      "credit_fetch_failed"
    );
  }

  if (!data) {
    throw new DashboardCreditsError(
      "ユーザーが見つかりませんでした。",
      404,
      "user_not_found"
    );
  }

  const credit = parseProfileCredit((data as ProfileCreditRow).credit);
  if (credit === null) {
    throw new DashboardCreditsError(
      "クレジット残高の取得に失敗しました。",
      500,
      "credit_fetch_failed"
    );
  }

  authDebugInfo("dashboard-credit-fetch", {
    user_id: userId,
    credit_before: credit,
  });

  return credit;
}

export type ConsumeDashboardCreditsResult = {
  credit: number;
  creditBefore: number;
  creditUsed: number;
  creditAfter: number;
  resultCount: number;
};

export type ConsumeDashboardCreditsParams = {
  userId: string;
  toolKey?: string;
  amount: number;
  resultCount: number;
  externalRequestId: string;
};

async function saveToolUsageLog(params: {
  userId: string;
  toolKey: string;
  amount: number;
  resultCount: number;
  creditBefore: number;
  creditAfter: number;
  externalRequestId: string;
}): Promise<void> {
  const supabase = getDashboardSupabaseAdmin();

  const row = {
    user_id: params.userId,
    tool_key: params.toolKey,
    tool_name: TOOL_NAME,
    credit_cost: params.amount,
    credit_before: params.creditBefore,
    credit_after: params.creditAfter,
    status: "completed",
    message: `${params.resultCount}件取得（${params.amount}クレジット消費）`,
  };

  const { error } = await supabase.from("tool_usage_logs").insert(row);

  if (error) {
    console.warn(
      "[dashboard-credits] tool_usage_logs 保存をスキップ:",
      error.message,
      "external_request_id:",
      params.externalRequestId
    );
    authDebugError("dashboard-usage-log-skipped", {
      user_id: params.userId,
      external_request_id: params.externalRequestId,
      error: error.message,
    });
  } else {
    authDebugInfo("dashboard-usage-log-saved", {
      user_id: params.userId,
      external_request_id: params.externalRequestId,
      credit_used: params.amount,
    });
  }
}

/**
 * 共通ダッシュボード Supabase の profiles.credit を直接減算（取得件数 × 単価）
 * Googleマップツール側 Supabase は更新しない。
 */
export async function consumeDashboardCredits(
  params: ConsumeDashboardCreditsParams
): Promise<ConsumeDashboardCreditsResult> {
  const userId = params.userId.trim();
  if (!userId) {
    throw new DashboardCreditsError(USER_INFO_MISSING_MESSAGE, 401, "unauthorized");
  }

  if (!isDashboardSupabaseConfigured()) {
    authDebugError("dashboard-credits-consume", {
      failure: "supabase_not_configured",
    });
    throw new DashboardCreditsError(
      DASHBOARD_SUPABASE_NOT_CONFIGURED_MESSAGE,
      500,
      "consume_failed"
    );
  }

  const toolKey = params.toolKey ?? getToolKey();
  const amount = params.amount;
  const resultCount = params.resultCount;

  authDebugInfo("dashboard-credits-consume-start", {
    user_id: userId,
    tool_key: toolKey,
    amount,
    result_count: resultCount,
    external_request_id: params.externalRequestId,
  });

  logDashboardSupabaseConfig();

  const creditBefore = await getDashboardUserCredit(userId);

  if (amount <= 0) {
    authDebugInfo("dashboard-credits-consume-skip", {
      user_id: userId,
      reason: "zero_amount",
      credit_before: creditBefore,
    });
    return {
      credit: creditBefore,
      creditBefore,
      creditUsed: 0,
      creditAfter: creditBefore,
      resultCount,
    };
  }

  if (creditBefore < amount) {
    authDebugError("dashboard-credits-consume", {
      failure: "insufficient_credit",
      user_id: userId,
      credit_before: creditBefore,
      required_credit: amount,
    });
    throw new DashboardCreditsError(
      INSUFFICIENT_CREDIT_MESSAGE,
      402,
      "insufficient_credit"
    );
  }

  const creditAfter = creditBefore - amount;
  const supabase = getDashboardSupabaseAdmin();

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ credit: creditAfter })
    .eq("id", userId)
    .eq("credit", creditBefore)
    .select("credit")
    .maybeSingle();

  if (updateError) {
    authDebugError(
      "dashboard-credits-consume",
      { failure: "profile_update_error", user_id: userId },
      updateError
    );
    throw new DashboardCreditsError(
      "クレジット残高の更新に失敗しました。",
      500,
      "consume_failed"
    );
  }

  if (!updated) {
    authDebugError("dashboard-credits-consume", {
      failure: "optimistic_lock_conflict",
      user_id: userId,
      credit_before: creditBefore,
    });
    throw new DashboardCreditsError(
      "クレジット残高の更新に失敗しました。再度お試しください。",
      409,
      "consume_failed"
    );
  }

  const confirmedCredit =
    parseProfileCredit((updated as ProfileCreditRow).credit) ?? creditAfter;

  try {
    await saveToolUsageLog({
      userId,
      toolKey,
      amount,
      resultCount,
      creditBefore,
      creditAfter: confirmedCredit,
      externalRequestId: params.externalRequestId,
    });
  } catch (logErr) {
    console.warn("[dashboard-credits] 利用履歴保存で例外:", logErr);
  }

  authDebugInfo("dashboard-credits-consume-success", {
    user_id: userId,
    credit_before: creditBefore,
    credit_used: amount,
    credit_after: confirmedCredit,
    result_count: resultCount,
  });

  return {
    credit: confirmedCredit,
    creditBefore,
    creditUsed: amount,
    creditAfter: confirmedCredit,
    resultCount,
  };
}
