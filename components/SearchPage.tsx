"use client";

import CreditBar from "@/components/CreditBar";
import CopyTsvButton from "@/components/CopyTsvButton";
import ResultsTable from "@/components/ResultsTable";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import {
  API_ERROR_MESSAGE,
  AUTH_REQUIRED_MESSAGE,
  CREDIT_CONSUME_FAILED_MESSAGE,
  GOOGLE_MAP_SEARCH_CREDIT_COST,
  INSUFFICIENT_CREDIT_MESSAGE,
} from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function SearchPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credit, setCredit] = useState<number | null>(null);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [copyText, setCopyText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchApiResponse["status"] | null>(
    null
  );

  const fetchCredit = useCallback(async () => {
    try {
      const res = await fetch("/api/user/credit", { credentials: "include" });
      if (res.status === 401) {
        setIsLoggedIn(false);
        setCredit(null);
        return;
      }
      if (!res.ok) {
        console.error("クレジット取得失敗:", res.status);
        return;
      }
      const data = (await res.json()) as { credit: number };
      setIsLoggedIn(true);
      setCredit(data.credit);
    } catch (err) {
      console.error("クレジット取得エラー:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setIsAuthLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setIsLoggedIn(false);
          setCredit(null);
          return;
        }
        setIsLoggedIn(true);
        await fetchCredit();
      } catch (err) {
        console.error("認証初期化エラー:", err);
      } finally {
        setIsAuthLoading(false);
      }
    }
    init();
  }, [fetchCredit]);

  const canSearch =
    isLoggedIn &&
    credit !== null &&
    credit >= GOOGLE_MAP_SEARCH_CREDIT_COST &&
    !isAuthLoading;

  async function handleSearch(values: SearchFormValues) {
    if (!isLoggedIn) {
      setError(AUTH_REQUIRED_MESSAGE);
      return;
    }
    if (credit !== null && credit < GOOGLE_MAP_SEARCH_CREDIT_COST) {
      setError(INSUFFICIENT_CREDIT_MESSAGE);
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);
    setStatus(null);
    setResults([]);
    setCopyText("");

    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          area: values.area,
          keyword1: values.keyword1,
          keyword2: values.keyword2 || undefined,
          radiusM: values.radiusM,
        }),
      });

      const data = (await res.json()) as SearchApiResponse;

      setStatus(data.status);
      setMessage(data.message);

      if (data.credit !== undefined && data.credit !== null) {
        setCredit(data.credit);
      }

      if (res.status === 401 || data.code === "unauthorized") {
        setIsLoggedIn(false);
        setError(AUTH_REQUIRED_MESSAGE);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setError(INSUFFICIENT_CREDIT_MESSAGE);
        if (data.credit !== undefined && data.credit !== null) {
          setCredit(data.credit);
        }
        return;
      }

      if (res.status === 500 && data.code === "consume_failed") {
        setError(data.message || CREDIT_CONSUME_FAILED_MESSAGE);
        setResults([]);
        setCopyText("");
        return;
      }

      if (data.status === "error" || !res.ok) {
        setError(
          data.code === "api_error" ? API_ERROR_MESSAGE : data.message
        );
        return;
      }

      setResults(data.results);
      setCopyText(data.copyText);

      if (data.status === "success") {
        await fetchCredit();
      }

      if (data.status === "no_results") {
        setError(null);
      }
    } catch (err) {
      console.error("検索リクエストエラー:", err);
      setError(API_ERROR_MESSAGE);
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
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

      <div className="mb-6">
        <CreditBar
          credit={credit}
          isLoggedIn={isLoggedIn}
          isLoading={isAuthLoading}
        />
      </div>

      {!isAuthLoading && !isLoggedIn && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {AUTH_REQUIRED_MESSAGE}
        </div>
      )}

      {!isAuthLoading &&
        isLoggedIn &&
        credit !== null &&
        credit < GOOGLE_MAP_SEARCH_CREDIT_COST && (
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
        creditCost={GOOGLE_MAP_SEARCH_CREDIT_COST}
      />

      {isLoading && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          店舗情報を取得しています。しばらくお待ちください…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {status === "no_results" && message && !error && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
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
