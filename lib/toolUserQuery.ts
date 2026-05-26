"use client";

import { parseRemainingCredit } from "@/lib/toolUserMapping";
import type { ToolUserQuery } from "@/lib/toolUser";

export const TOOL_USER_QUERY_STORAGE_KEY = "tool_user_query";

const QUERY_KEYS = ["user_id", "username", "email", "remaining_credit"] as const;

export type ReadToolUserQueryResult =
  | { ok: true; query: ToolUserQuery; from: "url" | "session_storage" }
  | { ok: false; code: "query_missing" | "user_id_missing"; missing: string[] };

function readFromSearchParams(params: URLSearchParams): ReadToolUserQueryResult {
  const user_id = params.get("user_id")?.trim() ?? "";
  const username = params.get("username")?.trim() ?? "";
  const email = params.get("email")?.trim() ?? "";
  const remainingCreditRaw = params.get("remaining_credit");
  const remaining_credit = parseRemainingCredit(remainingCreditRaw);

  const missing: string[] = [];
  if (!user_id) missing.push("user_id");
  if (!username) missing.push("username");
  if (!email) missing.push("email");
  if (remaining_credit === null) missing.push("remaining_credit");

  if (missing.includes("user_id")) {
    return { ok: false, code: "user_id_missing", missing };
  }

  if (missing.length > 0) {
    return { ok: false, code: "query_missing", missing };
  }

  const credit = remaining_credit as number;

  return {
    ok: true,
    from: "url",
    query: {
      user_id,
      username,
      email,
      remaining_credit: credit,
    },
  };
}

function buildCleanUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);
  for (const key of QUERY_KEYS) {
    searchParams.delete(key);
  }
  const query = searchParams.toString();
  return window.location.pathname + (query ? `?${query}` : "");
}

function saveQueryToSession(query: ToolUserQuery): void {
  sessionStorage.setItem(TOOL_USER_QUERY_STORAGE_KEY, JSON.stringify(query));
}

function readQueryFromSession(): ToolUserQuery | null {
  const raw = sessionStorage.getItem(TOOL_USER_QUERY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const user_id = typeof obj.user_id === "string" ? obj.user_id.trim() : "";
    const username =
      typeof obj.username === "string" ? obj.username.trim() : "";
    const email = typeof obj.email === "string" ? obj.email.trim() : "";
    const remaining_credit =
      typeof obj.remaining_credit === "number"
        ? obj.remaining_credit
        : parseRemainingCredit(
            typeof obj.remaining_credit === "string"
              ? obj.remaining_credit
              : null
          );

    if (!user_id || !username || !email || remaining_credit === null) {
      return null;
    }

    return { user_id, username, email, remaining_credit };
  } catch {
    return null;
  }
}

/**
 * URL の query を読み取り sessionStorage に保存し、URL から削除する。
 */
export function resolveToolUserQuery(): ReadToolUserQueryResult {
  if (typeof window === "undefined") {
    return { ok: false, code: "query_missing", missing: ["user_id"] };
  }

  const params = new URLSearchParams(window.location.search);
  const hasAnyQueryKey = QUERY_KEYS.some((key) => params.has(key));

  if (hasAnyQueryKey) {
    const fromUrl = readFromSearchParams(params);
    if (fromUrl.ok) {
      saveQueryToSession(fromUrl.query);
      const cleanedUrl = buildCleanUrl();
      window.history.replaceState({}, "", cleanedUrl);
      console.info("[tool-user-mapping] query_saved_from_url", {
        user_id: fromUrl.query.user_id,
        username: fromUrl.query.username,
        email: fromUrl.query.email,
        remaining_credit: fromUrl.query.remaining_credit,
      });
    }
    return fromUrl;
  }

  const stored = readQueryFromSession();
  if (stored) {
    return { ok: true, from: "session_storage", query: stored };
  }

  return {
    ok: false,
    code: "query_missing",
    missing: [...QUERY_KEYS],
  };
}

export function clearToolUserQueryStorage(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOOL_USER_QUERY_STORAGE_KEY);
}
