"use client";

import {
  clearAuthState,
  getActiveCredit,
  getActiveUserId,
  isAuthStateComplete,
  logAuthStateDebug,
  resolveAuthState,
  saveAuthState,
  type AuthState,
  updateAuthStateCredit,
} from "@/lib/authState";
import { useCallback, useEffect, useState } from "react";

function readInitialAuthState(): AuthState | null {
  if (typeof window === "undefined") return null;
  return resolveAuthState();
}

export function useAuthState() {
  const [authState, setAuthState] = useState<AuthState | null>(
    readInitialAuthState
  );
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    return readInitialAuthState() === null;
  });

  useEffect(() => {
    const state = resolveAuthState();
    queueMicrotask(() => {
      setAuthState(state);
      setIsLoading(false);
      logAuthStateDebug("initialized", state);
    });
  }, []);

  const patchCredit = useCallback((credit: number) => {
    const next = updateAuthStateCredit(credit);
    if (next) {
      setAuthState(next);
      logAuthStateDebug("credit_updated", next);
    }
  }, []);

  const clearAuth = useCallback(() => {
    clearAuthState();
    setAuthState(null);
    logAuthStateDebug("cleared", null);
  }, []);

  const refreshAuthState = useCallback(() => {
    const state = resolveAuthState();
    setAuthState(state);
    logAuthStateDebug("refreshed", state);
    return state;
  }, []);

  const updateAuth = useCallback((partial: Partial<AuthState>) => {
    setAuthState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      saveAuthState(next);
      logAuthStateDebug("updated", next);
      return next;
    });
  }, []);

  const isAuthenticated = isAuthStateComplete(authState);

  return {
    authState,
    isLoading,
    isAuthenticated,
    patchCredit,
    clearAuth,
    refreshAuthState,
    updateAuth,
    getActiveUserId,
    getActiveCredit,
  };
}
