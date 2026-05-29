import {
  MAX_PAGES_PER_POINT,
  MAX_SPIRAL_FETCHES,
  SEARCH_POINT_RADIUS_M,
  SEARCH_POINT_RADIUS_M_TOKYO,
} from "@/lib/constants";
import { geocodeArea, searchPlacesAtPointPage, type SearchPoint, type TextSearchPlace } from "@/lib/googleMaps";
import { getPrefectureAnchorLabels } from "@/lib/prefectureAnchors";
import type { SpiralSearchPosition } from "@/lib/searchProgress";
import { createSpiralSearcher, FIXED_SEARCH_RADIUS_M } from "@/lib/spiralSearch";

export type SearchFetcherStats = {
  apiCandidateCount: number;
  sessionDuplicateCount: number;
  previouslySavedExclusionCount: number;
  searchPointCount: number;
  pageFetchCount: number;
  currentLocationLabel: string;
};

type ResolvedAnchor = {
  label: string;
  lat: number;
  lng: number;
};

export type PrefectureWideSearcher = {
  fetchNextBatch: (
    maxCount: number,
    runtimeExcluded: Set<string>
  ) => Promise<TextSearchPlace[]>;
  isExhausted: () => boolean;
  getStats: () => SearchFetcherStats;
  getPosition: () => SpiralSearchPosition;
};

async function resolveAnchors(
  prefecture: string,
  center: { lat: number; lng: number }
): Promise<ResolvedAnchor[]> {
  const labels = getPrefectureAnchorLabels(prefecture);
  const anchors: ResolvedAnchor[] = [
    { label: prefecture, lat: center.lat, lng: center.lng },
  ];

  const toGeocode = labels.slice(0, 21);
  const results = await Promise.allSettled(
    toGeocode.map(async (label) => {
      const geo = await geocodeArea(`${prefecture} ${label}`);
      return {
        label,
        lat: geo.latitude,
        lng: geo.longitude,
      };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      anchors.push(result.value);
    }
  }

  return anchors;
}

function getRadiusM(prefecture: string): number {
  if (prefecture === "東京都") return SEARCH_POINT_RADIUS_M_TOKYO;
  return SEARCH_POINT_RADIUS_M;
}

export async function createPrefectureWideSearcher(params: {
  prefecture: string;
  query: string;
  center: { lat: number; lng: number };
  maxExplorationRadiusKm: number;
  startPosition: SpiralSearchPosition;
  excludedPlaceIds: Set<string>;
}): Promise<PrefectureWideSearcher> {
  const radiusM = getRadiusM(params.prefecture);
  const anchors = await resolveAnchors(params.prefecture, params.center);

  const stats: SearchFetcherStats = {
    apiCandidateCount: 0,
    sessionDuplicateCount: 0,
    previouslySavedExclusionCount: 0,
    searchPointCount: 0,
    pageFetchCount: 0,
    currentLocationLabel: params.prefecture,
  };

  const sessionSeen = new Set<string>();
  let anchorIndex = 0;
  let anchorPageToken: string | undefined;
  let anchorPagesAtPoint = 0;
  let spiralFetchCount = 0;

  const spiral = createSpiralSearcher({
    query: params.query,
    center: params.center,
    maxExplorationRadiusKm: params.maxExplorationRadiusKm,
    startPosition: params.startPosition,
    excludedPlaceIds: params.excludedPlaceIds,
    radiusM,
  });

  function classifyPlace(
    placeId: string,
    runtimeExcluded: Set<string>
  ): "new" | "session_dup" | "prev_saved" | "excluded" {
    if (params.excludedPlaceIds.has(placeId) || runtimeExcluded.has(placeId)) {
      if (params.excludedPlaceIds.has(placeId)) {
        return "prev_saved";
      }
      return "excluded";
    }
    if (sessionSeen.has(placeId)) return "session_dup";
    return "new";
  }

  async function fetchFromCurrentAnchor(
    maxCount: number,
    runtimeExcluded: Set<string>
  ): Promise<TextSearchPlace[]> {
    if (anchorIndex >= anchors.length) return [];

    const anchor = anchors[anchorIndex]!;
    stats.currentLocationLabel = anchor.label;
    stats.searchPointCount = anchorIndex + 1;

    const point: SearchPoint = {
      lat: anchor.lat,
      lng: anchor.lng,
      radiusM,
    };

    const batch: TextSearchPlace[] = [];

    while (batch.length < maxCount && anchorIndex < anchors.length) {
      const { places, nextPageToken } = await searchPlacesAtPointPage(
        params.query,
        point,
        anchorPageToken
      );

      stats.pageFetchCount++;
      stats.apiCandidateCount += places.length;

      for (const place of places) {
        const pid = place.placeId;
        if (!pid) continue;

        const kind = classifyPlace(pid, runtimeExcluded);
        if (kind === "prev_saved") {
          stats.previouslySavedExclusionCount++;
          sessionSeen.add(pid);
          continue;
        }
        if (kind === "session_dup" || kind === "excluded") {
          stats.sessionDuplicateCount++;
          continue;
        }

        sessionSeen.add(pid);
        batch.push(place);
        if (batch.length >= maxCount) break;
      }

      if (batch.length >= maxCount) {
        anchorPageToken = nextPageToken;
        break;
      }

      if (nextPageToken && anchorPagesAtPoint + 1 < MAX_PAGES_PER_POINT) {
        anchorPageToken = nextPageToken;
        anchorPagesAtPoint++;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      anchorIndex++;
      anchorPageToken = undefined;
      anchorPagesAtPoint = 0;

      if (anchorIndex < anchors.length) {
        const next = anchors[anchorIndex]!;
        point.lat = next.lat;
        point.lng = next.lng;
        stats.currentLocationLabel = next.label;
        stats.searchPointCount = anchorIndex + 1;
      } else {
        break;
      }
    }

    return batch;
  }

  async function fetchNextBatch(
    maxCount: number,
    runtimeExcluded: Set<string>
  ): Promise<TextSearchPlace[]> {
    if (maxCount <= 0) return [];

    if (anchorIndex < anchors.length || anchorPageToken) {
      const fromAnchors = await fetchFromCurrentAnchor(maxCount, runtimeExcluded);
      if (fromAnchors.length > 0) return fromAnchors;
    }

    if (spiral.isExhausted() || spiralFetchCount >= MAX_SPIRAL_FETCHES) {
      return [];
    }

    spiralFetchCount++;
    const spiralBatch = await spiral.fetchNextBatch(maxCount, runtimeExcluded);
    stats.apiCandidateCount += spiralBatch.length;
    stats.currentLocationLabel = `スパイラル (${spiral.getPosition().currentStep}ステップ)`;
    return spiralBatch;
  }

  return {
    fetchNextBatch,
    isExhausted: () =>
      (anchorIndex >= anchors.length && !anchorPageToken) &&
      (spiral.isExhausted() || spiralFetchCount >= MAX_SPIRAL_FETCHES),
    getStats: () => ({ ...stats }),
    getPosition: () => spiral.getPosition(),
  };
}

/** @deprecated 互換用エクスポート */
export { FIXED_SEARCH_RADIUS_M };
