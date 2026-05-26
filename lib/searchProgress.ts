import type { SupabaseClient } from "@supabase/supabase-js";
import { logSupabasePersistenceError } from "@/lib/searchPersistence";

/**
 * DBカラムとの対応（スパイラル検索）:
 * - current_radius_km → current_step
 * - current_angle → current_direction (0=東,1=北,2=西,3=南)
 * - current_ring_index → current_leg_progress
 * - current_leg_length → current_leg_length
 */
export type SearchProgressRow = {
  id: string;
  user_id: string;
  area: string;
  keyword1: string;
  keyword2: string | null;
  keyword2_normalized: string;
  last_latitude: number | null;
  last_longitude: number | null;
  center_latitude: number | null;
  center_longitude: number | null;
  current_radius_km: number;
  current_angle: number;
  current_ring_index: number;
  current_leg_length: number;
  total_saved_count: number;
  is_exhausted: boolean;
};

export type SpiralSearchPosition = {
  lastLatitude: number;
  lastLongitude: number;
  centerLatitude: number;
  centerLongitude: number;
  currentStep: number;
  /** 0=東, 1=北, 2=西, 3=南 */
  currentDirection: number;
  currentLegLength: number;
  currentLegProgress: number;
};

/** @deprecated SpiralSearchPosition を使用 */
export type SearchProgressPosition = SpiralSearchPosition;

export function normalizeKeyword2(keyword2: string | null | undefined): string {
  return keyword2?.trim() ?? "";
}

export async function loadSearchProgressRecord(
  supabase: SupabaseClient,
  params: {
    userId: string;
    area: string;
    keyword1: string;
    keyword2: string | null;
  }
): Promise<SearchProgressRow | null> {
  const keyword2Normalized = normalizeKeyword2(params.keyword2);

  const { data, error } = await supabase
    .from("search_progress")
    .select(
      "id, user_id, area, keyword1, keyword2, keyword2_normalized, last_latitude, last_longitude, center_latitude, center_longitude, current_radius_km, current_angle, current_ring_index, current_leg_length, total_saved_count, is_exhausted"
    )
    .eq("user_id", params.userId)
    .eq("area", params.area)
    .eq("keyword1", params.keyword1)
    .eq("keyword2_normalized", keyword2Normalized)
    .maybeSingle();

  if (error) {
    logSupabasePersistenceError("search_progress load error", error);
    throw new Error("検索進捗の取得に失敗しました");
  }

  return data as SearchProgressRow | null;
}

export async function upsertSearchProgress(
  supabase: SupabaseClient,
  params: {
    userId: string;
    area: string;
    keyword1: string;
    keyword2: string | null;
    position: SpiralSearchPosition;
    totalSavedCount: number;
    isExhausted: boolean;
    progressId?: string;
  }
): Promise<void> {
  const keyword2Normalized = normalizeKeyword2(params.keyword2);
  const row = {
    user_id: params.userId,
    area: params.area,
    keyword1: params.keyword1,
    keyword2: params.keyword2,
    keyword2_normalized: keyword2Normalized,
    last_latitude: params.position.lastLatitude,
    last_longitude: params.position.lastLongitude,
    center_latitude: params.position.centerLatitude,
    center_longitude: params.position.centerLongitude,
    current_radius_km: params.position.currentStep,
    current_angle: params.position.currentDirection,
    current_ring_index: params.position.currentLegProgress,
    current_leg_length: params.position.currentLegLength,
    total_saved_count: params.totalSavedCount,
    is_exhausted: params.isExhausted,
    updated_at: new Date().toISOString(),
  };

  if (params.progressId) {
    const { error } = await supabase
      .from("search_progress")
      .update(row)
      .eq("id", params.progressId);

    if (error) {
      logSupabasePersistenceError("search_progress update error", error);
      throw new Error("検索進捗の更新に失敗しました");
    }
    return;
  }

  const { error } = await supabase.from("search_progress").upsert(row, {
    onConflict: "user_id,area,keyword1,keyword2_normalized",
  });

  if (error) {
    logSupabasePersistenceError("search_progress upsert error", error);
    throw new Error("検索進捗の保存に失敗しました");
  }
}

export function progressRowToSpiralPosition(
  row: SearchProgressRow | null,
  center: { lat: number; lng: number }
): SpiralSearchPosition {
  if (!row) {
    return {
      lastLatitude: center.lat,
      lastLongitude: center.lng,
      centerLatitude: center.lat,
      centerLongitude: center.lng,
      currentStep: 0,
      currentDirection: 0,
      currentLegLength: 1,
      currentLegProgress: 0,
    };
  }

  return {
    lastLatitude: row.last_latitude ?? center.lat,
    lastLongitude: row.last_longitude ?? center.lng,
    centerLatitude: row.center_latitude ?? center.lat,
    centerLongitude: row.center_longitude ?? center.lng,
    currentStep: row.current_radius_km ?? 0,
    currentDirection: row.current_angle ?? 0,
    currentLegLength: row.current_leg_length ?? 1,
    currentLegProgress: row.current_ring_index ?? 0,
  };
}

/** @deprecated progressRowToSpiralPosition を使用 */
export function progressRowToPosition(
  row: SearchProgressRow | null,
  center: { lat: number; lng: number }
): SpiralSearchPosition {
  return progressRowToSpiralPosition(row, center);
}
