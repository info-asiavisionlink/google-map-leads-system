"use client";

import PlaceAiChat from "@/components/PlaceAiChat";
import type { PlaceSearchResult } from "@/lib/types";
import { useState } from "react";
import ResultCard from "./ResultCard";

type ResultsTableProps = {
  results: PlaceSearchResult[];
  userId?: string | null;
  onCreditUpdate?: (credit: number) => void;
};

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
    <div className="min-w-0 w-full max-w-full space-y-4 overflow-x-hidden">
      {selectedPlace && (
        <section
          className="w-full min-w-0 max-w-full rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5"
          aria-label="選択中店舗のAIチャット"
        >
          <p className="mb-2 text-sm font-medium text-blue-700">選択中店舗</p>
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

      <ul className="grid min-w-0 list-none gap-4 p-0">
        {results.map((row, index) => (
          <li key={row.placeId} className="min-w-0 max-w-full">
            <ResultCard
              row={row}
              index={index}
              isAiSelected={selectedPlaceId === row.placeId}
              onAiClick={() => handleSelectPlace(row.placeId)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
