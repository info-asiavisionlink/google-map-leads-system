import { NextRequest, NextResponse } from "next/server";
import { DEMO_USER_ID, MAX_RESULTS, RADIUS_OPTIONS } from "@/lib/constants";
import {
  geocodeArea,
  getPlaceDetails,
  searchPlaces,
  toPlaceSearchResult,
} from "@/lib/googleMaps";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTsv } from "@/lib/tsv";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";

type SearchBody = {
  area?: string;
  keyword1?: string;
  keyword2?: string;
  radiusM?: number;
};

function validateBody(body: SearchBody): string | null {
  const area = body.area?.trim();
  const keyword1 = body.keyword1?.trim();
  const radiusM = body.radiusM;

  if (!area) return "エリアを入力してください";
  if (!keyword1) return "キーワード1を入力してください";
  if (radiusM === undefined || radiusM === null) return "検索範囲を選択してください";
  if (!RADIUS_OPTIONS.includes(radiusM as (typeof RADIUS_OPTIONS)[number])) {
    return "検索範囲の値が不正です";
  }
  return null;
}

function buildSearchQuery(keyword1: string, keyword2?: string): string {
  const k2 = keyword2?.trim();
  return k2 ? `${keyword1} ${k2}` : keyword1;
}

async function getExcludedPlaceIds(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("excluded_places")
    .select("place_id")
    .eq("user_id", userId);

  if (error) {
    console.error("excluded_places 取得エラー:", error);
    throw new Error("除外リストの取得に失敗しました");
  }

  return new Set((data ?? []).map((row) => row.place_id as string));
}

export async function POST(request: NextRequest) {
  let body: SearchBody;

  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "リクエスト形式が不正です",
        results: [],
        copyText: "",
      } satisfies SearchApiResponse,
      { status: 400 }
    );
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json(
      {
        status: "error",
        message: validationError,
        results: [],
        copyText: "",
      } satisfies SearchApiResponse,
      { status: 400 }
    );
  }

  const area = body.area!.trim();
  const keyword1 = body.keyword1!.trim();
  const keyword2 = body.keyword2?.trim() || null;
  const radiusM = body.radiusM!;
  const userId = DEMO_USER_ID;
  const supabase = getSupabaseAdmin();

  try {
    const geocode = await geocodeArea(area);
    const query = buildSearchQuery(keyword1, keyword2 ?? undefined);
    const candidates = await searchPlaces({
      query,
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      radiusM,
    });

    const excluded = await getExcludedPlaceIds(userId);
    const seenInBatch = new Set<string>();
    const newPlaceIds: string[] = [];

    for (const place of candidates) {
      const pid = place.placeId;
      if (!pid || excluded.has(pid) || seenInBatch.has(pid)) continue;
      seenInBatch.add(pid);
      newPlaceIds.push(pid);
      if (newPlaceIds.length >= MAX_RESULTS) break;
    }

    const { data: searchRequest, error: requestInsertError } = await supabase
      .from("search_requests")
      .insert({
        user_id: userId,
        area,
        keyword1,
        keyword2,
        radius_m: radiusM,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        result_count: newPlaceIds.length,
        status: newPlaceIds.length > 0 ? "completed" : "no_results",
      })
      .select("id")
      .single();

    if (requestInsertError || !searchRequest) {
      console.error("search_requests 保存エラー:", requestInsertError);
      throw new Error("検索履歴の保存に失敗しました");
    }

    const searchRequestId = searchRequest.id as string;

    if (newPlaceIds.length === 0) {
      return NextResponse.json({
        status: "no_results",
        message:
          "この検索範囲では新しい検索結果がありません。エリア、半径、キーワードを変更して再検索してください。",
        results: [],
        copyText: "",
      } satisfies SearchApiResponse);
    }

    const detailsList = await Promise.all(
      newPlaceIds.map((placeId) => getPlaceDetails(placeId))
    );

    const results: PlaceSearchResult[] = detailsList.map(toPlaceSearchResult);

    const resultRows = results.map((r) => ({
      search_request_id: searchRequestId,
      user_id: userId,
      place_id: r.placeId,
      name: r.name,
      address: r.address,
      rating: r.rating,
      review_count: r.reviewCount,
      opening_hours: r.regularOpeningHours,
      phone_number: r.phoneNumber,
      website_url: r.websiteUrl,
      google_maps_url: r.googleMapsUrl,
      latitude: r.latitude,
      longitude: r.longitude,
      email: r.email,
      international_phone_number: r.internationalPhoneNumber,
      business_status: r.businessStatus,
      category: r.category,
      primary_type: r.primaryType,
      closed_days: r.closedDays,
      reviews_text: r.reviewsText,
      editorial_summary: r.editorialSummary,
      price_level: r.priceLevel,
      photo_names: r.photoNames,
    }));

    const { error: resultsInsertError } = await supabase
      .from("search_results")
      .insert(resultRows);

    if (resultsInsertError) {
      console.error("search_results 保存エラー:", resultsInsertError);
      throw new Error("検索結果の保存に失敗しました");
    }

    const excludedRows = newPlaceIds.map((placeId) => ({
      user_id: userId,
      place_id: placeId,
      first_seen_search_request_id: searchRequestId,
    }));

    const { error: excludedError } = await supabase
      .from("excluded_places")
      .upsert(excludedRows, { onConflict: "user_id,place_id" });

    if (excludedError) {
      console.error("excluded_places 保存エラー:", excludedError);
      throw new Error("除外リストの保存に失敗しました");
    }

    const copyText = buildTsv(results);
    const message = `${results.length}件の営業リストを作成しました`;

    return NextResponse.json({
      status: "success",
      message,
      results,
      copyText,
    } satisfies SearchApiResponse);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "検索処理中にエラーが発生しました";
    console.error("POST /api/places/search エラー:", err);
    return NextResponse.json(
      {
        status: "error",
        message,
        results: [],
        copyText: "",
      } satisfies SearchApiResponse,
      { status: 500 }
    );
  }
}
