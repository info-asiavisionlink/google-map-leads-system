import { NextRequest } from "next/server";
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
  const url = process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_DASHBOARD_BASE_URL が設定されていません");
  }
  return url.replace(/\/$/, "");
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

  const res = await fetch(`${baseUrl}/api/tools/token/verify`, {
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

  if (!res.ok) {
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code: unknown }).code)
        : undefined;
    const message = extractErrorFromBody(
      body,
      "トークンの検証に失敗しました"
    );
    console.error("verify API エラー:", res.status, body);
    throw new DashboardCreditsError(message, res.status, code);
  }

  try {
    return parseToolVerifyResponse(body);
  } catch (parseErr) {
    console.error("verify レスポンスパースエラー:", body, parseErr);
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

  const res = await fetch(`${baseUrl}/api/credits/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      tool_key: getToolKey(),
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
    throw new DashboardCreditsError(message, res.status, code);
  }

  return { credit: parseCreditFromBody(body) };
}
