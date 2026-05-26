import { NextRequest, NextResponse } from "next/server";
import { authDebugError, authDebugInfo } from "@/lib/authDebug";
import {
  API_ERROR_MESSAGE,
  calculateCreditCost,
  CREDIT_CONSUME_FAILED_MESSAGE,
  EXHAUSTED_NO_NEW_RESULTS_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
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
  geocodePrefecture,
  getPlaceDetails,
  toPlaceSearchResult,
  type TextSearchPlace,
} from "@/lib/googleMaps";
import { getMaxSearchRadiusKm } from "@/lib/prefectureSearchRadius";
import { PREFECTURES } from "@/lib/prefectures";
import {
  extractSearchUserId,
  resolveSearchAuthContext,
  type SearchAuthBody,
} from "@/lib/searchAuth";
import {
  loadSearchProgressRecord,
  progressRowToSpiralPosition,
  upsertSearchProgress,
} from "@/lib/searchProgress";
import {
  createSpiralSearcher,
  FIXED_SEARCH_RADIUS_M,
} from "@/lib/spiralSearch";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  completeSearchRequest,
  getPreviouslySavedPlaceIdsForUser,
  insertSearchResultsBatch,
  logSearchResultsSaveFailure,
  logSupabasePersistenceError,
  placeSearchResultToRow,
} from "@/lib/searchPersistence";
import { buildTsv } from "@/lib/tsv";
import type { PlaceSearchResult, SearchApiResponse } from "@/lib/types";

/** 1回の検索ボタンで目指す新規保存件数 */
const TARGET_RESULTS = MAX_RESULTS;
/** 内部バッチサイズ（レスポンスはループ完了後にまとめて返す） */
const BATCH_SIZE = SEARCH_BATCH_SIZE;

/** 長時間の検索ループ用（デプロイ環境の上限に合わせて調整） */
export const maxDuration = 300;

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
  resultCount: number,
  params?: { latitude?: number; longitude?: number; radiusM?: number }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("search_requests")
    .update({
      status: "failed",
      result_count: resultCount,
      ...(params?.latitude != null ? { latitude: params.latitude } : {}),
      ...(params?.longitude != null ? { longitude: params.longitude } : {}),
      ...(params?.radiusM != null ? { radius_m: params.radiusM } : {}),
    })
    .eq("id", searchRequestId);
}

