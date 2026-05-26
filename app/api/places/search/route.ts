import { NextRequest, NextResponse } from "next/server";
import { authDebugError, authDebugInfo } from "@/lib/authDebug";
import {
  API_ERROR_MESSAGE,
  calculateCreditCost,
  CREDIT_CONSUME_FAILED_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
  LEGACY_RADIUS_M,
  MAX_RESULTS,
  MIN_CREDIT_TO_SEARCH,
  NO_RESULTS_FOUND_MESSAGE,
  SAVE_RESULTS_FAILED_MESSAGE,
  TOKEN_AUTH_EXPIRED_MESSAGE,
} from "@/lib/constants";
import {
  consumeDashboardCredits,
  DashboardCreditsError,
  hasEnoughCredit,
} from "@/lib/dashboardCredits";
import {
  buildSearchQuery,
  geocodePrefecture,
  getPlaceDetails,
  searchPlacesMultiPoint,
  toPlaceSearchResult,
} from "@/lib/googleMaps";
import { PREFECTURES } from "@/lib/prefectures";
import {
  extractSearchAuth,
  resolveSearchAuthContext,
  type SearchAuthBody,
} from "@/lib/searchAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTsv } from "@/lib/tsv";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";

type SearchBody = SearchAuthBody & {
  area?: string;
  prefecture?: string;
  keyword1?: string;
  keyword2?: string;
};

function jsonResponse(
  body: SearchApiResponse,
  status = 200
): NextResponse<SearchApiResponse> {
  return NextResponse.json(body, { status });
}

function validateBody(body: SearchBody): string | null {
  const area = body.area?.trim() || body.prefecture?.trim();
  const keyword1 = body.keyword1?.trim();

  if (!area) return "都道府県を選択してください";
  if (!PREFECTURES.includes(area as (typeof PREFECTURES)[number])) {
    return "都道府県の値が不正です";
  }
  if (!keyword1) return "大カテゴリー・業種を入力してください";
  return null;
}

