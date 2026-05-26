"use client";

import {
  clearAuthState,
  isAuthStateComplete,
  logAuthStateDebug,
  resolveAuthState,
  saveAuthState,
  type AuthState,
  updateAuthStateCredit,
} from "@/lib/authState";
import { useCallback, useEffect, useState } from "react";

export function useAuthState() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  };
}
