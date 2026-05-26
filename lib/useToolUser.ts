"use client";

import {
  TOOL_USER_CREDIT_FETCH_FAILED_MESSAGE,
  TOOL_USER_ID_MISSING_MESSAGE,
  TOOL_USER_MISMATCH_MESSAGE,
  TOOL_USER_NOT_FOUND_MESSAGE,
  TOOL_USER_QUERY_MISSING_MESSAGE,
  TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE,
  TOOL_USER_VERIFY_FAILED_MESSAGE,
} from "@/lib/constants";
import type {
  ToolUser,
  ToolUserAuthErrorCode,
  ToolUserAuthStatus,
  ToolUserVerifyApiResponse,
} from "@/lib/toolUser";
import {
  clearToolUserQueryStorage,
  resolveToolUserQuery,
} from "@/lib/toolUserQuery";
import { useCallback, useEffect, useRef, useState } from "react";

function mapErrorMessage(code: ToolUserAuthErrorCode, fallback: string): string {
  switch (code) {
    case "query_missing":
      return TOOL_USER_QUERY_MISSING_MESSAGE;
    case "user_id_missing":
      return TOOL_USER_ID_MISSING_MESSAGE;
    case "supabase_connection_failed":
      return TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE;
    case "user_not_found":
      return TOOL_USER_NOT_FOUND_MESSAGE;
    case "credit_fetch_failed":
      return TOOL_USER_CREDIT_FETCH_FAILED_MESSAGE;
    case "mismatch":
      return TOOL_USER_MISMATCH_MESSAGE;
    default:
      return fallback || TOOL_USER_VERIFY_FAILED_MESSAGE;
  }
}

function isToolUserAuthErrorCode(value: string): value is ToolUserAuthErrorCode {
  return [
    "query_missing",
    "user_id_missing",
    "supabase_connection_failed",
    "user_not_found",
    "credit_fetch_failed",
    "mismatch",
    "verify_request_failed",
  ].includes(value);
}

export function useToolUser() {
  const [status, setStatus] = useState<ToolUserAuthStatus>("loading");
  const [user, setUser] = useState<ToolUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ToolUserAuthErrorCode | null>(null);
  const verifiedQueryRef = useRef<string | null>(null);

  const runVerify = useCallback(
    async (query: {
      user_id: string;
      username: string;
      email: string;
      remaining_credit: number;
    }) => {
      console.info("[tool-user-mapping] verify_request", {
        query_user_id: query.user_id,
        username: query.username,
        email: query.email,
        remaining_credit: query.remaining_credit,
      });

      const res = await fetch("/api/tools/user-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(query),
      });

      const data = (await res.json()) as ToolUserVerifyApiResponse;

      console.info("[tool-user-mapping] verify_response", {
        status: res.status,
        ok: data.ok,
      });

      if (!data.ok) {
        const error = new Error(data.error) as Error & {
          code: ToolUserAuthErrorCode;
        };
        error.code = data.code;
        throw error;
      }

      return data.user;
    },
    []
  );

  useEffect(() => {
    const queryResult = resolveToolUserQuery();

    if (!queryResult.ok) {
      const code = queryResult.code;
      queueMicrotask(() => {
        setStatus("unauthenticated");
        setAuthError(mapErrorMessage(code, ""));
        setErrorCode(code);
        setUser(null);
      });
      return;
    }

    const { query } = queryResult;
    const queryKey = JSON.stringify(query);

    if (verifiedQueryRef.current === queryKey) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setStatus("loading");
      setAuthError(null);
      setErrorCode(null);

      try {
        const verifiedUser = await runVerify(query);
        if (cancelled) return;

        verifiedQueryRef.current = queryKey;
        setUser(verifiedUser);
        setStatus("authenticated");
        setAuthError(null);
        setErrorCode(null);

        console.info("[tool-user-mapping] verify_complete", {
          query_user_id: query.user_id,
          supabase_user_id: verifiedUser.id,
          username: verifiedUser.username ?? "",
          email: verifiedUser.email,
          credit: verifiedUser.credit,
          matched: true,
        });
      } catch (err) {
        if (cancelled) return;

        const code =
          err instanceof Error &&
          "code" in err &&
          typeof err.code === "string" &&
          isToolUserAuthErrorCode(err.code)
            ? err.code
            : "verify_request_failed";

        const message =
          err instanceof Error
            ? mapErrorMessage(code, err.message)
            : TOOL_USER_VERIFY_FAILED_MESSAGE;

        if (code === "mismatch" || code === "user_not_found") {
          clearToolUserQueryStorage();
          verifiedQueryRef.current = null;
        }

        setUser(null);
        setStatus("unauthenticated");
        setAuthError(message);
        setErrorCode(code);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runVerify]);

  const patchUserCredit = useCallback((credit: number) => {
    setUser((prev) => (prev ? { ...prev, credit } : prev));
  }, []);

  return {
    status,
    user,
    authError,
    errorCode,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated" && user !== null,
    remainingCredit: user?.credit ?? null,
    patchUserCredit,
  };
}
