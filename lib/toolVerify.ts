import { GOOGLE_MAP_SEARCH_CREDIT_COST, TOOL_KEY, TOOL_NAME } from "@/lib/constants";

export type ToolVerifyUser = {
  id: string;
  email: string;
  username: string | null;
};

export type ToolVerifyTool = {
  tool_key: string;
  tool_name: string;
  credit_cost: number;
};

export type ToolVerifyResult = {
  user: ToolVerifyUser;
  tool: ToolVerifyTool;
  credit: number;
};

export function getBearerTokenFromHeader(
  authorization: string | null
): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  return undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function parseToolVerifyResponse(data: unknown): ToolVerifyResult {
  const root = asRecord(data);
  if (!root) {
    throw new Error("トークン検証レスポンスの形式が不正です");
  }

  const payload = asRecord(root.data) ?? root;

  const userRaw = asRecord(payload.user) ?? asRecord(root.user);
  const toolRaw = asRecord(payload.tool) ?? asRecord(root.tool);
  const profileRaw = asRecord(payload.profile) ?? asRecord(root.profile);

  const userId =
    pickString(userRaw?.id) ??
    pickString(userRaw?.user_id) ??
    pickString(payload.user_id) ??
    pickString(root.user_id);

  const email =
    pickString(userRaw?.email) ??
    pickString(payload.email) ??
    pickString(root.email) ??
    pickString(profileRaw?.email) ??
    "";

  const username =
    pickString(userRaw?.username) ??
    pickString(userRaw?.name) ??
    pickString(profileRaw?.username) ??
    null;

  const credit =
    pickNumber(payload.credit) ??
    pickNumber(root.credit) ??
    pickNumber(profileRaw?.credit) ??
    pickNumber(payload.credit_balance) ??
    pickNumber(root.balance);

  const creditCost =
    pickNumber(toolRaw?.credit_cost) ??
    pickNumber(payload.credit_cost) ??
    pickNumber(root.credit_cost) ??
    GOOGLE_MAP_SEARCH_CREDIT_COST;

  if (!userId) {
    throw new Error("トークン検証レスポンスに user.id がありません");
  }

  if (credit === undefined) {
    throw new Error("トークン検証レスポンスに credit がありません");
  }

  return {
    user: {
      id: userId,
      email: email || "（メール未設定）",
      username,
    },
    tool: {
      tool_key: pickString(toolRaw?.tool_key) ?? pickString(payload.tool_key) ?? TOOL_KEY,
      tool_name:
        pickString(toolRaw?.tool_name) ??
        pickString(payload.tool_name) ??
        TOOL_NAME,
      credit_cost: creditCost,
    },
    credit,
  };
}

export function mapDashboardErrorCode(code: string | undefined): string {
  switch (code) {
    case "TOKEN_EXPIRED":
      return "認証の有効期限が切れました。ダッシュボードから再度ツールを開いてください。";
    case "TOOL_TOKEN_MISMATCH":
      return "ツール認証が一致しません。ダッシュボードから再度ツールを開いてください。";
    case "INSUFFICIENT_CREDIT":
      return "クレジットが不足しています。ダッシュボードからクレジットを追加してください。";
    case "UNAUTHORIZED":
      return "認証が切れています。ダッシュボードから再度ツールを開いてください。";
    default:
      return "";
  }
}

export function extractErrorFromBody(
  body: unknown,
  fallback: string
): string {
  if (typeof body !== "object" || body === null) return fallback;
  const obj = body as Record<string, unknown>;
  const code = pickString(obj.code) ?? pickString(obj.error);
  const fromCode = mapDashboardErrorCode(code);
  if (fromCode) return fromCode;
  const message = pickString(obj.message) ?? pickString(obj.error);
  if (message && message !== code) return message;
  return fallback;
}

export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}
