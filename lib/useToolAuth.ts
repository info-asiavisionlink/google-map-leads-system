"use client";

import {
  CREDIT_FETCH_FAILED_MESSAGE,
  LOGIN_ERROR_MESSAGE,
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
  }, []);

  const runVerify = useCallback(async (token: string) => {
    const res = await fetch("/api/tools/verify", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as ToolVerifyResult & {
      error?: string;
      code?: string;
    };

    if (!res.ok) {
      throw new Error(data.error ?? TOKEN_AUTH_EXPIRED_MESSAGE);
    }

    return data as ToolVerifyResult;
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken() ?? accessToken;
    if (!token) {
      return;
    }

    if (verifiedTokenRef.current === token && verify) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await runVerify(token);
        if (cancelled) return;

        verifiedTokenRef.current = token;
        setAccessToken(token);
        applyVerifyResult(result);
        setAuthError(null);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;

        const message = mapVerifyError(err);
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

  const creditCost = verify?.tool.credit_cost ?? 30;
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
    creditCost,
    remainingCredit,
    canSearch:
      status === "authenticated" &&
      verify !== null &&
      verify.credit >= creditCost,
  };
}
