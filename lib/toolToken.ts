"use client";

import {
  authDebugClientInfo,
  isClientAuthDebugEnabled,
  logSessionStorageState,
  logTokenAcquisition,
} from "@/lib/authDebugClient";

/** sessionStorage キー（localStorage は使わない） */
export const TOOL_ACCESS_TOKEN_KEY = "tool_access_token";

const TOKEN_PARAM = "access_token";

export function readTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const searchParams = new URLSearchParams(window.location.search);
  const fromQuery = searchParams.get(TOKEN_PARAM)?.trim();
  if (fromQuery) return decodeURIComponent(fromQuery);

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const fromHash = hashParams.get(TOKEN_PARAM)?.trim();
    if (fromHash) return decodeURIComponent(fromHash);
  }

  return null;
}

function buildCleanUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete(TOKEN_PARAM);

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = hash ? new URLSearchParams(hash) : new URLSearchParams();
  hashParams.delete(TOKEN_PARAM);

  const query = searchParams.toString();
  const newHash = hashParams.toString();
  return (
    window.location.pathname +
    (query ? `?${query}` : "") +
    (newHash ? `#${newHash}` : "")
  );
}

/**
 * URL の access_token を sessionStorage に保存し、URL から削除する。
 * クライアント専用（ブラウザ上でのみ呼び出すこと）。
 */
function detectTokenSource(): "url_query" | "url_hash" | "none" {
  if (typeof window === "undefined") return "none";

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get(TOKEN_PARAM)?.trim()) return "url_query";

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get(TOKEN_PARAM)?.trim()) return "url_hash";
  }

  return "none";
}

export function resolveAccessToken(): string | null {
  if (typeof window === "undefined") return null;

  const urlSource = detectTokenSource();
  const fromUrl = readTokenFromUrl();

  if (fromUrl) {
    sessionStorage.setItem(TOOL_ACCESS_TOKEN_KEY, fromUrl);
    const cleanedUrl = buildCleanUrl();
    window.history.replaceState({}, "", cleanedUrl);

    if (isClientAuthDebugEnabled()) {
      logTokenAcquisition(
        urlSource === "none" ? "url_query" : urlSource,
        fromUrl
      );
      authDebugClientInfo("sessionStorage-write", {
        key: TOOL_ACCESS_TOKEN_KEY,
        tool_access_token_saved: true,
        saved_length: fromUrl.length,
      });
      logSessionStorageState();
    }

    return fromUrl;
  }

  const stored = sessionStorage.getItem(TOOL_ACCESS_TOKEN_KEY);

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
  return sessionStorage.getItem(TOOL_ACCESS_TOKEN_KEY);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOOL_ACCESS_TOKEN_KEY);
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
