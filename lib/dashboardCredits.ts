import { NextRequest } from "next/server";
import {
  authDebugError,
  authDebugInfo,
  getAuthSystemApiUrlInfo,
  maskToken,
  resolveAuthSystemApiUrl,
  safeJsonForLog,
} from "@/lib/authDebug";
import { TOOL_KEY } from "@/lib/constants";
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

export function getAccessTokenFromRequest(
  request: NextRequest
): string | null {
  return getBearerTokenFromHeader(request.headers.get("authorization"));
}

function parseCreditFromBody(data: unknown): number {
  if (typeof data !== "object" || data === null) {
    throw new DashboardCreditsError("残高レスポンスの形式が不正です");
  }
  const obj = data as Record<string, unknown>;
  const candidates = [obj.credit, obj.balance, obj.credit_after, obj.credit_balance];
  for (const value of candidates) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }
  }
  throw new DashboardCreditsError("残高レスポンスに credit が含まれていません");
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

type ConsumeResult = {
  credit: number;
};

/** 共通ダッシュボード POST /api/credits/consume（credit_cost は送らない） */
export async function consumeDashboardCredits(
  accessToken: string,
  externalRequestId: string
): Promise<ConsumeResult> {
  const baseUrl = getDashboardBaseUrl();
  const consumeUrl = `${baseUrl}/api/credits/consume`;
  const toolKey = getToolKey();

  authDebugInfo("auth-system-consume-request", {
    request_url: consumeUrl,
    method: "POST",
    tool_key: toolKey,
    external_request_id: externalRequestId,
    authorization_header_exists: true,
    token_length: maskToken(accessToken).token_length,
  });

  const res = await fetch(consumeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      tool_key: toolKey,
      external_request_id: externalRequestId,
    }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code: unknown }).code)
        : undefined;
    const message = extractErrorFromBody(
      body,
      "クレジットの消費に失敗しました"
    );
    authDebugError("auth-system-consume-failed", {
      response_status: res.status,
      error_code: code ?? "(none)",
      error_message: message,
      response_body: safeJsonForLog(body),
    });
    throw new DashboardCreditsError(message, res.status, code);
  }

  const credit = parseCreditFromBody(body);
  authDebugInfo("auth-system-consume-success", {
    response_status: res.status,
    credit_after: credit,
    response_body: safeJsonForLog(body),
  });

  return { credit };
}