function resolvePrefecture(body: SearchBody): string {
  return (body.area?.trim() || body.prefecture?.trim()) as string;
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

async function markSearchRequestFailed(
  searchRequestId: string,
  resultCount: number
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("search_requests")
    .update({
      status: "failed",
      result_count: resultCount,
    })
    .eq("id", searchRequestId);
}

export async function POST(request: NextRequest) {
  authDebugInfo("api-places-search", { step: "request_received" });

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

  const extractedAuth = extractSearchAuth(request, body);
  if (!extractedAuth) {
    authDebugError("api-places-search", { failure: "missing_user_or_token" });
    return jsonResponse(
      {
        status: "error",
        message: TOKEN_AUTH_EXPIRED_MESSAGE,
        results: [],
        copyText: "",
        code: "unauthorized",
      },
      401
    );
  }

  let authContext;
  try {
    authContext = await resolveSearchAuthContext(
      extractedAuth,
      body.current_credit
    );
  } catch (err) {
    authDebugError("api-places-search", { failure: "auth_resolve" }, err);
    const message =
      err instanceof DashboardCreditsError
        ? err.message
        : TOKEN_AUTH_EXPIRED_MESSAGE;
    return jsonResponse(
      {
        status: "error",
        message,
        results: [],
        copyText: "",
        code: "unauthorized",
      },
      err instanceof DashboardCreditsError ? err.status : 401
    );
  }

  const userId = authContext.userId;
  const accessToken = authContext.accessToken;
  const currentCredit = authContext.currentCredit;

  authDebugInfo("api-places-search", {
    user_id: userId,
    verified_via_dashboard: authContext.verifiedViaDashboard,
    current_credit: currentCredit,
  });

  const prefecture = resolvePrefecture(body);
  const keyword1 = body.keyword1!.trim();
  const keyword2 = body.keyword2?.trim() || null;

  if (!hasEnoughCredit(currentCredit, MIN_CREDIT_TO_SEARCH)) {
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
  let searchRequestId: string | null = null;

  try {
    const { data: pendingRequest, error: pendingError } = await supabase
      .from("search_requests")
      .insert({
        user_id: userId,
        area: prefecture,
        keyword1,
        keyword2,
        radius_m: LEGACY_RADIUS_M,
        status: "pending",
        result_count: 0,
      })
      .select("id")
      .single();

    if (pendingError || !pendingRequest) {
      console.error("search_requests pending 作成エラー:", pendingError);
      throw new Error("検索履歴の作成に失敗しました");
    }

    searchRequestId = pendingRequest.id as string;

    const center = await geocodePrefecture(prefecture);
    const query = buildSearchQuery(keyword1, keyword2 ?? undefined, prefecture);
    const excluded = await getExcludedPlaceIds(userId);

    const candidates = await searchPlacesMultiPoint({
      query,
      center,
      excludedPlaceIds: excluded,
      maxResults: MAX_RESULTS,
    });

    if (candidates.length === 0) {
      await supabase
        .from("search_requests")
        .update({
          status: "completed",
          result_count: 0,
          latitude: center.lat,
          longitude: center.lng,
        })
        .eq("id", searchRequestId);

      return jsonResponse({
        status: "no_results",
        message: NO_RESULTS_FOUND_MESSAGE,
        results: [],
        copyText: "",
        credit: currentCredit,
        resultCount: 0,
        creditConsumed: 0,
      });
    }

    const actualCreditCost = calculateCreditCost(candidates.length);

    if (!hasEnoughCredit(currentCredit, actualCreditCost)) {
      await markSearchRequestFailed(searchRequestId, 0);
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

    const detailsList = await Promise.all(
      candidates.map((place) => getPlaceDetails(place.placeId))
    );

    const results: PlaceSearchResult[] = detailsList.map(toPlaceSearchResult);
    const newPlaceIds = results.map((r) => r.placeId);

    let creditAfter: number;
    try {
      const consumeResult = await consumeDashboardCredits({
        userId,
        amount: actualCreditCost,
        resultCount: results.length,
        externalRequestId: searchRequestId,
        accessToken,
      });
      creditAfter = consumeResult.credit;
    } catch (consumeErr) {
      authDebugError(
        "api-places-search",
        { failure: "consume_api", endpoint: "DASHBOARD_CREDIT_API_URL" },
        consumeErr
      );
      await markSearchRequestFailed(searchRequestId, results.length);
      const detail =
        consumeErr instanceof DashboardCreditsError
          ? consumeErr.message
          : CREDIT_CONSUME_FAILED_MESSAGE;
      return jsonResponse(
        {
          status: "error",
          message: detail,
          results: [],
          copyText: "",
          credit: currentCredit,
          code: "consume_failed",
        },
        500
      );
    }

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
      await markSearchRequestFailed(searchRequestId, results.length);
      return jsonResponse(
        {
          status: "error",
          message: SAVE_RESULTS_FAILED_MESSAGE,
          results: [],
          copyText: "",
          credit: creditAfter,
          code: "save_failed",
        },
        500
      );
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
      await markSearchRequestFailed(searchRequestId, results.length);
      return jsonResponse(
        {
          status: "error",
          message: SAVE_RESULTS_FAILED_MESSAGE,
          results: [],
          copyText: "",
          credit: creditAfter,
          code: "save_failed",
        },
        500
      );
    }

    const { error: completeError } = await supabase
      .from("search_requests")
      .update({
        status: "completed",
        result_count: results.length,
        latitude: center.lat,
        longitude: center.lng,
      })
      .eq("id", searchRequestId);

    if (completeError) {
      console.error("search_requests 完了更新エラー:", completeError);
    }

    const copyText = buildTsv(results);
    const message = `取得件数：${results.length}件 / 消費クレジット：${actualCreditCost} / 残りクレジット：${creditAfter.toLocaleString("ja-JP")}`;

    return jsonResponse({
      status: "success",
      message,
      results,
      copyText,
      credit: creditAfter,
      resultCount: results.length,
      creditConsumed: actualCreditCost,
    });
  } catch (err) {
    console.error("POST /api/places/search エラー:", err);
    if (searchRequestId) {
      await markSearchRequestFailed(searchRequestId, 0).catch(() => undefined);
    }
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
