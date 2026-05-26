"use client";

import {
  AUTH_STORAGE_KEYS,
  LEGACY_ACCESS_TOKEN_KEY,
} from "@/lib/authState";
import {
  authDebugClientInfo,
  isClientAuthDebugEnabled,
  logSessionStorageState,
  logTokenAcquisition,
} from "@/lib/authDebugClient";

/** @deprecated authState の LEGACY_ACCESS_TOKEN_KEY と同値 */
export const TOOL_ACCESS_TOKEN_KEY = LEGACY_ACCESS_TOKEN_KEY;

const TOKEN_PARAMS = ["access_token", "token"] as const;

export function readTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const searchParams = new URLSearchParams(window.location.search);
  for (const param of TOKEN_PARAMS) {
    const fromQuery = searchParams.get(param)?.trim();
    if (fromQuery) return decodeURIComponent(fromQuery);
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const param of TOKEN_PARAMS) {
      const fromHash = hashParams.get(param)?.trim();
      if (fromHash) return decodeURIComponent(fromHash);
    }
  }

  return null;
}

function buildCleanUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);
  for (const param of TOKEN_PARAMS) {
    searchParams.delete(param);
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = hash ? new URLSearchParams(hash) : new URLSearchParams();
  for (const param of TOKEN_PARAMS) {
    hashParams.delete(param);
  }

  const query = searchParams.toString();
  const newHash = hashParams.toString();
  return (
    window.location.pathname +
    (query ? `?${query}` : "") +
    (newHash ? `#${newHash}` : "")
  );
}

function detectTokenSource(): "url_query" | "url_hash" | "none" {
  if (typeof window === "undefined") return "none";

  const searchParams = new URLSearchParams(window.location.search);
  for (const param of TOKEN_PARAMS) {
    if (searchParams.get(param)?.trim()) return "url_query";
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const param of TOKEN_PARAMS) {
      if (hashParams.get(param)?.trim()) return "url_hash";
    }
  }

  return "none";
}

function persistTokenToAuthStorage(token: string, paramName: string): void {
  sessionStorage.setItem(LEGACY_ACCESS_TOKEN_KEY, token);
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, token);
  if (paramName === "token") {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, token);
  }
}

export function resolveAccessToken(): string | null {
  if (typeof window === "undefined") return null;

  const urlSource = detectTokenSource();
  const fromUrl = readTokenFromUrl();

  if (fromUrl) {
    const searchParams = new URLSearchParams(window.location.search);
    const paramName =
      searchParams.get("access_token")?.trim() ? "access_token" : "token";
    persistTokenToAuthStorage(fromUrl, paramName);

    const cleanedUrl = buildCleanUrl();
    window.history.replaceState({}, "", cleanedUrl);

    if (isClientAuthDebugEnabled()) {
      logTokenAcquisition(
        urlSource === "none" ? "url_query" : urlSource,
        fromUrl
      );
      authDebugClientInfo("sessionStorage-write", {
        key: LEGACY_ACCESS_TOKEN_KEY,
        tool_access_token_saved: true,
        saved_length: fromUrl.length,
      });
      logSessionStorageState();
    }

    return fromUrl;
  }

  const fromLocal =
    localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ??
    localStorage.getItem(AUTH_STORAGE_KEYS.token);
  if (fromLocal) return fromLocal;

  const stored = sessionStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);

  if (isClientAuthDebugEnabled()) {
    logTokenAcquisition("session_storage", stored);
    logSessionStorageState();
  }

  return stored;
}

/** @deprecated resolveAccessToken を使用 */
export function captureAccessTokenFromUrl(): string | null {
  return resolveAccessToken();
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ??
    localStorage.getItem(AUTH_STORAGE_KEYS.token) ??
    sessionStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)
  );
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.token);
}

export function getDashboardBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_DASHBOARD_BASE_URL が設定されていません");
  }
  return url.replace(/\/$/, "");
}

export function getDashboardUrl(path: string): string {
  return `${getDashboardBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getSafeDashboardUrl(path: string): string {
  try {
    return getDashboardUrl(path);
  } catch {
    return path;
  }
}
