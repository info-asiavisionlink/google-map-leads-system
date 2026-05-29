import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { PlaceSearchResult } from "@/lib/types";
import { sanitizeOptionalText, sanitizeText } from "@/lib/textSanitize";

export const SEARCH_RESULTS_CHUNK_SIZE = 50;

/** search_results テーブルに insert する行（存在するカラムのみ） */
export type SearchResultRow = {
  search_request_id: string;
  user_id: string;
  place_id: string;
  name: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  opening_hours: string | null;
  phone_number: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  email: string | null;
  international_phone_number: string | null;
  business_status: string | null;
  category: string | null;
  primary_type: string | null;
  closed_days: string | null;
  reviews_text: string | null;
  editorial_summary: string | null;
  price_level: string | null;
  photo_names: string | null;
};

export function toDbTextField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const joined = value.map((v) => String(v)).join("\n").trim();
    return sanitizeText(joined);
  }
  if (typeof value === "object") {
    try {
      return sanitizeText(JSON.stringify(value));
    } catch {
      return null;
    }
  }
  return sanitizeText(String(value));
}

export function toOptionalString(value: string | null | undefined): string | null {
  return sanitizeOptionalText(value);
}

export function sanitizeSearchResultRow(row: SearchResultRow): SearchResultRow {
  return {
    ...row,
    place_id: sanitizeText(row.place_id) ?? row.place_id,
    name: sanitizeOptionalText(row.name),
    address: sanitizeOptionalText(row.address),
    phone_number: sanitizeOptionalText(row.phone_number),
    website_url: sanitizeOptionalText(row.website_url),
    google_maps_url: sanitizeOptionalText(row.google_maps_url),
    email: sanitizeOptionalText(row.email),
    international_phone_number: sanitizeOptionalText(row.international_phone_number),
    business_status: sanitizeOptionalText(row.business_status),
    category: sanitizeOptionalText(row.category),
    primary_type: sanitizeOptionalText(row.primary_type),
    closed_days: toDbTextField(row.closed_days),
    reviews_text: toDbTextField(row.reviews_text),
    editorial_summary: toDbTextField(row.editorial_summary),
    price_level: toDbTextField(row.price_level),
    photo_names: toDbTextField(row.photo_names),
    opening_hours: toDbTextField(row.opening_hours),
  };
}

export function placeSearchResultToRow(
  result: PlaceSearchResult,
  searchRequestId: string,
  userId: string
): SearchResultRow | null {
  const placeId = result.placeId?.trim();
  if (!placeId) return null;

  return {
    search_request_id: searchRequestId,
    user_id: userId,
    place_id: placeId,
    name: toOptionalString(result.name),
    address: toOptionalString(result.address),
    rating: result.rating,
    review_count: result.reviewCount,
    opening_hours: toDbTextField(result.regularOpeningHours),
    phone_number: toOptionalString(result.phoneNumber),
    website_url: toOptionalString(result.websiteUrl),
    google_maps_url: toOptionalString(result.googleMapsUrl),
    latitude: result.latitude,
    longitude: result.longitude,
    email: toOptionalString(result.email),
    international_phone_number: toOptionalString(
      result.internationalPhoneNumber
    ),
    business_status: toOptionalString(result.businessStatus),
    category: toOptionalString(result.category),
    primary_type: toOptionalString(result.primaryType),
    closed_days: toDbTextField(result.closedDays),
    reviews_text: toDbTextField(result.reviewsText),
    editorial_summary: toDbTextField(result.editorialSummary),
    price_level: toDbTextField(result.priceLevel),
    photo_names: toDbTextField(result.photoNames),
  };
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function logSupabasePersistenceError(
  context: string,
  error: PostgrestError,
  meta?: { rowCount?: number; sampleRow?: unknown }
): void {
  console.error(`[search-persistence] ${context}`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    rowCount: meta?.rowCount,
    sampleRow: meta?.sampleRow,
  });
}

