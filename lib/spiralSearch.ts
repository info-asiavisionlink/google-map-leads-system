import {
  searchPlacesAtPointPage,
  type SearchPoint,
  type TextSearchPlace,
} from "@/lib/googleMaps";
import type { SpiralSearchPosition } from "@/lib/searchProgress";

/** 検索円の半径（固定 1km） */
export const FIXED_SEARCH_RADIUS_M = 1000;

/** スパイラル移動の1ステップ距離 */
export const SPIRAL_STEP_KM = 1.5;

/** 方角: 0=東, 1=北, 2=西, 3=南（北を0度とする方位角） */
const DIRECTION_BEARINGS = [90, 0, 270, 180] as const;

function destinationPoint(
  lat: number,
  lng: number,
  distanceKm: number,
  bearingDeg: number
): { lat: number; lng: number } {
  const earthRadiusKm = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angularDistance = distanceKm / earthRadiusKm;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

export type SpiralSearcher = {
  fetchNextBatch: (
    maxCount: number,
    runtimeExcluded: Set<string>
  ) => Promise<TextSearchPlace[]>;
  isExhausted: () => boolean;
  getPosition: () => SpiralSearchPosition;
  getSpiralDistanceKm: () => number;
};

export function createSpiralSearcher(params: {
  query: string;
  center: { lat: number; lng: number };
  maxExplorationRadiusKm: number;
  startPosition: SpiralSearchPosition;
  excludedPlaceIds: Set<string>;
}): SpiralSearcher {
  const sessionSeen = new Set<string>();
  const center = {
    lat: params.startPosition.centerLatitude,
    lng: params.startPosition.centerLongitude,
  };

  let currentLat =
    params.startPosition.lastLatitude ?? params.startPosition.centerLatitude;
  let currentLng =
    params.startPosition.lastLongitude ?? params.startPosition.centerLongitude;
  let currentDirection = params.startPosition.currentDirection % 4;
  let currentLegLength = Math.max(1, params.startPosition.currentLegLength);
  let currentLegProgress = params.startPosition.currentLegProgress;
  let currentStep = params.startPosition.currentStep;
  let turnsCompleted = 0;

  let pointPageToken: string | undefined;
  /** 中心から maxExplorationRadiusKm を超えたときのみ true（空地点・重複では true にしない） */
  let regionFullyScanned = false;

  function currentSearchPoint(): SearchPoint {
    return {
      lat: currentLat,
      lng: currentLng,
      radiusM: FIXED_SEARCH_RADIUS_M,
    };
  }

  function getSpiralDistanceKm(): number {
    return haversineKm(center, { lat: currentLat, lng: currentLng });
  }

  function isBeyondExplorationRange(): boolean {
    return getSpiralDistanceKm() > params.maxExplorationRadiusKm;
  }

  function getPosition(): SpiralSearchPosition {
    return {
      lastLatitude: currentLat,
      lastLongitude: currentLng,
      centerLatitude: center.lat,
      centerLongitude: center.lng,
      currentStep,
      currentDirection,
      currentLegLength,
      currentLegProgress,
    };
  }

  function advanceSpiralLocation(): void {
    pointPageToken = undefined;
    const bearing = DIRECTION_BEARINGS[currentDirection];
    const next = destinationPoint(
      currentLat,
      currentLng,
      SPIRAL_STEP_KM,
      bearing
    );
    currentLat = next.lat;
    currentLng = next.lng;
    currentLegProgress++;
    currentStep++;

    if (currentLegProgress >= currentLegLength) {
      currentDirection = (currentDirection + 1) % 4;
      currentLegProgress = 0;
      turnsCompleted++;
      if (turnsCompleted % 2 === 0) {
        currentLegLength++;
      }
    }
  }

  /**
   * 最大 maxCount 件まで候補を返す。
   * 1回の呼び出しでは「現在地点のページネーション」または「次の1スパイラル地点」まで。
   * 全域を一度に走査して exhausted にしない（200件到達まで route 側が繰り返す）。
   */
  async function fetchNextBatch(
    maxCount: number,
    runtimeExcluded: Set<string>
  ): Promise<TextSearchPlace[]> {
    if (regionFullyScanned || maxCount <= 0) {
      return [];
    }

    const batch: TextSearchPlace[] = [];

    while (batch.length < maxCount) {
      if (isBeyondExplorationRange()) {
        regionFullyScanned = true;
        break;
      }

      const { places: pagePlaces, nextPageToken } =
        await searchPlacesAtPointPage(
          params.query,
          currentSearchPoint(),
          pointPageToken
        );

      for (const place of pagePlaces) {
        const pid = place.placeId;
        if (
          !pid ||
          sessionSeen.has(pid) ||
          params.excludedPlaceIds.has(pid) ||
          runtimeExcluded.has(pid)
        ) {
          continue;
        }
        sessionSeen.add(pid);
        batch.push(place);
        if (batch.length >= maxCount) {
          break;
        }
      }

      if (batch.length >= maxCount) {
        pointPageToken = nextPageToken;
        break;
      }

      if (nextPageToken) {
        pointPageToken = nextPageToken;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      pointPageToken = undefined;
      advanceSpiralLocation();

      if (isBeyondExplorationRange()) {
        regionFullyScanned = true;
      }

      break;
    }

    return batch.slice(0, maxCount);
  }

  return {
    fetchNextBatch,
    isExhausted: () => regionFullyScanned,
    getPosition,
    getSpiralDistanceKm,
  };
}