function logSearchLoop(meta: {
  saved: number;
  total_saved: number;
  step: number;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[search-loop]", meta);
}

function buildSuccessMessage(params: {
  savedCount: number;
  creditConsumed: number;
  creditAfter: number;
}): string {
  return [
    `取得件数: ${params.savedCount}件`,
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

  const prefecture = resolvePrefecture(body);
  const keyword1 = body.keyword1!.trim();
  const keyword2 = body.keyword2?.trim() || null;

  const supabase = getSupabaseAdmin();
  const progressRecord = await loadSearchProgressRecord(supabase, {
    userId,
    area: prefecture,
    keyword1,
    keyword2,
  });

  if (progressRecord?.is_exhausted) {
    return jsonResponse({
      status: "no_results",
      message: EXHAUSTED_NO_NEW_RESULTS_MESSAGE,
      results: [],
      copyText: "",
      credit: currentCredit,
      fetchedCount: 0,
      savedCount: 0,
      saveFailedCount: 0,
      duplicateExclusionCount: 0,
      creditConsumed: 0,
    });
  }

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

  let searchRequestId: string | null = null;

  try {
    const center = await geocodePrefecture(prefecture);
    const maxRadiusKm = getMaxSearchRadiusKm(prefecture);
    const startPosition = progressRowToSpiralPosition(progressRecord, center);

    const { data: pendingRequest, error: pendingError } = await supabase
      .from("search_requests")
      .insert({
        user_id: userId,
        area: prefecture,
        keyword1,
        keyword2,
        radius_m: FIXED_SEARCH_RADIUS_M,
        latitude: startPosition.lastLatitude,
        longitude: startPosition.lastLongitude,
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

    const query = buildSearchQuery(keyword1, keyword2 ?? undefined, prefecture);
    const excludedPlaceIds = await getExcludedPlaceIds(userId);
    const previouslySavedPlaceIds =
      await getPreviouslySavedPlaceIdsForUser(supabase, userId);

    const searchExcludedPlaceIds = new Set([
      ...excludedPlaceIds,
      ...previouslySavedPlaceIds,
    ]);

    const searcher = createSpiralSearcher({
      query,
      center,
      maxExplorationRadiusKm: maxRadiusKm,
      startPosition,
      excludedPlaceIds: searchExcludedPlaceIds,
    });

    const savedResults: PlaceSearchResult[] = [];
    const seenPlaceIds = new Set<string>();
    let activeProgressId = progressRecord?.id;
    const lifetimeSavedBaseline = progressRecord?.total_saved_count ?? 0;
    let duplicateExclusionCount = 0;
    let saveFailed = false;

    function buildRuntimeExcluded(): Set<string> {
      return new Set([
        ...seenPlaceIds,
        ...previouslySavedPlaceIds,
        ...excludedPlaceIds,
      ]);
    }

    function isDuplicatePlaceId(placeId: string): boolean {
      return (
        previouslySavedPlaceIds.has(placeId) ||
        seenPlaceIds.has(placeId) ||
        excludedPlaceIds.has(placeId)
      );
    }

    function filterNewPlaces(batch: TextSearchPlace[]): TextSearchPlace[] {
      const unique: TextSearchPlace[] = [];
      for (const place of batch) {
        const placeId = place.placeId;
        if (!placeId) continue;

        if (isDuplicatePlaceId(placeId)) {
          duplicateExclusionCount++;
          seenPlaceIds.add(placeId);
          continue;
        }

        seenPlaceIds.add(placeId);
        unique.push(place);
      }
      return unique;
    }

    // 50件ずつ取得・保存し、新規200件（または終了条件）まで続けてから1回だけレスポンス
    while (savedResults.length < TARGET_RESULTS) {
      const batchCandidates = await searcher.fetchNextBatch(
        BATCH_SIZE,
        buildRuntimeExcluded()
      );

      if (batchCandidates.length === 0) {
        if (searcher.isExhausted()) {
          break;
        }
        continue;
      }

      const newPlaces = filterNewPlaces(batchCandidates);

      if (newPlaces.length === 0) {
        logSearchLoop({
          saved: 0,
          total_saved: savedResults.length,
          step: searcher.getPosition().currentStep,
        });
        if (searcher.isExhausted()) {
          break;
        }
        continue;
      }

      const remainingSlots = TARGET_RESULTS - savedResults.length;
      const candidatesToProcess = newPlaces.slice(0, remainingSlots);

      const detailsList = await Promise.all(
        candidatesToProcess.map((place) => getPlaceDetails(place.placeId))
      );
      const batchResults = detailsList.map(toPlaceSearchResult);

      const resultRows = batchResults
        .map((r) => placeSearchResultToRow(r, requestId, userId))
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const insertOutcome = await insertSearchResultsBatch(supabase, resultRows);

      if (!insertOutcome.ok) {
        saveFailed = true;
        logSearchResultsSaveFailure(insertOutcome.error, {
          attemptedCount: resultRows.length,
          sampleRow: resultRows[0] ?? null,
          duplicateExclusionCount,
          previouslySavedPlaceIdCount: previouslySavedPlaceIds.size,
        });
        break;
      }

      for (const row of resultRows) {
        previouslySavedPlaceIds.add(row.place_id);
        seenPlaceIds.add(row.place_id);
        searchExcludedPlaceIds.add(row.place_id);
      }

      savedResults.push(...batchResults);

      const positionAfterSave = searcher.getPosition();
      await upsertSearchProgress(supabase, {
        userId,
        area: prefecture,
        keyword1,
        keyword2,
        position: positionAfterSave,
        totalSavedCount: lifetimeSavedBaseline + savedResults.length,
        isExhausted: false,
        progressId: activeProgressId,
      });
      if (!activeProgressId) {
        const reloaded = await loadSearchProgressRecord(supabase, {
          userId,
          area: prefecture,
          keyword1,
          keyword2,
        });
        activeProgressId = reloaded?.id;
      }

      logSearchLoop({
        saved: resultRows.length,
        total_saved: savedResults.length,
        step: positionAfterSave.currentStep,
      });

      if (savedResults.length >= TARGET_RESULTS) {
        break;
      }
    }

    const finalPosition = searcher.getPosition();
    const isRegionExhausted =
      savedResults.length === 0 && searcher.isExhausted();

    await upsertSearchProgress(supabase, {
      userId,
      area: prefecture,
      keyword1,
      keyword2,
      position: finalPosition,
      totalSavedCount: lifetimeSavedBaseline + savedResults.length,
      isExhausted: isRegionExhausted,
      progressId: activeProgressId,
    });

    const requestMeta = {
      latitude: finalPosition.lastLatitude,
      longitude: finalPosition.lastLongitude,
      radiusM: FIXED_SEARCH_RADIUS_M,
    };

    if (savedResults.length === 0) {
      const noResultMessage = isRegionExhausted
        ? EXHAUSTED_NO_NEW_RESULTS_MESSAGE
        : NO_RESULTS_FOUND_MESSAGE;

      await supabase
        .from("search_requests")
        .update({
          status: saveFailed ? "failed" : "no_results",
          result_count: 0,
          ...requestMeta,
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
            fetchedCount: 0,
            savedCount: 0,
            creditConsumed: 0,
            code: "save_failed",
          },
          500
        );
      }

      return jsonResponse({
        status: "no_results",
        message: noResultMessage,
        results: [],
        copyText: "",
        credit: currentCredit,
        fetchedCount: 0,
        savedCount: 0,
        creditConsumed: 0,
      });
    }

    const savedCount = savedResults.length;
    const actualCreditCost = calculateCreditCost(savedCount);

    if (!hasEnoughCredit(currentCredit, actualCreditCost)) {
      await markSearchRequestFailed(requestId, savedCount, requestMeta);
      return jsonResponse(
        {
          status: "error",
          message: INSUFFICIENT_CREDIT_MESSAGE,
          results: savedResults,
          copyText: buildTsv(savedResults),
          credit: currentCredit,
          fetchedCount: savedCount,
          savedCount,
          resultCount: savedCount,
          creditConsumed: actualCreditCost,
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
      await markSearchRequestFailed(requestId, savedCount, requestMeta);

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
            fetchedCount: savedCount,
            savedCount,
            resultCount: savedCount,
            creditConsumed: actualCreditCost,
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
          fetchedCount: savedCount,
          savedCount,
          resultCount: savedCount,
          creditConsumed: actualCreditCost,
          code: "consume_failed",
        },
        500
      );
    }

    const copyText = buildTsv(savedResults);
    const saveWarnings: string[] = [];

    if (saveFailed) {
      await markSearchRequestFailed(requestId, savedCount, requestMeta);
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
        latitude: requestMeta.latitude,
        longitude: requestMeta.longitude,
        radiusM: requestMeta.radiusM,
      });

      if (completeError) {
        saveWarnings.push("検索履歴の更新に失敗しました。");
      }
    }

    const message = buildSuccessMessage({
      savedCount,
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
      fetchedCount: savedCount,
      savedCount,
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
