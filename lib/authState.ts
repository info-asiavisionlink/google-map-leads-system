"use client";

import { parseRemainingCredit } from "@/lib/toolUserMapping";

/** ダッシュボード連携の共通認証状態（表示・検索・クレジット消費で共用） */
export type AuthState = {
  userId: string;
  accessToken?: string;
  token?: string;
  credit?: number;
  email?: string;
  nickname?: string;
};

export const AUTH_STORAGE_KEYS = {
  userId: "dashboard_user_id",
  accessToken: "dashboard_access_token",
  token: "dashboard_token",
  credit: "dashboard_credit",
  email: "dashboard_email",
  nickname: "dashboard_nickname",
} as const;

/** 後方互換: sessionStorage キー */
export const LEGACY_ACCESS_TOKEN_KEY = "tool_access_token";
export const LEGACY_USER_QUERY_KEY = "tool_user_query";

const AUTH_URL_KEYS = [
  "user_id",
  "token",
  "access_token",
  "credit",
  "remaining_credit",
  "email",
  "nickname",
  "username",
] as const;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function readUrlParams(): URLSearchParams {
  if (!isBrowser()) return new URLSearchParams();
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!search.has(key)) search.set(key, value);
    });
  }
  return search;
}

function hasAnyAuthParam(params: URLSearchParams): boolean {
  return AUTH_URL_KEYS.some((key) => params.has(key));
}

function parseCreditFromParams(params: URLSearchParams): number | undefined {
  const creditRaw = params.get("credit") ?? params.get("remaining_credit");
  if (creditRaw === null) return undefined;
  const parsed = parseRemainingCredit(creditRaw);
  return parsed ?? undefined;
}

function readAuthFromLocalStorage(): Partial<AuthState> {
  if (!isBrowser()) return {};

  const creditRaw = localStorage.getItem(AUTH_STORAGE_KEYS.credit);
  const creditParsed =
    creditRaw !== null ? parseRemainingCredit(creditRaw) : null;

  const fromLocal: Partial<AuthState> = {
    userId: localStorage.getItem(AUTH_STORAGE_KEYS.userId) ?? undefined,
    accessToken:
      localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ?? undefined,
    token: localStorage.getItem(AUTH_STORAGE_KEYS.token) ?? undefined,
    credit: creditParsed ?? undefined,
    email: localStorage.getItem(AUTH_STORAGE_KEYS.email) ?? undefined,
    nickname: localStorage.getItem(AUTH_STORAGE_KEYS.nickname) ?? undefined,
  };

  if (fromLocal.userId) return fromLocal;

  return readLegacySessionStorage();
}

function readLegacySessionStorage(): Partial<AuthState> {
  const token =
    sessionStorage.getItem(LEGACY_ACCESS_TOKEN_KEY) ??
    localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ??
    localStorage.getItem(AUTH_STORAGE_KEYS.token) ??
    undefined;

  const rawQuery = sessionStorage.getItem(LEGACY_USER_QUERY_KEY);
  if (!rawQuery) {
    return token ? { accessToken: token, token } : {};
  }

  try {
    const parsed: unknown = JSON.parse(rawQuery);
    if (typeof parsed !== "object" || parsed === null) {
      return token ? { accessToken: token, token } : {};
    }
    const obj = parsed as Record<string, unknown>;
    const userId = pickString(obj.user_id);
    const email = pickString(obj.email);
    const nickname = pickString(obj.username);
    const credit =
      typeof obj.remaining_credit === "number"
        ? obj.remaining_credit
        : parseRemainingCredit(
            typeof obj.remaining_credit === "string"
              ? obj.remaining_credit
              : null
          ) ?? undefined;

    return {
      userId,
      accessToken: token,
      token,
      credit,
      email,
      nickname,
    };
  } catch {
    return token ? { accessToken: token, token } : {};
  }
}

export function saveAuthState(state: AuthState): void {
  if (!isBrowser()) return;

  localStorage.setItem(AUTH_STORAGE_KEYS.userId, state.userId);
  if (state.accessToken) {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, state.accessToken);
  }
  if (state.token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, state.token);
  }
  if (state.credit !== undefined) {
    localStorage.setItem(AUTH_STORAGE_KEYS.credit, String(state.credit));
  }
  if (state.email) {
    localStorage.setItem(AUTH_STORAGE_KEYS.email, state.email);
  }
  if (state.nickname) {
    localStorage.setItem(AUTH_STORAGE_KEYS.nickname, state.nickname);
  }

  const effectiveToken = getEffectiveToken(state);
  if (effectiveToken) {
    sessionStorage.setItem(LEGACY_ACCESS_TOKEN_KEY, effectiveToken);
  }

  sessionStorage.setItem(
    LEGACY_USER_QUERY_KEY,
    JSON.stringify({
      user_id: state.userId,
      username: state.nickname ?? "",
      email: state.email ?? "",
      remaining_credit: state.credit ?? 0,
    })
  );
}

