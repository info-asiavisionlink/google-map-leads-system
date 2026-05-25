import { NextRequest } from "next/server";
import { GOOGLE_MAP_SEARCH_CREDIT_COST, TOOL_KEY } from "@/lib/constants";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export class InsufficientCreditError extends Error {
  constructor() {
    super("クレジットが不足しています");
    this.name = "InsufficientCreditError";
  }
}

export class DashboardCreditsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "DashboardCreditsError";
    this.status = status;
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

function parseCreditFromBody(data: unknown): number {
  if (typeof data !== "object" || data === null) {
    throw new DashboardCreditsError("残高レスポンスの形式が不正です");
  }
  const obj = data as Record<string, unknown>;
  const candidates = [obj.credit, obj.balance, obj.credit_balance];
  for (const value of candidates) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }
  }
  throw new DashboardCreditsError("残高レスポンスに credit が含まれていません");
}

async function buildAuthHeaders(
  request: NextRequest
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.Cookie = cookie;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    headers.Authorization = authHeader;
  } else {
    try {
      const supabase = createSupabaseRouteClient(request);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      console.error("セッション取得エラー:", err);
    }
  }

  return headers;
}

/** 共通ダッシュボード GET /api/credits/balance */
export async function fetchDashboardBalance(
  request: NextRequest
): Promise<number> {
  const baseUrl = getDashboardBaseUrl();
  const headers = await buildAuthHeaders(request);
  delete headers["Content-Type"];

  const res = await fetch(`${baseUrl}/api/credits/balance`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 401) {
    throw new DashboardCreditsError("認証が必要です", 401);
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "クレジット残高の取得に失敗しました";
    throw new DashboardCreditsError(msg, res.status);
  }

  return parseCreditFromBody(body);
}

export function hasEnoughCredit(credit: number): boolean {
  return credit >= GOOGLE_MAP_SEARCH_CREDIT_COST;
}

type ConsumeResult = {
  credit: number;
};

/** 共通ダッシュボード POST /api/credits/consume（credit_cost は送らない） */
export async function consumeDashboardCredits(
  request: NextRequest,
  externalRequestId: string
): Promise<ConsumeResult> {
  const baseUrl = getDashboardBaseUrl();
  const headers = await buildAuthHeaders(request);

  const res = await fetch(`${baseUrl}/api/credits/consume`, {
    method: "POST",
    headers,
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
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "クレジットの消費に失敗しました";
    throw new DashboardCreditsError(msg, res.status);
  }

  return { credit: parseCreditFromBody(body) };
}
