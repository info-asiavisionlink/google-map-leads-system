"use client";

import AuthDebugPanel from "@/components/AuthDebugPanel";
import CopyTsvButton from "@/components/CopyTsvButton";
import ResultsTable from "@/components/ResultsTable";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import ToolAuthBar from "@/components/ToolAuthBar";
import { logAuthStateDebug } from "@/lib/authState";
import {
  bootstrapClientAuthDebug,
  isClientAuthDebugEnabled,
  logSearchApiResponse,
} from "@/lib/authDebugClient";
import {
  API_ERROR_MESSAGE,
  CREDIT_CONSUME_FAILED_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
  MIN_CREDIT_TO_SEARCH,
  NO_RESULTS_FOUND_MESSAGE,
  SAVE_RESULTS_FAILED_MESSAGE,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";
import { useAuthState } from "@/lib/useAuthState";
import { useState } from "react";

function formatCredit(n: number): string {
  return n.toLocaleString("ja-JP");
}

export default function SearchPage() {
  bootstrapClientAuthDebug();

  const {
    authState,
    isLoading: isAuthLoading,
    isAuthenticated,
    patchCredit,
    clearAuth,
  } = useAuthState();

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [copyText, setCopyText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchApiResponse["status"] | null>(
    null
  );
  const [lastResultCount, setLastResultCount] = useState<number | null>(null);
  const [lastCreditConsumed, setLastCreditConsumed] = useState<number | null>(
    null
  );
  const [lastRemainingCredit, setLastRemainingCredit] = useState<number | null>(
    null
  );

  const displayCredit = authState?.credit ?? null;

  async function handleSearch(values: SearchFormValues) {
    setSearchError(null);

    const userId = authState?.userId?.trim();

    logAuthStateDebug("handleSearch", authState, {
      body_user_id: userId ?? "(empty)",
      x_user_id: userId ?? "(empty)",
    });

    if (!userId) {
      setSearchError(USER_INFO_MISSING_MESSAGE);
      return;
    }

    const creditBalance = authState?.credit;
    if (creditBalance === undefined || creditBalance < MIN_CREDIT_TO_SEARCH) {
      setSearchError(INSUFFICIENT_CREDIT_MESSAGE);
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setStatus(null);
    setResults([]);
    setCopyText("");
    setLastResultCount(null);
    setLastCreditConsumed(null);
    setLastRemainingCredit(null);

    const requestHeaders: HeadersInit = {
      "Content-Type": "application/json",
      "x-user-id": userId,
    };

    const requestBody = {
      user_id: userId,
      current_credit: creditBalance,
      prefecture: values.area,
      keyword1: values.keyword1,
      keyword2: values.keyword2 || undefined,
    };

    if (isClientAuthDebugEnabled()) {
      logAuthStateDebug("search_request", authState, {
        x_user_id: userId,
        body_user_id: userId,
      });
    }

    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const data = (await res.json()) as SearchApiResponse;

      logSearchApiResponse({
        response_status: res.status,
        code: data.code,
        message: data.message,
        credit: data.credit,
      });

      if (data.credit !== undefined && data.credit !== null) {
        patchCredit(data.credit);
      }

      if (res.status === 401 || data.code === "unauthorized") {
        clearAuth();
        setSearchError(data.message || USER_INFO_MISSING_MESSAGE);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setSearchError(data.message || INSUFFICIENT_CREDIT_MESSAGE);
        if (data.credit !== undefined && data.credit !== null) {
          patchCredit(data.credit);
        }
        return;
      }

      if (res.status === 500 && data.code === "consume_failed") {
        setSearchError(data.message || CREDIT_CONSUME_FAILED_MESSAGE);
        setResults([]);
        setCopyText("");
        return;
      }

      if (data.code === "save_failed") {
        setSearchError(data.message || SAVE_RESULTS_FAILED_MESSAGE);
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

      setStatus(data.status);
      setMessage(data.message);

      if (data.status === "no_results") {
        setSearchError(null);
        setLastResultCount(data.resultCount ?? 0);
        setLastCreditConsumed(data.creditConsumed ?? 0);
        if (data.credit != null) setLastRemainingCredit(data.credit);
        return;
      }

      if (data.status === "success") {
        setResults(data.results);
        setCopyText(data.copyText);
        setLastResultCount(data.resultCount ?? data.results.length);
        setLastCreditConsumed(data.creditConsumed ?? null);
        if (data.credit != null) setLastRemainingCredit(data.credit);
      }
    } catch {
      setSearchError(API_ERROR_MESSAGE);
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <AuthDebugPanel />

      <div className="mb-4">
        <ToolAuthBar authState={authState} isLoading={isAuthLoading} />
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
            都道府県と業種キーワードを入力するだけで、Googleマップに掲載されている店舗・企業情報を自動で取得できます。
          </p>
          <p>
            取得したリストは、ExcelやGoogleスプレッドシートにそのまま貼り付けできる形式でコピーできます。
          </p>
          <p>
            一度取得した店舗は次回以降の検索結果から自動で除外されるため、重複しない営業リストを効率よく作成できます。
          </p>
        </div>
      </header>

      {isAuthenticated &&
        displayCredit != null &&
        displayCredit < MIN_CREDIT_TO_SEARCH && (
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
        disabled={isLoading}
      />

      {isLoading && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          店舗情報を取得しています。しばらくお待ちください…
        </div>
      )}

      {searchError && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {searchError}
        </div>
      )}

      {status === "no_results" && !searchError && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message || NO_RESULTS_FOUND_MESSAGE}
        </div>
      )}

      {status === "success" && message && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
          <p className="font-medium">{message}</p>
          {lastResultCount != null && (
            <dl className="mt-3 grid gap-1 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-green-700">取得件数</dt>
                <dd className="font-semibold">{lastResultCount}件</dd>
              </div>
              {lastCreditConsumed != null && (
                <div>
                  <dt className="text-xs text-green-700">消費クレジット</dt>
                  <dd className="font-semibold">
                    {formatCredit(lastCreditConsumed)}
                  </dd>
                </div>
              )}
              {lastRemainingCredit != null && (
                <div>
                  <dt className="text-xs text-green-700">残りクレジット</dt>
                  <dd className="font-semibold">
                    {formatCredit(lastRemainingCredit)}
                  </dd>
                </div>
              )}
            </dl>
          )}
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
