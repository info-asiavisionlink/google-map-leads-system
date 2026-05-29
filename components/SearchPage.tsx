"use client";

import AIScanLoading from "@/components/AIScanLoading";
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
  SEARCH_JOB_POLL_MS,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import type {
  PlaceSearchResult,
  SearchApiResponse,
  SearchJobResponse,
} from "@/lib/types";
import { useAuthState } from "@/lib/useAuthState";
import { useCallback, useEffect, useRef, useState } from "react";

function formatCredit(n: number): string {
  return n.toLocaleString("ja-JP");
}

const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "no_results",
]);

export default function SearchPage() {
  bootstrapClientAuthDebug();

  const {
    authState,
    isLoading: isAuthLoading,
    isAuthenticated,
    patchCredit,
  } = useAuthState();

  const [isLoading, setIsLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<SearchJobResponse["status"] | null>(
    null
  );
  const [currentStep, setCurrentStep] = useState<string>("scanning");
  const [fetchedCount, setFetchedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);

  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [copyText, setCopyText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchApiResponse["status"] | null>(
    null
  );
  const [displayCount, setDisplayCount] = useState<number | null>(null);
  const [lastCreditConsumed, setLastCreditConsumed] = useState<number | null>(
    null
  );
  const [lastRemainingCredit, setLastRemainingCredit] = useState<number | null>(
    null
  );

  const pollTimerRef = useRef<number | null>(null);
  const pollUserIdRef = useRef<string | null>(null);

  const displayCredit = authState?.credit ?? getActiveCredit() ?? null;
  const activeUserId = authState?.userId?.trim() || getActiveUserId() || null;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const handleJobUpdate = useCallback(
    (data: SearchJobResponse) => {
      setJobStatus(data.status);
      setCurrentStep(data.currentStep);
      setFetchedCount(data.fetchedCount);
      setSavedCount(data.savedCount);
      setResults(data.results);
      setCopyText(data.copyText);

      if (TERMINAL_JOB_STATUSES.has(data.status)) {
        stopPolling();
        setIsLoading(false);
        setActiveJobId(null);

        const count = data.savedCount ?? data.results.length;
        setDisplayCount(count);
        setLastCreditConsumed(data.creditConsumed ?? 0);

        if (data.credit != null) {
          patchCredit(data.credit);
          setLastRemainingCredit(data.credit);
        }

        if (data.status === "completed") {
          setStatus("success");
          setMessage(data.message ?? null);
          setSearchError(null);
        } else if (data.status === "no_results") {
          setStatus("no_results");
          setMessage(data.message ?? NO_RESULTS_FOUND_MESSAGE);
          setSearchError(null);
          setResults([]);
          setCopyText("");
        } else if (data.status === "failed") {
          setStatus("error");
          const errMsg = data.errorMessage ?? data.message ?? API_ERROR_MESSAGE;
          if (errMsg.includes("クレジット")) {
            setSearchError(errMsg || CREDIT_CONSUME_FAILED_MESSAGE);
            if (data.results.length === 0) {
              setResults([]);
              setCopyText("");
            }
          } else {
            setSearchError(normalizeUserFacingError(errMsg));
          }
        }
      }
    },
    [patchCredit, stopPolling]
  );

  const pollJob = useCallback(
    async (jobId: string, userId: string) => {
      try {
        const res = await fetch(`/api/search-jobs/${jobId}`, {
          headers: { "x-user-id": userId },
          cache: "no-store",
        });

        if (res.status === 401) {
          stopPolling();
          setIsLoading(false);
          setSearchError(USER_INFO_MISSING_MESSAGE);
          return;
        }

        if (!res.ok) return;

        const data = (await res.json()) as SearchJobResponse;
        handleJobUpdate(data);
      } catch (err) {
        console.error("ジョブポーリングエラー:", err);
      }
    },
    [handleJobUpdate, stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleSearch(values: SearchFormValues) {
    setSearchError(null);
    setSaveWarning(null);

    const userId = authState?.userId?.trim() || getActiveUserId();
    const creditBalance = authState?.credit ?? getActiveCredit();

    logAuthStateDebug("handleSearch", authState, {
      authState_userId: authState?.userId ?? "(empty)",
      active_userId: userId ?? "(empty)",
    });

    if (!userId) {
      setSearchError(USER_INFO_MISSING_MESSAGE);
      return;
    }

    if (creditBalance === undefined || creditBalance < MIN_CREDIT_TO_SEARCH) {
      setSearchError(INSUFFICIENT_CREDIT_MESSAGE);
      return;
    }

    stopPolling();
    setIsLoading(true);
    setMessage(null);
    setStatus(null);
    setResults([]);
    setCopyText("");
    setActiveJobId(null);
    setJobStatus("processing");
    setCurrentStep("scanning");
    setFetchedCount(0);
    setSavedCount(0);
    setSearchStartedAt(Date.now());
    setDisplayCount(null);
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

    pollUserIdRef.current = userId;

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
        setIsLoading(false);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setSearchError(
          normalizeUserFacingError(data.message || INSUFFICIENT_CREDIT_MESSAGE)
        );
        setIsLoading(false);
        return;
      }

      if (data.status === "no_results") {
        setStatus("no_results");
        setMessage(data.message ?? NO_RESULTS_FOUND_MESSAGE);
        setIsLoading(false);
        return;
      }

      if (data.status === "error" || (!res.ok && data.status !== "processing")) {
        setSearchError(
          normalizeUserFacingError(
            data.code === "api_error" ? API_ERROR_MESSAGE : data.message
          )
        );
        setStatus("error");
        setIsLoading(false);
        return;
      }

      if (data.status === "processing" && data.jobId) {
        setActiveJobId(data.jobId);
        setStatus("processing");
        setMessage(data.message);

        await pollJob(data.jobId, userId);

        pollTimerRef.current = window.setInterval(() => {
          void pollJob(data.jobId!, pollUserIdRef.current ?? userId);
        }, SEARCH_JOB_POLL_MS);
        return;
      }

      setIsLoading(false);
    } catch {
      setSearchError(API_ERROR_MESSAGE);
      setStatus("error");
      setIsLoading(false);
    }
  }

  function handleCreditUpdate(credit: number) {
    patchCredit(credit);
    setLastRemainingCredit(credit);
  }

  const showScanLoading =
    isLoading && searchStartedAt != null && jobStatus !== "completed";

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <AuthDebugPanel />

      <div className="mb-4">
        <ToolAuthBar authState={authState} isLoading={isAuthLoading} />
      </div>

      <header className="mb-8 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
          営業リスト作成ツール
        </p>
        <h1 className="break-words text-2xl font-bold text-gray-900 sm:text-3xl">
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

      {showScanLoading && (
        <AIScanLoading
          savedCount={savedCount}
          fetchedCount={fetchedCount}
          currentStep={currentStep}
          startedAt={searchStartedAt}
        />
      )}

      {searchError && (
        <div
          role="alert"
          className="mt-6 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {searchError}
        </div>
      )}

      {saveWarning && (
        <div
          role="status"
          className="mt-6 break-words rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {saveWarning}（画面の検索結果とコピーはご利用いただけます）
        </div>
      )}

      {(status === "success" || status === "no_results") && (
        <div
          className={`mt-6 break-words rounded-lg border px-4 py-4 text-sm ${
            status === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs opacity-80">取得件数</dt>
              <dd className="text-lg font-semibold">{displayCount ?? 0}件</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">消費クレジット</dt>
              <dd className="text-lg font-semibold">
                {formatCredit(lastCreditConsumed ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">残クレジット</dt>
              <dd className="text-lg font-semibold">
                {lastRemainingCredit != null
                  ? formatCredit(lastRemainingCredit)
                  : "—"}
              </dd>
            </div>
          </dl>
          {message && status === "no_results" && (
            <p className="mt-3 text-sm opacity-90">
              {message || NO_RESULTS_FOUND_MESSAGE}
            </p>
          )}
          {message && status === "success" && (
            <p className="mt-3 text-sm opacity-90">{message}</p>
          )}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-10 min-w-0">
          <div className="sticky top-0 z-20 mb-4 flex min-w-0 flex-col gap-3 border-b border-gray-200 bg-gray-100/95 px-0 py-4 backdrop-blur sm:static sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border sm:bg-white sm:px-5 sm:shadow-sm">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="text-lg font-bold text-gray-900">取得結果</h2>
              <span className="shrink-0 rounded-full bg-blue-600 px-3 py-0.5 text-sm font-bold text-white">
                {results.length}件
                {isLoading && activeJobId ? "（取得中…）" : ""}
              </span>
            </div>
            <div className="w-full sm:w-auto">
              <CopyTsvButton copyText={copyText} />
            </div>
          </div>
          <ResultsTable
            results={results}
            userId={activeUserId}
            onCreditUpdate={handleCreditUpdate}
          />
        </section>
      )}
    </div>
  );
}
