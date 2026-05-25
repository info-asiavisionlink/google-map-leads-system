"use client";

import { RADIUS_OPTIONS, type RadiusM } from "@/lib/constants";
import { FormEvent, useState } from "react";

export type SearchFormValues = {
  area: string;
  keyword1: string;
  keyword2: string;
  radiusM: RadiusM;
};

type SearchFormProps = {
  onSearch: (values: SearchFormValues) => void;
  isLoading: boolean;
  disabled?: boolean;
  creditCost?: number;
};

export default function SearchForm({
  onSearch,
  isLoading,
  disabled = false,
  creditCost,
}: SearchFormProps) {
  const [area, setArea] = useState("");
  const [keyword1, setKeyword1] = useState("");
  const [keyword2, setKeyword2] = useState("");
  const [radiusM, setRadiusM] = useState<RadiusM>(2000);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch({ area, keyword1, keyword2, radiusM });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="mb-5 text-base font-semibold text-gray-900">検索条件</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            エリア <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="例）新宿駅、渋谷、銀座、大阪梅田"
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={isLoading || disabled}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            キーワード1（業種・必須） <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={keyword1}
            onChange={(e) => setKeyword1(e.target.value)}
            placeholder="例）美容室、飲食店、整体、歯医者、不動産会社"
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={isLoading || disabled}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            キーワード2（絞り込み・任意）
          </span>
          <input
            type="text"
            value={keyword2}
            onChange={(e) => setKeyword2(e.target.value)}
            placeholder="例）髪質改善、個室、駅近、深夜営業、口コミ高評価"
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={isLoading || disabled}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">
            検索範囲 <span className="text-red-500">*</span>
          </span>
          <select
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value) as RadiusM)}
            className="max-w-xs rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={isLoading || disabled}
            required
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}m
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-8 border-t border-gray-100 pt-6">
        {creditCost != null && (
          <p className="mb-3 text-sm text-gray-600">
            この検索は
            <span className="mx-1 font-semibold text-blue-700">{creditCost}</span>
            Credit消費します（新規1件以上取得できた場合のみ）
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading || disabled}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? "リストを作成中..." : "リストを作成する"}
        </button>
      </div>
    </form>
  );
}
