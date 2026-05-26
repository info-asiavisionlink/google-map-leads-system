"use client";

import {
  AUTH_DEBUG_LOG_PREFIX,
  type AuthDebugFields,
  getAuthSystemApiUrlInfo,
  maskToken,
  safeJsonForLog,
} from "@/lib/authDebug";
import { useSyncExternalStore } from "react";

const AUTH_DEBUG_SESSION_KEY = "auth_debug_enabled";
const AUTH_DEBUG_QUERY_PARAM = "auth_debug";

export type AuthDebugLogEntry = {
  id: string;
  ts: string;
  level: "info" | "error";
  scope: string;
  fields: AuthDebugFields;
};

const MAX_ENTRIES = 120;
let entries: AuthDebugLogEntry[] = [];
let entrySeq = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthDebugLogEntry[] {
  return entries;
}

export function isClientAuthDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG === "true") return true;
  if (typeof window === "undefined") return false;

  if (sessionStorage.getItem(AUTH_DEBUG_SESSION_KEY) === "1") return true;

  const params = new URLSearchParams(window.location.search);
  return params.get(AUTH_DEBUG_QUERY_PARAM) === "1";
}

/** ?auth_debug=1 を sessionStorage に保持（URL クリーン後もデバッグ継続） */
export function bootstrapClientAuthDebug(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (params.get(AUTH_DEBUG_QUERY_PARAM) === "1") {
    sessionStorage.setItem(AUTH_DEBUG_SESSION_KEY, "1");
  }
}

function pushEntry(
  level: "info" | "error",
  scope: string,
  fields: AuthDebugFields
): void {
  if (!isClientAuthDebugEnabled()) return;

  entrySeq += 1;
  const entry: AuthDebugLogEntry = {
    id: `${Date.now()}-${entrySeq}`,
    ts: new Date().toISOString(),
    level,
    scope,
    fields,
  };

  entries = [entry, ...entries].slice(0, MAX_ENTRIES);

  const line = `${AUTH_DEBUG_LOG_PREFIX}[${scope}] ${Object.entries(fields)
    .map(([k, v]) => `${k}=${v === undefined ? "undefined" : String(v)}`)
    .join(" ")}`;

  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }

  notify();
}

export function authDebugClientInfo(
  scope: string,
  fields: AuthDebugFields
): void {
  pushEntry("info", scope, fields);
}

export function authDebugClientError(
  scope: string,
  fields: AuthDebugFields
): void {
  pushEntry("error", scope, fields);
}

export function useAuthDebugLogs(): AuthDebugLogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}

export function logPageLoadContext(): void {
  if (typeof window === "undefined") return;

  const apiInfo = getAuthSystemApiUrlInfo();

  authDebugClientInfo("page-load", {
    window_location_href: window.location.href,
    window_location_search: window.location.search || "(empty)",
    document_referrer: document.referrer || "(none)",
    auth_debug_enabled: isClientAuthDebugEnabled(),
    auth_system_api_url_client: apiInfo.url ?? "(not set on client env)",
    note: "AUTH_SYSTEM_API_URL はサーバーのみ。クライアントは NEXT_PUBLIC_DASHBOARD_BASE_URL を参照",
  });
}

export function logTokenAcquisition(
  source: "url_query" | "url_hash" | "session_storage" | "none",
  token: string | null
): void {
  const masked = maskToken(token);
  authDebugClientInfo("access_token", {
    source,
    token_acquired: masked.token_exists,
    token_empty: !masked.token_exists,
    token_length: masked.token_length,
    token_preview: masked.token_preview,
  });
}

export function logSessionStorageState(): void {
  if (typeof window === "undefined") return;

  const accessToken = sessionStorage.getItem("tool_access_token");
  const userSession = sessionStorage.getItem("tool_user_session");

  authDebugClientInfo("sessionStorage", {
    tool_access_token_saved: accessToken !== null,
    tool_access_token_length: accessToken?.length ?? 0,
    tool_user_session_saved: userSession !== null,
    tool_user_session_length: userSession?.length ?? 0,
  });
}

export function logVerifyRequest(params: {
  request_url: string;
  authorization_header_exists: boolean;
  token_length: number;
}): void {
  authDebugClientInfo("verify-api-request", params);
}

export function logVerifyResponse(params: {
  response_status: number;
  response_ok: boolean;
  response_body: string;
}): void {
  const level = params.response_ok ? "info" : "error";
  const fn =
    level === "error" ? authDebugClientError : authDebugClientInfo;
  fn("verify-api-response", params);
}

export function logVerifySuccessUser(params: {
  user_id: string;
  username: string | null;
  email: string;
  remaining_credit: number;
}): void {
  authDebugClientInfo("verify-success", {
    user_id: params.user_id,
    username: params.username ?? "(null)",
    email: params.email,
    remaining_credit: params.remaining_credit,
  });
}

export function logVerifyFailure(params: {
  error_message: string;
  response_status?: number;
  response_body: string;
}): void {
  authDebugClientError("verify-failed", {
    error_message: params.error_message,
    response_status: params.response_status ?? "(n/a)",
    response_body: params.response_body,
  });
}

export function logSearchApiResponse(params: {
  response_status: number;
  code?: string;
  message: string;
  credit?: number | null;
}): void {
  authDebugClientInfo("search-api", {
    response_status: params.response_status,
    code: params.code ?? "(none)",
    message: params.message,
    credit_after: params.credit ?? "(n/a)",
    consume_hint:
      params.code === "consume_failed"
        ? "POST /api/credits/consume failed on auth system"
        : params.response_status === 200 && params.code !== "consume_failed"
          ? "consume may have succeeded (check Vercel logs)"
          : "(see server logs)",
  });
}

export { safeJsonForLog, maskToken };