export function clearAuthState(): void {
  if (!isBrowser()) return;

  Object.values(AUTH_STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
  sessionStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_USER_QUERY_KEY);
}

export function getEffectiveToken(state: AuthState | null): string | null {
  if (!state) return null;
  return state.accessToken?.trim() || state.token?.trim() || null;
}

export function isAuthStateComplete(state: AuthState | null): state is AuthState {
  if (!state?.userId?.trim()) return false;
  return Boolean(getEffectiveToken(state));
}

function mergeAuthState(
  stored: Partial<AuthState>,
  fromUrl: Partial<AuthState>
): AuthState | null {
  const userId = fromUrl.userId ?? stored.userId;
  if (!userId) return null;

  return {
    userId,
    accessToken: fromUrl.accessToken ?? stored.accessToken,
    token: fromUrl.token ?? stored.token,
    credit: fromUrl.credit ?? stored.credit,
    email: fromUrl.email ?? stored.email,
    nickname: fromUrl.nickname ?? stored.nickname,
  };
}

function cleanAuthParamsFromUrl(): void {
  if (!isBrowser()) return;

  const searchParams = new URLSearchParams(window.location.search);
  for (const key of AUTH_URL_KEYS) {
    searchParams.delete(key);
  }
  searchParams.delete("access_token");

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = hash ? new URLSearchParams(hash) : new URLSearchParams();
  for (const key of AUTH_URL_KEYS) {
    hashParams.delete(key);
  }
  hashParams.delete("access_token");

  const query = searchParams.toString();
  const newHash = hashParams.toString();
  const cleanedUrl =
    window.location.pathname +
    (query ? `?${query}` : "") +
    (newHash ? `#${newHash}` : "");

  window.history.replaceState({}, "", cleanedUrl);
}

function readAuthFromUrl(): Partial<AuthState> | null {
  const params = readUrlParams();
  if (!hasAnyAuthParam(params)) return null;

  const accessToken = pickString(params.get("access_token"));
  const token = pickString(params.get("token"));
  const userId = pickString(params.get("user_id"));
  const email = pickString(params.get("email"));
  const nickname =
    pickString(params.get("nickname")) ?? pickString(params.get("username"));

  return {
    userId,
    accessToken,
    token,
    credit: parseCreditFromParams(params),
    email,
    nickname,
  };
}

/**
 * URL → localStorage → マージした AuthState を返す。
 * URL に認証パラメータがある場合は localStorage に保存し URL から削除する。
 */
export function resolveAuthState(): AuthState | null {
  if (!isBrowser()) return null;

  const stored = readAuthFromLocalStorage();
  const fromUrl = readAuthFromUrl();

  if (fromUrl) {
    cleanAuthParamsFromUrl();
  }

  const merged = mergeAuthState(stored, fromUrl ?? {});
  if (!merged) return null;

  saveAuthState(merged);
  return merged;
}

export function updateAuthStateCredit(credit: number): AuthState | null {
  if (!isBrowser()) return null;

  const current = resolveAuthStateWithoutUrl();
  if (!current) return null;

  const next = { ...current, credit };
  saveAuthState(next);
  return next;
}

/** URL を再読み込みせず localStorage のみから復元 */
export function resolveAuthStateWithoutUrl(): AuthState | null {
  const stored = readAuthFromLocalStorage();
  if (!stored.userId) return null;
  return mergeAuthState({}, stored);
}

export function maskTokenForLog(token: string | undefined | null): string {
  if (!token) return "(empty)";
  if (token.length <= 5) return `${token.slice(0, 1)}***`;
  return `${token.slice(0, 5)}***`;
}

export function logAuthStateDebug(
  label: string,
  state: AuthState | null,
  extra?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production") return;

  console.log(`[authState] ${label}`, {
    userId: state?.userId ?? "(empty)",
    accessToken: maskTokenForLog(state?.accessToken),
    token: maskTokenForLog(state?.token),
    effectiveToken: maskTokenForLog(getEffectiveToken(state)),
    credit: state?.credit ?? "(n/a)",
    email: state?.email ?? "(n/a)",
    nickname: state?.nickname ?? "(n/a)",
    ...extra,
  });
}
