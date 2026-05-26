"use client";

import AuthDebugPanel from "@/components/AuthDebugPanel";
import CopyTsvButton from "@/components/CopyTsvButton";
import ResultsTable from "@/components/ResultsTable";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import ToolAuthBar from "@/components/ToolAuthBar";
import {
  getActiveCredit,
  getActiveUserId,
  logAuthStateDebug,
  normalizeUserFacingError,
} from "@/lib/authState";
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
  } = useAuthState();

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [copyText, setCopyText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchApiResponse["status"] | null>(
    null
  );
  const [lastFetchedCount, setLastFetchedCount] = useState<number | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState<number | null>(null);
  const [lastSaveFailedCount, setLastSaveFailedCount] = useState<number | null>(
    null
  );
  const [lastCreditConsumed, setLastCreditConsumed] = useState<number | null>(
    null
  );
  const [lastRemainingCredit, setLastRemainingCredit] = useState<number | null>(
    null
  );

  const displayCredit = authState?.credit ?? getActiveCredit() ?? null;

  async function handleSearch(values: SearchFormValues) {
    setSearchError(null);
    setSaveWarning(null);

    const userId = authState?.userId?.trim() || getActiveUserId();
    const creditBalance = authState?.credit ?? getActiveCredit();

    logAuthStateDebug("handleSearch", authState, {
      authState_userId: authState?.userId ?? "(empty)",
      active_userId: userId ?? "(empty)",
      body_user_id: userId ?? "(empty)",
      x_user_id: userId ?? "(empty)",
    });

    if (!userId) {
      setSearchError(USER_INFO_MISSING_MESSAGE);
      return;
    }

    if (creditBalance === undefined || creditBalance < MIN_CREDIT_TO_SEARCH) {
      setSearchError(INSUFFICIENT_CREDIT_MESSAGE);
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setStatus(null);
    setResults([]);
    setCopyText("");
    setLastFetchedCount(null);
    setLastSavedCount(null);
    setLastSaveFailedCount(null);
    setLastCreditConsumed(null);
    setLastRemainingCredit(null);
    setSaveWarning(null);

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
        setSearchError(USER_INFO_MISSING_MESSAGE);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setSearchError(normalizeUserFacingError(
          data.message || INSUFFICIENT_CREDIT_MESSAGE
        ));
        if (data.credit !== undefined && data.credit !== null) {
          patchCredit(data.credit);
        }
        return;
      }

      if (res.status === 500 && data.code === "consume_failed") {
        setSearchError(CREDIT_CONSUME_FAILED_MESSAGE);
        setResults([]);
        setCopyText("");
        return;
      }

      if (data.status === "error" || !res.ok) {
        const rawMessage =
          data.code === "api_error" ? API_ERROR_MESSAGE : data.message;
        setSearchError(normalizeUserFacingError(rawMessage));
        return;
      }

      setStatus(data.status);
      setMessage(data.message);

      if (data.status === "no_results") {
        setSearchError(null);
        setLastFetchedCount(data.fetchedCount ?? 0);
        setLastSavedCount(data.savedCount ?? 0);
        setLastSaveFailedCount(data.saveFailedCount ?? 0);
        setLastCreditConsumed(data.creditConsumed ?? 0);
        if (data.credit != null) setLastRemainingCredit(data.credit);
        return;
      }

      if (data.status === "success") {
        setResults(data.results);
        setCopyText(data.copyText);
        setLastFetchedCount(data.fetchedCount ?? null);
        setLastSavedCount(data.savedCount ?? data.resultCount ?? data.results.length);
        setLastSaveFailedCount(data.saveFailedCount ?? 0);
        setLastCreditConsumed(data.creditConsumed ?? null);
        if (data.credit != null) setLastRemainingCredit(data.credit);
        setSaveWarning(data.saveWarning ?? null);
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

      {saveWarning && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {saveWarning}（画面の検索結果とコピーはご利用いただけます）
        </div>
      )}

      {status === "success" && message && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
          <p className="font-medium">{message}</p>
          {(lastFetchedCount != null || lastSavedCount != null) && (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {lastFetchedCount != null && (
                <div>
                  <dt className="text-xs text-green-700">取得件数</dt>
                  <dd className="font-semibold">{lastFetchedCount}件</dd>
                </div>
              )}
              {lastSavedCount != null && (
                <div>
                  <dt className="text-xs text-green-700">保存成功</dt>
                  <dd className="font-semibold">{lastSavedCount}件</dd>
                </div>
              )}
              {lastSaveFailedCount != null && (
                <div>
                  <dt className="text-xs text-green-700">保存失敗</dt>
                  <dd className="font-semibold">{lastSaveFailedCount}件</dd>
                </div>
              )}
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
                  <dt className="text-xs text-green-700">残クレジット</dt>
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
