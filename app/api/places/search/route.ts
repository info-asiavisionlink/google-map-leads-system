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
  SEARCH_BATCH_SIZE,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import {
  consumeDashboardCredits,
  DashboardCreditsError,
  hasEnoughCredit,
} from "@/lib/dashboardCredits";
import {
  buildSearchQuery,
  createIncrementalPlacesSearcher,
  geocodePrefecture,
  getPlaceDetails,
  toPlaceSearchResult,
} from "@/lib/googleMaps";
import { PREFECTURES } from "@/lib/prefectures";
import {
  extractSearchUserId,
  resolveSearchAuthContext,
  type SearchAuthBody,
} from "@/lib/searchAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  completeSearchRequest,
  getSavedPlaceIdsForRequest,
  insertSearchResultsBatch,
  logSupabasePersistenceError,
  placeSearchResultToRow,
} from "@/lib/searchPersistence";
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

function logSearchLoop(meta: {
  fetched: number;
  saved: number;
  duplicates: number;
  total_saved: number;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[search-loop]", meta);
}

function buildSuccessMessage(params: {
  fetchedCount: number;
  savedCount: number;
  saveFailedCount: number;
  creditConsumed: number;
  creditAfter: number;
}): string {
  return [
    `取得件数: ${params.fetchedCount}件`,
    `保存成功: ${params.savedCount}件`,
    `保存失敗: ${params.saveFailedCount}件`,
    `消費クレジット: ${params.creditConsumed}`,
    `残クレジット: ${params.creditAfter.toLocaleString("ja-JP")}`,
  ].join(" / ");
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

  const userId = extractSearchUserId(request, body);
  if (!userId) {
    authDebugError("api-places-search", { failure: "missing_user_id" });
    return jsonResponse(
      {
        status: "error",
        message: USER_INFO_MISSING_MESSAGE,
        results: [],
        copyText: "",
        code: "unauthorized",
      },
      401
    );
  }

  const authContext = resolveSearchAuthContext(userId, body.current_credit);
  const currentCredit = authContext.currentCredit;

  authDebugInfo("api-places-search", {
    user_id: userId,
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
      console.error("search_requests insert error:", {
        code: pendingError?.code,
        message: pendingError?.message,
        details: pendingError?.details,
        hint: pendingError?.hint,
      });
      throw new Error("検索履歴の作成に失敗しました");
    }

    searchRequestId = pendingRequest.id as string;
    const requestId = searchRequestId;

    const center = await geocodePrefecture(prefecture);
    const query = buildSearchQuery(keyword1, keyword2 ?? undefined, prefecture);
    const excluded = await getExcludedPlaceIds(userId);
    const searcher = createIncrementalPlacesSearcher({
      query,
      center,
      excludedPlaceIds: excluded,
    });

    const savedResults: PlaceSearchResult[] = [];
    const seenPlaceIds = new Set<string>();
    let fetchedCount = 0;
    let saveFailedCount = 0;
    let saveFailed = false;

    while (savedResults.length < MAX_RESULTS) {
      const dbSavedIds = await getSavedPlaceIdsForRequest(supabase, requestId);
      const runtimeExcluded = new Set([
        ...seenPlaceIds,
        ...dbSavedIds,
      ]);

      const batchCandidates = await searcher.fetchNextBatch(
        SEARCH_BATCH_SIZE,
        runtimeExcluded
      );

      if (batchCandidates.length === 0) {
        break;
      }

      fetchedCount += batchCandidates.length;

      const toSaveCandidates = batchCandidates.filter(
        (place) =>
          !dbSavedIds.has(place.placeId) && !seenPlaceIds.has(place.placeId)
      );
      const duplicates = batchCandidates.length - toSaveCandidates.length;

      for (const place of batchCandidates) {
        seenPlaceIds.add(place.placeId);
      }

      if (toSaveCandidates.length === 0) {
        logSearchLoop({
          fetched: batchCandidates.length,
          saved: 0,
          duplicates,
          total_saved: savedResults.length,
        });
        continue;
      }

      const remainingSlots = MAX_RESULTS - savedResults.length;
      const candidatesToProcess = toSaveCandidates.slice(0, remainingSlots);

      const detailsList = await Promise.all(
        candidatesToProcess.map((place) => getPlaceDetails(place.placeId))
      );
      const batchResults = detailsList.map(toPlaceSearchResult);

      const resultRows = batchResults
        .map((r) => placeSearchResultToRow(r, requestId, userId))
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (resultRows.length < batchResults.length) {
        console.warn(
          "[search-persistence] place_id が無い店舗をスキップ:",
          batchResults.length - resultRows.length
        );
      }

      const insertOutcome = await insertSearchResultsBatch(supabase, resultRows);

      if (!insertOutcome.ok) {
        saveFailedCount += resultRows.length;
        saveFailed = true;
        logSearchLoop({
          fetched: batchCandidates.length,
          saved: 0,
          duplicates,
          total_saved: savedResults.length,
        });
        break;
      }

      savedResults.push(...batchResults);

      logSearchLoop({
        fetched: batchCandidates.length,
        saved: resultRows.length,
        duplicates,
        total_saved: savedResults.length,
      });

      if (savedResults.length >= MAX_RESULTS) {
        break;
      }
    }

    if (savedResults.length === 0) {
      await supabase
        .from("search_requests")
        .update({
          status: saveFailed ? "failed" : "completed",
          result_count: 0,
          latitude: center.lat,
          longitude: center.lng,
        })
        .eq("id", requestId);

      if (saveFailed) {
        return jsonResponse(
          {
            status: "error",
            message: SAVE_RESULTS_FAILED_MESSAGE,
            results: [],
            copyText: "",
            credit: currentCredit,
            fetchedCount,
            savedCount: 0,
            saveFailedCount,
            code: "save_failed",
          },
          500
        );
      }

      return jsonResponse({
        status: "no_results",
        message: NO_RESULTS_FOUND_MESSAGE,
        results: [],
        copyText: "",
        credit: currentCredit,
        fetchedCount: 0,
        savedCount: 0,
        saveFailedCount: 0,
        resultCount: 0,
        creditConsumed: 0,
      });
    }

    const savedCount = savedResults.length;
    const actualCreditCost = calculateCreditCost(savedCount);

    if (!hasEnoughCredit(currentCredit, actualCreditCost)) {
      await markSearchRequestFailed(requestId, savedCount);
      return jsonResponse(
        {
          status: "error",
          message: INSUFFICIENT_CREDIT_MESSAGE,
          results: savedResults,
          copyText: buildTsv(savedResults),
          credit: currentCredit,
          fetchedCount,
          savedCount,
          saveFailedCount,
          resultCount: savedCount,
          code: "insufficient_credit",
        },
        402
      );
    }

    let creditAfter: number;
    let creditBeforeConsume: number | undefined;
    try {
      const consumeResult = await consumeDashboardCredits({
        userId,
        amount: actualCreditCost,
        resultCount: savedCount,
        externalRequestId: requestId,
      });
      creditAfter = consumeResult.credit;
      creditBeforeConsume = consumeResult.creditBefore;
    } catch (consumeErr) {
      authDebugError(
        "api-places-search",
        { failure: "dashboard_supabase_consume", user_id: userId },
        consumeErr
      );
      await markSearchRequestFailed(requestId, savedCount);

      if (
        consumeErr instanceof DashboardCreditsError &&
        consumeErr.code === "insufficient_credit"
      ) {
        return jsonResponse(
          {
            status: "error",
            message: consumeErr.message,
            results: savedResults,
            copyText: buildTsv(savedResults),
            credit: currentCredit,
            fetchedCount,
            savedCount,
            saveFailedCount,
            resultCount: savedCount,
            code: "insufficient_credit",
          },
          402
        );
      }

      const detail =
        consumeErr instanceof DashboardCreditsError
          ? consumeErr.message
          : CREDIT_CONSUME_FAILED_MESSAGE;
      return jsonResponse(
        {
          status: "error",
          message: detail,
          results: savedResults,
          copyText: buildTsv(savedResults),
          credit: currentCredit,
          fetchedCount,
          savedCount,
          saveFailedCount,
          resultCount: savedCount,
          code: "consume_failed",
        },
        500
      );
    }

    const copyText = buildTsv(savedResults);
    const saveWarnings: string[] = [];

    if (saveFailed) {
      await markSearchRequestFailed(requestId, savedCount);
      saveWarnings.push(SAVE_RESULTS_FAILED_MESSAGE);
    } else {
      const newPlaceIds = savedResults.map((r) => r.placeId);
      const excludedRows = newPlaceIds.map((placeId) => ({
        user_id: userId,
        place_id: placeId,
        first_seen_search_request_id: requestId,
      }));

      const { error: excludedError } = await supabase
        .from("excluded_places")
        .upsert(excludedRows, { onConflict: "user_id,place_id" });

      if (excludedError) {
        logSupabasePersistenceError(
          "excluded_places upsert error",
          excludedError,
          { rowCount: excludedRows.length, sampleRow: excludedRows[0] }
        );
      }

      const completeError = await completeSearchRequest(supabase, requestId, {
        resultCount: savedCount,
        latitude: center.lat,
        longitude: center.lng,
      });

      if (completeError) {
        saveWarnings.push("検索履歴の更新に失敗しました。");
      }
    }

    const message = buildSuccessMessage({
      fetchedCount,
      savedCount,
      saveFailedCount,
      creditConsumed: actualCreditCost,
      creditAfter,
    });

    return jsonResponse({
      status: "success",
      message,
      results: savedResults,
      copyText,
      credit: creditAfter,
      creditBefore: creditBeforeConsume,
      creditAfter,
      fetchedCount,
      savedCount,
      saveFailedCount,
      resultCount: savedCount,
      creditConsumed: actualCreditCost,
      saveWarning: saveWarnings.length > 0 ? saveWarnings.join(" ") : null,
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
