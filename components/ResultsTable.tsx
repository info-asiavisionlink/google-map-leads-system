"use client";

import { OpeningHoursDisplay, ReviewsDisplay } from "@/components/FormattedField";
import PlaceAiChat from "@/components/PlaceAiChat";
import { displayOrEmpty } from "@/lib/placeFormat";
import type { PlaceSearchResult } from "@/lib/types";
import { useState } from "react";
import ResultCard from "./ResultCard";

type ResultsTableProps = {
  results: PlaceSearchResult[];
  userId?: string | null;
  onCreditUpdate?: (credit: number) => void;
};

function CellLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full break-all rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
    >
      {label}
    </a>
  );
}

const COLUMNS: { key: string; label: string; minW: string }[] = [
  { key: "no", label: "No", minW: "min-w-[48px]" },
  { key: "store", label: "店舗", minW: "min-w-[240px]" },
  { key: "phone", label: "電話番号", minW: "min-w-[120px]" },
  { key: "email", label: "メール", minW: "min-w-[80px]" },
  { key: "website", label: "Web", minW: "min-w-[72px]" },
  { key: "map", label: "地図", minW: "min-w-[72px]" },
  { key: "rating", label: "評価", minW: "min-w-[56px]" },
  { key: "reviews", label: "口コミ数", minW: "min-w-[72px]" },
  { key: "reviewText", label: "口コミ", minW: "min-w-[200px]" },
  { key: "hours", label: "営業時間", minW: "min-w-[200px]" },
  { key: "closed", label: "定休日", minW: "min-w-[100px]" },
  { key: "category", label: "業種", minW: "min-w-[120px]" },
  { key: "status", label: "ステータス", minW: "min-w-[88px]" },
  { key: "placeId", label: "place_id", minW: "min-w-[140px]" },
];

function AiQuestionButton({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border px-4 text-sm font-semibold transition ${
        isActive
          ? "border-blue-400 bg-blue-100 text-blue-900"
          : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
      }`}
    >
      AIに質問
    </button>
  );
}

export default function ResultsTable({
  results,
  userId,
  onCreditUpdate,
}: ResultsTableProps) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const selectedPlace =
    selectedPlaceId != null
      ? results.find((row) => row.placeId === selectedPlaceId) ?? null
      : null;

  function handleSelectPlace(placeId: string) {
    setSelectedPlaceId((current) => (current === placeId ? null : placeId));
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <>
      <div className="min-w-0 space-y-4 md:hidden">
        {results.map((row, index) => (
          <ResultCard
            key={row.placeId}
            row={row}
            index={index}
            userId={userId}
            onCreditUpdate={onCreditUpdate}
            isChatOpen={selectedPlaceId === row.placeId}
            onChatOpenChange={(open) =>
              setSelectedPlaceId(open ? row.placeId : null)
            }
          />
        ))}
      </div>

      <div className="hidden min-w-0 space-y-4 md:block">
        {selectedPlace && (
          <section
            className="w-full min-w-0 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5"
            aria-label="選択中店舗のAIチャット"
          >
            <p className="mb-3 text-sm font-medium text-blue-700">
              選択中店舗
            </p>
            <p className="mb-4 break-words text-xl font-bold text-gray-900 sm:text-2xl">
              {selectedPlace.name}
            </p>
            <PlaceAiChat
              key={selectedPlace.placeId}
              place={selectedPlace}
              userId={userId ?? null}
              panelOnly
              onClose={() => setSelectedPlaceId(null)}
              onCreditUpdate={onCreditUpdate}
            />
          </section>
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[1400px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`sticky top-0 z-10 bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-700 ${col.minW}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((row, index) => (
                <tr
                  key={row.placeId}
                  className={`align-top hover:bg-blue-50/30 ${
                    selectedPlaceId === row.placeId ? "bg-blue-50/50" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900">
                    {index + 1}
                  </td>
                  <td className="min-w-[240px] max-w-[320px] px-3 py-3">
                    <p className="break-words font-semibold text-gray-900">
                      {row.name}
                    </p>
                    <p className="mt-1 break-words text-gray-700">
                      {displayOrEmpty(row.address)}
                    </p>
                    <AiQuestionButton
                      isActive={selectedPlaceId === row.placeId}
                      onClick={() => handleSelectPlace(row.placeId)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                    {displayOrEmpty(row.phoneNumber)}
                  </td>
                  <td className="px-3 py-3 text-gray-500">
                    {displayOrEmpty(row.email)}
                  </td>
                  <td className="px-3 py-3">
                    {row.websiteUrl ? (
                      <CellLink href={row.websiteUrl} label="開く" />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <CellLink href={row.googleMapsUrl} label="地図" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-800">
                    {row.rating ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                    {row.reviewCount ?? "-"}
                  </td>
                  <td className="min-w-[200px] max-w-[260px] break-words px-3 py-3 align-top text-gray-700">
                    <ReviewsDisplay text={row.reviewsText} />
                  </td>
                  <td className="min-w-[200px] max-w-[240px] break-words px-3 py-3 align-top text-gray-700">
                    <OpeningHoursDisplay text={row.regularOpeningHours} />
                  </td>
                  <td className="break-words px-3 py-3 text-gray-700">
                    {displayOrEmpty(row.closedDays)}
                  </td>
                  <td className="break-words px-3 py-3 text-gray-700">
                    {displayOrEmpty(row.category)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                    {displayOrEmpty(row.businessStatus)}
                  </td>
                  <td className="px-3 py-3">
                    <code className="block max-w-[140px] break-all font-mono text-xs text-gray-500">
                      {row.placeId}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
