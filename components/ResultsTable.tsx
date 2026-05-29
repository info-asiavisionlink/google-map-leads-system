"use client";

import PlaceAiChat from "@/components/PlaceAiChat";
import type { PlaceSearchResult } from "@/lib/types";
import { useCallback, useState } from "react";
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
  const [openedChatPlaceId, setOpenedChatPlaceId] = useState<string | null>(null);

  const handleAskAi = useCallback((placeId: string) => {
    if (!placeId.trim()) return;
    setOpenedChatPlaceId((current) => (current === placeId ? null : placeId));
  }, []);

  const handleCloseChat = useCallback(() => {
    setOpenedChatPlaceId(null);
  }, []);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 w-full max-w-full space-y-4 overflow-x-hidden">
      <ul className="grid min-w-0 list-none gap-4 p-0">
        {results.map((row, index) => {
          const placeId = row.placeId;
          const isChatOpen = openedChatPlaceId === placeId;

          return (
            <li key={placeId} className="min-w-0 max-w-full">
              <ResultCard
                row={row}
                index={index}
                isAiSelected={isChatOpen}
                onAiClick={() => handleAskAi(placeId)}
              />

              {isChatOpen && (
                <div className="mt-3 w-full min-w-0 max-w-full rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5">
                  <p className="mb-2 text-sm font-medium text-blue-700">
                    選択中店舗
                  </p>
                  <p className="mb-4 break-words text-xl font-bold text-gray-900 sm:text-2xl">
                    {row.name}
                  </p>
                  <PlaceAiChat
                    key={placeId}
                    place={row}
                    userId={userId ?? null}
                    panelOnly
                    onClose={handleCloseChat}
                    onCreditUpdate={onCreditUpdate}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