/** 同一 user_id が過去に保存した全 place_id（他ユーザーは含まない） */
export async function getPreviouslySavedPlaceIdsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("search_results")
    .select("place_id")
    .eq("user_id", userId);

  if (error) {
    logSupabasePersistenceError("search_results place_id fetch error", error, {
      rowCount: 0,
    });
    throw new Error("保存済み place_id の取得に失敗しました");
  }

  return new Set(
    (data ?? [])
      .map((row) => row.place_id as string)
      .filter((id): id is string => Boolean(id))
  );
}

export function logSearchResultsSaveFailure(
  error: PostgrestError,
  meta: {
    attemptedCount: number;
    sampleRow: unknown;
    duplicateExclusionCount: number;
    previouslySavedPlaceIdCount: number;
  }
): void {
  console.error("[search-persistence] search_results save failed", {
    code: error.code,
    message: error.message,
    attemptedCount: meta.attemptedCount,
    sampleRow: meta.sampleRow,
    duplicateExclusionCount: meta.duplicateExclusionCount,
    previouslySavedPlaceIdCount: meta.previouslySavedPlaceIdCount,
  });
}

export async function insertSearchResultsBatch(
  supabase: SupabaseClient,
  rows: SearchResultRow[]
): Promise<
  | { ok: true; savedCount: number; failedCount: number; savedPlaceIds: string[] }
  | { ok: false; error: PostgrestError; savedCount: number; failedCount: number; savedPlaceIds: string[] }
> {
  if (rows.length === 0) {
    return { ok: true, savedCount: 0, failedCount: 0, savedPlaceIds: [] };
  }

  let savedCount = 0;
  let failedCount = 0;
  let lastError: PostgrestError | null = null;
  const savedPlaceIds: string[] = [];

  for (const rawRow of rows) {
    const row = sanitizeSearchResultRow(rawRow);
    const { error } = await supabase.from("search_results").insert(row);

    if (error) {
      failedCount++;
      lastError = error;
      console.error("[search-persistence] search_results 1件保存失敗", {
        place_id: row.place_id,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      continue;
    }

    savedCount++;
    savedPlaceIds.push(row.place_id);
  }

  if (failedCount > 0 && savedCount === 0 && lastError) {
    logSupabasePersistenceError("search_results insert error (all failed)", lastError, {
      rowCount: rows.length,
      sampleRow: sanitizeSearchResultRow(rows[0]),
    });
    return { ok: false, error: lastError, savedCount, failedCount, savedPlaceIds };
  }

  return { ok: true, savedCount, failedCount, savedPlaceIds };
}

export async function insertSearchResultsInChunks(
  supabase: SupabaseClient,
  rows: SearchResultRow[]
): Promise<{ ok: true } | { ok: false; error: PostgrestError }> {
  if (rows.length === 0) {
    return { ok: true };
  }

  const chunks = chunkArray(rows, SEARCH_RESULTS_CHUNK_SIZE);

  for (const chunk of chunks) {
    const { error } = await supabase.from("search_results").insert(chunk);
    if (error) {
      logSupabasePersistenceError("search_results insert error", error, {
        rowCount: chunk.length,
        sampleRow: chunk[0],
      });
      return { ok: false, error };
    }
  }

  return { ok: true };
}

export async function completeSearchRequest(
  supabase: SupabaseClient,
  searchRequestId: string,
  params: {
    resultCount: number;
    latitude: number | null;
    longitude: number | null;
    radiusM?: number;
  }
): Promise<PostgrestError | null> {
  const { error } = await supabase
    .from("search_requests")
    .update({
      status: "completed",
      result_count: params.resultCount,
      latitude: params.latitude,
      longitude: params.longitude,
      ...(params.radiusM != null ? { radius_m: params.radiusM } : {}),
    })
    .eq("id", searchRequestId);

  if (error) {
    logSupabasePersistenceError("search_requests update error", error, {
      rowCount: params.resultCount,
    });
  }

  return error;
}
