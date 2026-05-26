"use client";

import {
  authDebugClientError,
  authDebugClientInfo,
  isClientAuthDebugEnabled,
  logSessionStorageState,
  logVerifyFailure,
  logVerifyRequest,
  logVerifyResponse,
  logVerifySuccessUser,
  safeJsonForLog,
} from "@/lib/authDebugClient";
import {
  CREDIT_FETCH_FAILED_MESSAGE,
  LOGIN_ERROR_MESSAGE,
  MIN_CREDIT_TO_SEARCH,
  TOKEN_AUTH_EXPIRED_MESSAGE,
} from "@/lib/constants";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  resolveAccessToken,
} from "@/lib/toolToken";
import {
  clearToolUserSession,
  getToolUserSession,
  saveToolUserSession,
  toolVerifyResultToSession,
  updateSessionRemainingCredit,
  type ToolUserSession,
} from "@/lib/toolUserSession";
import type { ToolVerifyResult } from "@/lib/toolVerify";
import { useCallback, useEffect, useRef, useState } from "react";

export type ToolAuthStatus = "loading" | "authenticated" | "unauthenticated";

function readInitialToken(): string | null {
  return resolveAccessToken();
}

function isCreditFetchError(message: string): boolean {
  return (
    message.includes("credit") ||
    message.includes("クレジット") ||
    message.includes("残高")
  );
}

function mapVerifyError(err: unknown): string {
  const message =
    err instanceof Error ? err.message : TOKEN_AUTH_EXPIRED_MESSAGE;

  if (isCreditFetchError(message)) {
    return CREDIT_FETCH_FAILED_MESSAGE;
  }

  if (
    message.includes("認証") ||
    message.includes("トークン") ||
    message.includes("期限") ||
    message.includes("ログイン")
  ) {
    return message.includes("ログイン") ? message : LOGIN_ERROR_MESSAGE;
  }

  return message || LOGIN_ERROR_MESSAGE;
}

/**
 * クライアント専用フック（SearchPage は ssr:false で読み込むこと）。
 */
export function useToolAuth() {
  const initialToken = readInitialToken();
  const initialSession = getToolUserSession();

  const [accessToken, setAccessToken] = useState<string | null>(initialToken);
  const [userSession, setUserSession] = useState<ToolUserSession | null>(
    initialSession
  );
  const [status, setStatus] = useState<ToolAuthStatus>(
    initialToken ? "loading" : "unauthenticated"
  );
  const [verify, setVerify] = useState<ToolVerifyResult | null>(null);
  const [authError, setAuthError] = useState<string | null>(
    initialToken ? null : TOKEN_AUTH_EXPIRED_MESSAGE
  );
  const verifiedTokenRef = useRef<string | null>(null);

  const applyVerifyResult = useCallback((result: ToolVerifyResult) => {
    const session = toolVerifyResultToSession(result);
    saveToolUserSession(session);
    setUserSession(session);
    setVerify(result);

    if (isClientAuthDebugEnabled()) {
      logVerifySuccessUser({
        user_id: session.user_id,
        username: session.username,
        email: session.email,
        remaining_credit: session.remaining_credit,
      });
    }
  }, []);

  const runVerify = useCallback(async (token: string) => {
    const requestUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/tools/verify`
        : "/api/tools/verify";

    logVerifyRequest({
      request_url: requestUrl,
      authorization_header_exists: true,
      token_length: token.length,
    });

    const res = await fetch("/api/tools/verify", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const rawText = await res.text();
    type VerifyApiBody = ToolVerifyResult | { error?: string; code?: string };
    let data: VerifyApiBody;

    try {
      data = JSON.parse(rawText) as VerifyApiBody;
    } catch {
      data = { error: "レスポンスの JSON 解析に失敗しました" };
    }

    logVerifyResponse({
      response_status: res.status,
      response_ok: res.ok,
      response_body: rawText || safeJsonForLog(data),
    });

    if (!res.ok) {
      const errMessage =
        "error" in data && typeof data.error === "string"
          ? data.error
          : TOKEN_AUTH_EXPIRED_MESSAGE;
      logVerifyFailure({
        error_message: errMessage,
        response_status: res.status,
        response_body: rawText || safeJsonForLog(data),
      });
      throw new Error(errMessage);
    }

    if (!("user" in data && "credit" in data)) {
      throw new Error("トークン検証レスポンスの形式が不正です");
    }

    return data;
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken() ?? accessToken;

    if (!token) {
      if (isClientAuthDebugEnabled()) {
        authDebugClientError("auth-flow", {
          step: "no_token",
          message: "access_token が URL にも sessionStorage にもありません",
        });
      }
      return;
    }

    if (verifiedTokenRef.current === token && verify) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        authDebugClientInfo("auth-flow", { step: "verify_start" });
        const result = await runVerify(token);
        if (cancelled) return;

        verifiedTokenRef.current = token;
        setAccessToken(token);
        applyVerifyResult(result);
        setAuthError(null);
        setStatus("authenticated");
        authDebugClientInfo("auth-flow", { step: "verify_complete", status: "authenticated" });
        logSessionStorageState();
      } catch (err) {
        if (cancelled) return;

        const message = mapVerifyError(err);
        authDebugClientError("auth-flow", {
          step: "verify_failed",
          failure_point: "client_runVerify_or_api_tools_verify",
          error_message: message,
        });

        const isAuthFailure =
          message === LOGIN_ERROR_MESSAGE ||
          message === TOKEN_AUTH_EXPIRED_MESSAGE ||
          (err instanceof Error &&
            (err.message.includes("認証") ||
              err.message.includes("トークン") ||
              err.message.includes("期限")));

        if (isAuthFailure) {
          clearStoredAccessToken();
          clearToolUserSession();
          verifiedTokenRef.current = null;
          setAccessToken(null);
          setUserSession(null);
          logSessionStorageState();
        }

        setVerify(null);
        setAuthError(message);
        setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, applyVerifyResult, runVerify, verify]);

  const refreshVerify = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) return null;
    const result = await runVerify(token);
    verifiedTokenRef.current = token;
    applyVerifyResult(result);
    setStatus("authenticated");
    setAuthError(null);
    return result;
  }, [applyVerifyResult, runVerify]);

  const setVerifyWithSession = useCallback(
    (next: ToolVerifyResult) => {
      applyVerifyResult(next);
    },
    [applyVerifyResult]
  );

  const patchRemainingCredit = useCallback((credit: number) => {
    updateSessionRemainingCredit(credit);
    setUserSession((prev) =>
      prev ? { ...prev, remaining_credit: credit } : prev
    );
    setVerify((prev) => (prev ? { ...prev, credit } : prev));
  }, []);

  const remainingCredit =
    userSession?.remaining_credit ?? verify?.credit ?? null;

  return {
    status,
    accessToken: getStoredAccessToken() ?? accessToken,
    verify,
    userSession,
    authError,
    runVerify,
    refreshVerify,
    setVerify: setVerifyWithSession,
    patchRemainingCredit,
    remainingCredit,
    canSearch:
      status === "authenticated" &&
      verify !== null &&
      verify.credit >= MIN_CREDIT_TO_SEARCH,
  };
}
