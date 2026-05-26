import {
  searchPlacesAtPoint,
  searchPlacesAtPointPage,
  type SearchPoint,
  type TextSearchPlace,
} from "@/lib/googleMaps";
import type { SearchProgressPosition } from "@/lib/searchProgress";

const POINTS_PER_RING = 8;

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

export function ringPointAt(
  center: { lat: number; lng: number },
  radiusKm: number,
  angleIndex: number
): SearchPoint {
  const bearing = (360 / POINTS_PER_RING) * (angleIndex % POINTS_PER_RING);
  const dest = destinationPoint(center.lat, center.lng, radiusKm, bearing);
  return {
    lat: dest.lat,
    lng: dest.lng,
    radiusM: Math.max(1000, radiusKm * 1000),
  };
}

export type ProgressRingSearcher = {
  fetchNextBatch: (
    maxCount: number,
    runtimeExcluded: Set<string>
  ) => Promise<TextSearchPlace[]>;
  isExhausted: () => boolean;
  getPosition: () => SearchProgressPosition;
  getCurrentSearchLocationLabel: () => string;
  getNextResumeLocationLabel: () => string;
};

export function createProgressRingSearcher(params: {
  query: string;
  center: { lat: number; lng: number };
  maxRadiusKm: number;
  startPosition: SearchProgressPosition;
  excludedPlaceIds: Set<string>;
}): ProgressRingSearcher {
  const sessionSeen = new Set<string>();
  let currentRadiusKm = Math.max(1, params.startPosition.currentRadiusKm);
  let currentAngle = params.startPosition.currentAngle % POINTS_PER_RING;
  let pointPageToken: string | undefined;
  let exhausted = false;
  let lastSearchPoint: SearchPoint | null = null;

  const center = {
    lat: params.startPosition.centerLatitude,
    lng: params.startPosition.centerLongitude,
  };

  function getPosition(): SearchProgressPosition {
    const point = lastSearchPoint ?? ringPointAt(center, currentRadiusKm, currentAngle);
    return {
      lastLatitude: point.lat,
      lastLongitude: point.lng,
      centerLatitude: center.lat,
      centerLongitude: center.lng,
      currentRadiusKm,
      currentAngle,
      currentRingIndex: Math.max(0, currentRadiusKm - 1),
    };
  }

  function advanceToNextPoint(): void {
    pointPageToken = undefined;
    currentAngle++;
    if (currentAngle >= POINTS_PER_RING) {
      currentAngle = 0;
      currentRadiusKm++;
    }
    if (currentRadiusKm > params.maxRadiusKm) {
      exhausted = true;
    }
  }

  async function fetchNextBatch(
    maxCount: number,
    runtimeExcluded: Set<string>
  ): Promise<TextSearchPlace[]> {
    const batch: TextSearchPlace[] = [];

    while (batch.length < maxCount && !exhausted) {
      if (currentRadiusKm > params.maxRadiusKm) {
        exhausted = true;
        break;
      }

      const point = ringPointAt(center, currentRadiusKm, currentAngle);
      lastSearchPoint = point;

      if (pointPageToken) {
        const { places: pagePlaces, nextPageToken } =
          await searchPlacesAtPointPage(params.query, point, pointPageToken);

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
          if (batch.length >= maxCount) break;
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

        advanceToNextPoint();
        continue;
      }

      const places = await searchPlacesAtPoint(
        params.query,
        point,
        Math.min(60, maxCount - batch.length + 10)
      );

      for (const place of places) {
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
        if (batch.length >= maxCount) break;
      }

      if (batch.length >= maxCount) {
        break;
      }

      advanceToNextPoint();
    }

    return batch.slice(0, maxCount);
  }

  return {
    fetchNextBatch,
    isExhausted: () => exhausted,
    getPosition,
    getCurrentSearchLocationLabel: () => {
      const p = lastSearchPoint ?? ringPointAt(center, currentRadiusKm, currentAngle);
      return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}（半径${currentRadiusKm}km・地点${currentAngle + 1}/8）`;
    },
    getNextResumeLocationLabel: () => {
      let nextRadius = currentRadiusKm;
      let nextAngle = currentAngle;
      if (!pointPageToken) {
        nextAngle++;
        if (nextAngle >= POINTS_PER_RING) {
          nextAngle = 0;
          nextRadius++;
        }
      }
      if (nextRadius > params.maxRadiusKm) {
        return "都道府県全域を検索済み";
      }
      const p = ringPointAt(center, nextRadius, nextAngle);
      return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}（半径${nextRadius}km・地点${nextAngle + 1}/8）`;
    },
  };
}
