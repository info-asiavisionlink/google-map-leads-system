"use client";

import {
  CREDIT_PER_RESULT,
  MAX_CREDIT_COST,
  MAX_RESULTS,
  MIN_CREDIT_TO_SEARCH,
} from "@/lib/constants";
import { PREFECTURES } from "@/lib/prefectures";
import { FormEvent, useState } from "react";

export type SearchFormValues = {
  area: string;
  keyword1: string;
  keyword2: string;
};

type SearchFormProps = {
  onSearch: (values: SearchFormValues) => void;
  isLoading: boolean;
  disabled?: boolean;
};

export default function SearchForm({
  onSearch,
  isLoading,
  disabled = false,
}: SearchFormProps) {
  const [area, setArea] = useState("");
  const [keyword1, setKeyword1] = useState("");
  const [keyword2, setKeyword2] = useState("");

  const formDisabled = isLoading || disabled;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch({ area, keyword1, keyword2 });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="mb-5 text-base font-semibold text-gray-900">検索条件</h2>

      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm leading-relaxed text-gray-700">
        <ul className="list-inside list-disc space-y-1">
          <li>最大{MAX_RESULTS}件まで取得できます</li>
          <li>1件あたり{CREDIT_PER_RESULT}クレジット消費します</li>
          <li>最大取得時は{MAX_CREDIT_COST}クレジット消費します</li>
          <li>
            取得件数が{MAX_RESULTS}件未満の場合は、取得できた件数分のみ消費します
          </li>
        </ul>
        <p className="mt-3 border-t border-blue-100 pt-3 text-xs text-gray-600">
          最大取得件数：{MAX_RESULTS}件 / 消費クレジット：1件あたり
          {CREDIT_PER_RESULT}クレジット / 最大消費：{MAX_CREDIT_COST}クレジット
          <br />
          検索には最低{MIN_CREDIT_TO_SEARCH}クレジット以上が必要です（実際の消費は取得件数に応じます）
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            都道府県 <span className="text-red-500">*</span>
          </span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={formDisabled}
            required
          >
            <option value="">都道府県を選択してください</option>
            {PREFECTURES.map((pref) => (
              <option key={pref} value={pref}>
                {pref}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            大カテゴリー・業種 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={keyword1}
            onChange={(e) => setKeyword1(e.target.value)}
            placeholder="例：美容室、飲食店、整体、歯医者、不動産会社"
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={formDisabled}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">詳細キーワード</span>
          <input
            type="text"
            value={keyword2}
            onChange={(e) => setKeyword2(e.target.value)}
            placeholder="例：髪質改善、個室、駅近、深夜営業、口コミ高評価"
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={formDisabled}
          />
        </label>
      </div>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <button
          type="submit"
          disabled={formDisabled}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? "リストを作成中..." : "リストを作成する"}
        </button>
      </div>
    </form>
  );
}
