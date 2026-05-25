import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  API_ERROR_MESSAGE,
  AUTH_REQUIRED_MESSAGE,
  CREDIT_CONSUME_FAILED_MESSAGE,
  GOOGLE_MAP_SEARCH_CREDIT_COST,
  INSUFFICIENT_CREDIT_MESSAGE,
  MAX_RESULTS,
  NO_NEW_RESULTS_MESSAGE,
  RADIUS_OPTIONS,
} from "@/lib/constants";
import {
  consumeDashboardCredits,
  DashboardCreditsError,
  fetchDashboardBalance,
  hasEnoughCredit,
} from "@/lib/dashboardCredits";
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

function jsonResponse(
  body: SearchApiResponse,
  status = 200
): NextResponse<SearchApiResponse> {
  return NextResponse.json(body, { status });
}

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
    return jsonResponse(
      {
        status: "error",
        message: "リクエスト形式が不正です",
        results: [],
        copyText: "",
      },
      400
    );
  }

  const validationError = validateBody(body);
  if (validationError) {
    return jsonResponse(
      {
        status: "error",
        message: validationError,
        results: [],
        copyText: "",
      },
      400
    );
  }

  const user = await getAuthUser(request);
  if (!user) {
    return jsonResponse(
      {
        status: "error",
        message: AUTH_REQUIRED_MESSAGE,
        results: [],
        copyText: "",
        code: "unauthorized",
      },
      401
    );
  }

  const userId = user.id;
  const area = body.area!.trim();
  const keyword1 = body.keyword1!.trim();
  const keyword2 = body.keyword2?.trim() || null;
  const radiusM = body.radiusM!;

  let currentCredit: number;
  try {
    currentCredit = await fetchDashboardBalance(request);
  } catch (err) {
    console.error("ダッシュボード残高確認エラー:", err);
    if (err instanceof DashboardCreditsError && err.status === 401) {
      return jsonResponse(
        {
          status: "error",
          message: AUTH_REQUIRED_MESSAGE,
          results: [],
          copyText: "",
          code: "unauthorized",
        },
        401
      );
    }
    return jsonResponse(
      {
        status: "error",
        message: API_ERROR_MESSAGE,
        results: [],
        copyText: "",
        code: "api_error",
      },
      500
    );
  }

  if (!hasEnoughCredit(currentCredit)) {
    return jsonResponse(
      {
        status: "error",
        message: INSUFFICIENT_CREDIT_MESSAGE,
        results: [],
        copyText: "",
        credit: currentCredit,
        code: "insufficient_credit",
      },
      402
    );
  }

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

    if (newPlaceIds.length === 0) {
      return jsonResponse({
        status: "no_results",
        message: NO_NEW_RESULTS_MESSAGE,
        results: [],
        copyText: "",
        credit: currentCredit,
      });
    }

    const detailsList = await Promise.all(
      newPlaceIds.map((placeId) => getPlaceDetails(placeId))
    );

    const results: PlaceSearchResult[] = detailsList.map(toPlaceSearchResult);

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
        result_count: results.length,
        status: "completed",
      })
      .select("id")
      .single();

    if (requestInsertError || !searchRequest) {
      console.error("search_requests 保存エラー:", requestInsertError);
      throw new Error("検索履歴の保存に失敗しました");
    }

    const searchRequestId = searchRequest.id as string;

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

    let creditAfter: number;
    try {
      const consumeResult = await consumeDashboardCredits(
        request,
        searchRequestId
      );
      creditAfter = consumeResult.credit;
    } catch (consumeErr) {
      console.error("クレジット消費APIエラー:", consumeErr);
      const detail =
        consumeErr instanceof DashboardCreditsError
          ? consumeErr.message
          : CREDIT_CONSUME_FAILED_MESSAGE;
      return jsonResponse(
        {
          status: "error",
          message: `${CREDIT_CONSUME_FAILED_MESSAGE}（${detail}）`,
          results: [],
          copyText: "",
          credit: currentCredit,
          code: "consume_failed",
        },
        500
      );
    }

    const copyText = buildTsv(results);
    const message = `${results.length}件の営業リストを作成しました（${GOOGLE_MAP_SEARCH_CREDIT_COST} Credit消費）`;

    return jsonResponse({
      status: "success",
      message,
      results,
      copyText,
      credit: creditAfter,
    });
  } catch (err) {
    console.error("POST /api/places/search エラー:", err);
    return jsonResponse(
      {
        status: "error",
        message: API_ERROR_MESSAGE,
        results: [],
        copyText: "",
        credit: currentCredit,
        code: "api_error",
      },
      500
    );
  }
}
