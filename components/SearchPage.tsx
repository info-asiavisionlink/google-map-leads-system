"use client";

import AuthDebugPanel from "@/components/AuthDebugPanel";
import CopyTsvButton from "@/components/CopyTsvButton";
import ResultsTable from "@/components/ResultsTable";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import ToolAuthBar from "@/components/ToolAuthBar";
import {
  API_ERROR_MESSAGE,
  CREDIT_CONSUME_FAILED_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
  NO_NEW_RESULTS_MESSAGE,
  TOKEN_AUTH_EXPIRED_MESSAGE,
} from "@/lib/constants";
import {
  clearStoredAccessToken,
  resolveAccessToken,
} from "@/lib/toolToken";
import { clearToolUserSession } from "@/lib/toolUserSession";
import {
  authDebugClientError,
  authDebugClientInfo,
  bootstrapClientAuthDebug,
  isClientAuthDebugEnabled,
  logPageLoadContext,
  logSearchApiResponse,
} from "@/lib/authDebugClient";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";
import { useToolAuth } from "@/lib/useToolAuth";
import { useEffect, useState } from "react";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** クライアント初回表示時に必ず token を URL から sessionStorage へ移す */
function bootstrapAccessToken(): void {
  resolveAccessToken();
}

export default function SearchPage() {
  bootstrapClientAuthDebug();
  bootstrapAccessToken();

  useEffect(() => {
    if (!isClientAuthDebugEnabled()) return;
    logPageLoadContext();
  }, []);

  const {
    status: authStatus,
    accessToken,
    verify,
    userSession,
    authError,
    creditCost,
    canSearch,
    refreshVerify,
    patchRemainingCredit,
  } = useToolAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [copyText, setCopyText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchApiResponse["status"] | null>(
    null
  );

  const isAuthLoading = authStatus === "loading";
  const isAuthenticated = authStatus === "authenticated" && verify !== null;

  async function handleSearch(values: SearchFormValues) {
    if (!accessToken || !verify) {
      authDebugClientError("search-blocked", {
        reason: "not_authenticated",
        has_access_token: Boolean(accessToken),
        has_verify: Boolean(verify),
      });
      setSearchError(TOKEN_AUTH_EXPIRED_MESSAGE);
      return;
    }

    if (verify.credit < creditCost) {
      setSearchError(INSUFFICIENT_CREDIT_MESSAGE);
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setMessage(null);
    setStatus(null);
    setResults([]);
    setCopyText("");

    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({
          area: values.area,
          keyword1: values.keyword1,
          keyword2: values.keyword2 || undefined,
          radiusM: values.radiusM,
        }),
      });

      const data = (await res.json()) as SearchApiResponse;

      logSearchApiResponse({
        response_status: res.status,
        code: data.code,
        message: data.message,
        credit: data.credit,
      });

      setStatus(data.status);
      setMessage(data.message);

      if (data.credit !== undefined && data.credit !== null) {
        patchRemainingCredit(data.credit);
      }

      if (res.status === 401 || data.code === "unauthorized") {
        clearStoredAccessToken();
        clearToolUserSession();
        setSearchError(TOKEN_AUTH_EXPIRED_MESSAGE);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setSearchError(data.message || INSUFFICIENT_CREDIT_MESSAGE);
        if (data.credit !== undefined && data.credit !== null) {
          patchRemainingCredit(data.credit);
        }
        return;
      }

      if (res.status === 500 && data.code === "consume_failed") {
        setSearchError(data.message || CREDIT_CONSUME_FAILED_MESSAGE);
        setResults([]);
        setCopyText("");
        return;
      }

      if (data.status === "error" || !res.ok) {
        setSearchError(
          data.code === "api_error" ? API_ERROR_MESSAGE : data.message
        );
        return;
      }

      setResults(data.results);
      setCopyText(data.copyText);

      if (data.status === "success") {
        await refreshVerify();
      }

      if (data.status === "no_results") {
        setSearchError(null);
      }
    } catch {
      setSearchError(API_ERROR_MESSAGE);
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <AuthDebugPanel />

      <div className="mb-4">
        <ToolAuthBar
          verify={verify}
          userSession={userSession}
          isLoading={isAuthLoading}
        />
      </div>

      <header className="mb-8 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
          営業リスト作成ツール
        </p>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Googleマップ営業リスト作成
        </h1>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600">
          <p>
            エリアと業種キーワードを入力するだけで、Googleマップに掲載されている店舗・企業情報を自動で取得できます。
          </p>
          <p>
            取得したリストは、ExcelやGoogleスプレッドシートにそのまま貼り付けできる形式でコピーできます。
          </p>
          <p>
            一度取得した店舗は次回以降の検索結果から自動で除外されるため、重複しない営業リストを効率よく作成できます。
          </p>
        </div>
      </header>

      {authStatus === "unauthenticated" && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {authError ?? TOKEN_AUTH_EXPIRED_MESSAGE}
        </div>
      )}

      {isAuthenticated && verify.credit < creditCost && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {INSUFFICIENT_CREDIT_MESSAGE}
        </div>
      )}

      <SearchForm
        onSearch={handleSearch}
        isLoading={isLoading}
        disabled={!canSearch || isLoading}
        creditCost={creditCost}
      />

      {isLoading && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          店舗情報を取得しています。しばらくお待ちください…
        </div>
      )}

      {searchError && isAuthenticated && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {searchError}
        </div>
      )}

      {status === "no_results" && message && !searchError && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message || NO_NEW_RESULTS_MESSAGE}
        </div>
      )}

      {status === "success" && message && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {message}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-10">
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-100/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-5 sm:shadow-sm">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold text-gray-900">取得結果</h2>
              <span className="rounded-full bg-blue-600 px-3 py-0.5 text-sm font-bold text-white">
                {results.length}件
              </span>
            </div>
            <CopyTsvButton copyText={copyText} />
          </div>
          <ResultsTable results={results} />
        </section>
      )}
    </div>
  );
}
