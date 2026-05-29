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
  /** テーブルセル用：ボタンのみ表示 */
  triggerOnly?: boolean;
  /** テーブル展開行用：パネルのみ表示 */
  panelOnly?: boolean;
  onOpenRequest?: () => void;
  onClose?: () => void;
};

export default function PlaceAiChat({
  place,
  userId,
  onCreditUpdate,
  triggerOnly = false,
  panelOnly = false,
  onOpenRequest,
  onClose,
}: PlaceAiChatProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);

  const isOpen = panelOnly || isOpenInternal;
  const hasWebsite = Boolean(place.websiteUrl?.trim());

  function handleOpen() {
    if (triggerOnly) {
      onOpenRequest?.();
      return;
    }
    setIsOpenInternal(true);
  }

  function handleClose() {
    if (panelOnly) {
      onClose?.();
      return;
    }
    setIsOpenInternal(false);
  }

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
    setHistoryWarning(null);
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
      if (data.historySaveWarning) setHistoryWarning(data.historySaveWarning);
      if (data.credit != null) onCreditUpdate?.(data.credit);
    } catch (err) {
      console.error("AIチャットエラー:", err);
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  }

  if (triggerOnly) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
      >
        AIに質問
      </button>
    );
  }

  if (!isOpen) {
    return (
      <div className="w-full min-w-0 max-w-full">
        <button
          type="button"
          onClick={handleOpen}
          className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-6 text-base font-semibold text-blue-800 transition hover:from-blue-100 hover:to-cyan-100"
        >
          AIに質問する
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-hidden ${
        panelOnly ? "" : "mt-6 border-t border-blue-100 pt-5"
      }`}
    >
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-white to-blue-50/60 p-5 shadow-md sm:p-6">
        <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              AIアシスタント
            </p>
            <h4 className="mt-1 break-words text-xl font-bold text-gray-900 sm:text-2xl">
              {place.name}
            </h4>
            <p className="mt-2 break-words text-base text-gray-600">
              {hasWebsite
                ? "公式サイト情報も確認して回答します"
                : "Googleマップ保存情報をもとに回答します"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-lg px-3 py-2 text-base text-gray-500 hover:bg-gray-100"
            aria-label="チャットを閉じる"
          >
            閉じる
          </button>
        </div>

        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-medium text-amber-900">
          1回の質問で {AI_CHAT_CREDIT_COST} クレジット消費します
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block w-full min-w-0">
            <span className="mb-2 block text-base font-semibold text-gray-800">
              質問内容
            </span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="例）この店舗の強みや営業提案のポイントは？"
              className="min-h-[120px] w-full min-w-0 max-w-full resize-y rounded-xl border-2 border-gray-200 px-4 py-3 text-base leading-relaxed break-words focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              disabled={isLoading}
            />
          </label>

          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 text-base font-bold text-white shadow-md transition hover:from-blue-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "回答を生成中…" : "質問を送信"}
          </button>
        </form>

        {isLoading && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-base text-blue-800">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            AIが店舗情報を確認中...
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 break-words rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-base text-red-800"
          >
            {error}
          </p>
        )}

        {infoMessage && !error && (
          <p className="mt-5 break-words rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-base text-blue-800">
            {infoMessage}
          </p>
        )}

        {historyWarning && !error && (
          <p className="mt-3 text-sm text-amber-700">{historyWarning}</p>
        )}

        {(answer || isLoading) && (
          <div className="mt-5 min-h-[180px] w-full min-w-0 max-w-full overflow-hidden rounded-xl border-2 border-blue-100 bg-white p-5 sm:p-6">
            <p className="mb-3 text-base font-bold text-blue-700">AI回答</p>
            {answer ? (
              <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-gray-800">
                {answer}
              </p>
            ) : (
              <p className="text-base text-gray-400">回答を生成しています…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
