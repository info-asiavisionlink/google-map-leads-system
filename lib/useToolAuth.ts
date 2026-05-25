"use client";

import { TOKEN_AUTH_EXPIRED_MESSAGE } from "@/lib/constants";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  resolveAccessToken,
} from "@/lib/toolToken";
import type { ToolVerifyResult } from "@/lib/toolVerify";
import { useCallback, useEffect, useRef, useState } from "react";

export type ToolAuthStatus = "loading" | "authenticated" | "unauthenticated";

function readInitialToken(): string | null {
  return resolveAccessToken();
}

/**
 * クライアント専用フック（SearchPage は ssr:false で読み込むこと）。
 */
export function useToolAuth() {
  const initialToken = readInitialToken();

  const [accessToken, setAccessToken] = useState<string | null>(initialToken);
  const [status, setStatus] = useState<ToolAuthStatus>(
    initialToken ? "loading" : "unauthenticated"
  );
  const [verify, setVerify] = useState<ToolVerifyResult | null>(null);
  const [authError, setAuthError] = useState<string | null>(
    initialToken ? null : TOKEN_AUTH_EXPIRED_MESSAGE
  );
  const verifiedTokenRef = useRef<string | null>(null);

  const runVerify = useCallback(async (token: string) => {
    console.log("VERIFY_START");
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
      const err = new Error(data.error ?? TOKEN_AUTH_EXPIRED_MESSAGE);
      console.log("VERIFY_FAILED", err);
      throw err;
    }

    console.log("VERIFY_SUCCESS", data);
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
        setVerify(result);
        setAuthError(null);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;

        console.error("トークン検証エラー:", err);
        const message =
          err instanceof Error ? err.message : TOKEN_AUTH_EXPIRED_MESSAGE;

        if (
          message.includes("認証") ||
          message.includes("トークン") ||
          message.includes("期限")
        ) {
          clearStoredAccessToken();
          verifiedTokenRef.current = null;
          setAccessToken(null);
        }

        setVerify(null);
        setAuthError(message);
        setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, runVerify, verify]);

  const refreshVerify = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) return null;
    const result = await runVerify(token);
    verifiedTokenRef.current = token;
    setVerify(result);
    setStatus("authenticated");
    setAuthError(null);
    return result;
  }, [runVerify]);

  const creditCost = verify?.tool.credit_cost ?? 30;

  return {
    status,
    accessToken: getStoredAccessToken() ?? accessToken,
    verify,
    authError,
    runVerify,
    refreshVerify,
    setVerify,
    creditCost,
    canSearch:
      status === "authenticated" &&
      verify !== null &&
      verify.credit >= creditCost,
  };
}
