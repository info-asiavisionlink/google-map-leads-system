import type { ToolVerifyResult } from "@/lib/toolVerify";

/** sessionStorage キー（ユーザー正本は管理システム側。ここは表示用キャッシュのみ） */
export const TOOL_USER_SESSION_KEY = "tool_user_session";

/** 管理システム verify 後のユーザー表示用セッション */
export type ToolUserSession = {
  user_id: string;
  username: string | null;
  email: string;
  remaining_credit: number;
};

export function toolVerifyResultToSession(
  result: ToolVerifyResult
): ToolUserSession {
  return {
    user_id: result.user.id,
    username: result.user.username,
    email: result.user.email,
    remaining_credit: result.credit,
  };
}

export function saveToolUserSession(session: ToolUserSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOOL_USER_SESSION_KEY, JSON.stringify(session));
}

export function getToolUserSession(): ToolUserSession | null {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(TOOL_USER_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return parseToolUserSession(parsed);
  } catch {
    return null;
  }
}

export function clearToolUserSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOOL_USER_SESSION_KEY);
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return undefined;
}

function parseToolUserSession(data: unknown): ToolUserSession | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;

  const user_id = pickString(obj.user_id);
  const email = pickString(obj.email);
  const remaining_credit = pickNumber(obj.remaining_credit);
  const usernameRaw = obj.username;
  const username =
    usernameRaw === null
      ? null
      : pickString(usernameRaw) ?? null;

  if (!user_id || !email || remaining_credit === undefined) {
    return null;
  }

  return { user_id, username, email, remaining_credit };
}

export function updateSessionRemainingCredit(credit: number): void {
  const session = getToolUserSession();
  if (!session) return;
  saveToolUserSession({ ...session, remaining_credit: credit });
}
