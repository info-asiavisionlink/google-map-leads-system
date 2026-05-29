"use client";

import {
  AI_CHAT_CREDIT_COST,
  AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import type { PlaceChatApiResponse, PlaceSearchResult } from "@/lib/types";
import { FormEvent, useState } from "react";

type PlaceAiChatProps = {
  place: PlaceSearchResult;
  userId: string | null;
  onCreditUpdate?: (credit: number) => void;
};

export default function PlaceAiChat({
  place,
  userId,
  onCreditUpdate,
}: PlaceAiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const hasWebsite = Boolean(place.websiteUrl?.trim());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setError(USER_INFO_MISSING_MESSAGE);
      return;
    }

    const trimmed = question.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/places/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          user_id: userId,
          place_id: place.placeId,
          question: trimmed,
        }),
      });

      const data = (await res.json()) as PlaceChatApiResponse;

      if (res.status === 401 || data.code === "unauthorized") {
        setError(USER_INFO_MISSING_MESSAGE);
        return;
      }

      if (res.status === 402 || data.code === "insufficient_credit") {
        setError(data.message || AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE);
        if (data.credit != null) onCreditUpdate?.(data.credit);
        return;
      }

      if (data.status !== "success" || !data.answer) {
        setError(data.message || "回答の取得に失敗しました");
        return;
      }

      setAnswer(data.answer);
      if (data.message) setInfoMessage(data.message);
      if (data.credit != null) onCreditUpdate?.(data.credit);
    } catch (err) {
      console.error("AIチャットエラー:", err);
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-4 min-w-0 border-t border-gray-100 pt-4">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full rounded-lg border border-cyan-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:from-blue-100 hover:to-cyan-100 sm:w-auto"
        >
          AIに質問
        </button>
      ) : (
        <div className="min-w-0 rounded-xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/40 p-4 shadow-sm">
          <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                AIアシスタント
              </p>
              <h4 className="break-words text-sm font-bold text-gray-900">
                {place.name}
              </h4>
              <p className="mt-1 break-words text-xs text-gray-600">
                {hasWebsite
                  ? "公式サイト情報も確認して回答します"
                  : "Googleマップ情報をもとに回答します"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
              aria-label="チャットを閉じる"
            >
              閉じる
            </button>
          </div>

          <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            1回の質問で {AI_CHAT_CREDIT_COST} クレジット消費します
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                質問
              </span>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="例）この店舗の強みや営業提案のポイントは？"
                className="w-full min-w-0 max-w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm break-words focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                disabled={isLoading}
              />
            </label>

            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isLoading ? "回答を生成中…" : "質問を送信"}
            </button>
          </form>

          {isLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-cyan-800">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
              AIが店舗情報を分析しています…
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {infoMessage && !error && (
            <p className="mt-3 break-words rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {infoMessage}
            </p>
          )}

          {answer && (
            <div className="mt-3 min-w-0 rounded-lg border border-cyan-100 bg-white px-3 py-3">
              <p className="mb-1 text-xs font-semibold text-cyan-700">回答</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
                {answer}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
