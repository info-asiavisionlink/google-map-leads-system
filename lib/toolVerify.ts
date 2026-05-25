import { TOOL_KEY, TOOL_NAME } from "@/lib/constants";

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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return undefined;
}

export function parseToolVerifyResponse(data: unknown): ToolVerifyResult {
  if (typeof data !== "object" || data === null) {
    throw new Error("トークン検証レスポンスの形式が不正です");
  }

  const root = data as Record<string, unknown>;
  const userRaw =
    typeof root.user === "object" && root.user !== null
      ? (root.user as Record<string, unknown>)
      : null;
  const toolRaw =
    typeof root.tool === "object" && root.tool !== null
      ? (root.tool as Record<string, unknown>)
      : null;

  const userId = pickString(userRaw?.id);
  const email = pickString(userRaw?.email);
  const credit = pickNumber(root.credit) ?? pickNumber(root.credit_balance);
  const creditCost = pickNumber(toolRaw?.credit_cost);

  if (!userId || !email || credit === undefined || creditCost === undefined) {
    throw new Error("トークン検証レスポンスに必須項目がありません");
  }

  return {
    user: {
      id: userId,
      email,
      username: pickString(userRaw?.username) ?? null,
    },
    tool: {
      tool_key: pickString(toolRaw?.tool_key) ?? TOOL_KEY,
      tool_name: pickString(toolRaw?.tool_name) ?? TOOL_NAME,
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
  const message = pickString(obj.message);
  return message ?? fallback;
}
