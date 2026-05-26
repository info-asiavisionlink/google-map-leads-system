import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { PlaceSearchResult } from "@/lib/types";

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
    return joined || null;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  const s = String(value).trim();
  if (!s || s === "-") return null;
  return s;
}

export function toOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = value.trim();
  if (!s || s === "-") return null;
  return s;
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
  }
): Promise<PostgrestError | null> {
  const { error } = await supabase
    .from("search_requests")
    .update({
      status: "completed",
      result_count: params.resultCount,
      latitude: params.latitude,
      longitude: params.longitude,
    })
    .eq("id", searchRequestId);

  if (error) {
    logSupabasePersistenceError("search_requests update error", error, {
      rowCount: params.resultCount,
    });
  }

  return error;
}
