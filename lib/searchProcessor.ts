import {
  calculateCreditCost,
  CREDIT_CONSUME_FAILED_MESSAGE,
  SAVE_RESULTS_FAILED_MESSAGE,
  SEARCH_BATCH_SIZE,
  SEARCH_TARGET_RESULTS,
} from "@/lib/constants";
import {
  consumeDashboardCredits,
  DashboardCreditsError,
  getDashboardUserCredit,
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
import {
  loadSearchProgressRecord,
  progressRowToSpiralPosition,
  upsertSearchProgress,
} from "@/lib/searchProgress";
import {
  completeSearchRequest,
  getPreviouslySavedPlaceIdsForUser,
  insertSearchResultsBatch,
  logSearchResultsSaveFailure,
  logSupabasePersistenceError,
  placeSearchResultToRow,
} from "@/lib/searchPersistence";
import {
  createSpiralSearcher,
  FIXED_SEARCH_RADIUS_M,
} from "@/lib/spiralSearch";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PlaceSearchResult, SearchJobStatus, SearchStopReason } from "@/lib/types";

const TARGET_RESULTS = SEARCH_TARGET_RESULTS;
const BATCH_SIZE = SEARCH_BATCH_SIZE;
const TIMEOUT_NEAR_LIMIT_MS = 270_000;

type SearchJobRow = {
  id: string;
  user_id: string;
  search_request_id: string | null;
  area: string;
  keyword1: string;
  keyword2: string | null;
};

async function updateJob(
  jobId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("search_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    console.error("search_jobs 更新エラー:", error);
  }
}

function mapStepFromSpiral(spiralStep: number, phase: "fetch" | "details" | "save"): string {
  if (phase === "save") return "saving";
  if (phase === "details") return "details";
  if (spiralStep > 0) return "fetching";
  return "scanning";
}

export async function processSearchJob(jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: job, error: jobError } = await supabase
    .from("search_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("search_jobs 取得エラー:", jobError);
    return;
  }

  const row = job as SearchJobRow;
  if (!row.search_request_id) {
    await updateJob(jobId, {
      status: "failed",
      error_message: "検索リクエストIDがありません",
    });
    return;
  }

  const searchRequestId = row.search_request_id;
  const userId = row.user_id;
  const prefecture = row.area;
  const keyword1 = row.keyword1;
  const keyword2 = row.keyword2;

  try {
    await updateJob(jobId, {
      status: "scanning" as SearchJobStatus,
      current_step: "scanning",
      target_count: TARGET_RESULTS,
    });

    const progressRecord = await loadSearchProgressRecord(supabase, {
      userId,
      area: prefecture,
      keyword1,
      keyword2,
    });

    const center = await geocodePrefecture(prefecture);
    const maxRadiusKm = getMaxSearchRadiusKm(prefecture);
    const startPosition = progressRowToSpiralPosition(progressRecord, center);

    await supabase
      .from("search_requests")
      .update({
        latitude: startPosition.lastLatitude,
        longitude: startPosition.lastLongitude,
        radius_m: FIXED_SEARCH_RADIUS_M,
        status: "processing",
      })
      .eq("id", searchRequestId);

    const query = buildSearchQuery(keyword1, keyword2 ?? undefined, prefecture);

    const { data: excludedRows } = await supabase
      .from("excluded_places")
      .select("place_id")
      .eq("user_id", userId);
    const excludedPlaceIds = new Set(
      (excludedRows ?? []).map((r) => r.place_id as string)
    );
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
    const activeProgressId = progressRecord?.id;
    const lifetimeSavedBaseline = progressRecord?.total_saved_count ?? 0;
    let fetchedCount = 0;
    let stopReason: SearchStopReason | null = null;
    let saveFailed = false;
    const searchStartedAt = Date.now();

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
          seenPlaceIds.add(placeId);
          continue;
        }
        seenPlaceIds.add(placeId);
        unique.push(place);
      }
      return unique;
    }

    while (savedResults.length < TARGET_RESULTS) {
      if (Date.now() - searchStartedAt >= TIMEOUT_NEAR_LIMIT_MS) {
        stopReason = "timeout_near_limit";
        break;
      }

      const batchFetchLimit = Math.min(
        BATCH_SIZE,
        TARGET_RESULTS - savedResults.length
      );

      await updateJob(jobId, {
        status: "fetching" as SearchJobStatus,
        current_step: mapStepFromSpiral(
          searcher.getPosition().currentStep,
          "fetch"
        ),
      });

      const batchCandidates = await searcher.fetchNextBatch(
        batchFetchLimit,
        buildRuntimeExcluded()
      );
      fetchedCount += batchCandidates.length;

      await updateJob(jobId, {
        fetched_count: fetchedCount,
        current_step: "deduping",
      });

      if (batchCandidates.length === 0) {
        if (searcher.isExhausted()) {
          stopReason = "prefecture_fully_scanned";
          break;
        }
        continue;
      }

      const newPlaces = filterNewPlaces(batchCandidates);
      if (newPlaces.length === 0) {
        if (searcher.isExhausted()) {
          stopReason = "prefecture_fully_scanned";
          break;
        }
        continue;
      }

      const remainingSlots = TARGET_RESULTS - savedResults.length;
      const candidatesToProcess = newPlaces.slice(0, remainingSlots);

      await updateJob(jobId, {
        status: "details" as SearchJobStatus,
        current_step: "details",
      });

      const detailsList = await Promise.all(
        candidatesToProcess.map((place) => getPlaceDetails(place.placeId))
      );
      const batchResults = detailsList.map(toPlaceSearchResult);

      const resultRows = batchResults
        .map((r) => placeSearchResultToRow(r, searchRequestId, userId))
        .filter((row): row is NonNullable<typeof row> => row !== null);

      await updateJob(jobId, {
        status: "saving" as SearchJobStatus,
        current_step: "saving",
      });

      const insertOutcome = await insertSearchResultsBatch(supabase, resultRows);

      if (!insertOutcome.ok) {
        saveFailed = true;
        stopReason = "save_error";
        logSearchResultsSaveFailure(insertOutcome.error, {
          attemptedCount: resultRows.length,
          sampleRow: resultRows[0] ?? null,
          duplicateExclusionCount: 0,
          previouslySavedPlaceIdCount: previouslySavedPlaceIds.size,
        });
        break;
      }

      for (const r of resultRows) {
        previouslySavedPlaceIds.add(r.place_id);
        seenPlaceIds.add(r.place_id);
        searchExcludedPlaceIds.add(r.place_id);
      }

      savedResults.push(...batchResults);

      await updateJob(jobId, {
        saved_count: savedResults.length,
        fetched_count: fetchedCount,
      });

      await upsertSearchProgress(supabase, {
        userId,
        area: prefecture,
        keyword1,
        keyword2,
        position: searcher.getPosition(),
        totalSavedCount: lifetimeSavedBaseline + savedResults.length,
        isExhausted: false,
        progressId: activeProgressId,
      });

      if (savedResults.length >= TARGET_RESULTS) {
        stopReason = "reached_target";
        break;
      }
    }

    const finalPosition = searcher.getPosition();
    const isRegionExhausted =
      stopReason === "prefecture_fully_scanned" && searcher.isExhausted();

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
      await supabase
        .from("search_requests")
        .update({
          status: saveFailed ? "failed" : "no_results",
          result_count: 0,
          latitude: requestMeta.latitude,
          longitude: requestMeta.longitude,
          radius_m: requestMeta.radiusM,
        })
        .eq("id", searchRequestId);

      await updateJob(jobId, {
        status: (saveFailed ? "failed" : "no_results") as SearchJobStatus,
        current_step: "completed",
        saved_count: 0,
        fetched_count: fetchedCount,
        error_message: saveFailed ? SAVE_RESULTS_FAILED_MESSAGE : undefined,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const savedCount = savedResults.length;
    const actualCreditCost = calculateCreditCost(savedCount);

    let currentCredit: number;
    try {
      currentCredit = await getDashboardUserCredit(userId);
    } catch {
      currentCredit = 0;
    }

    if (!hasEnoughCredit(currentCredit, actualCreditCost)) {
      await supabase
        .from("search_requests")
        .update({
          status: "failed",
          result_count: savedCount,
          latitude: requestMeta.latitude,
          longitude: requestMeta.longitude,
          radius_m: requestMeta.radiusM,
        })
        .eq("id", searchRequestId);

      await updateJob(jobId, {
        status: "failed" as SearchJobStatus,
        error_message: "クレジットが不足しています",
        saved_count: savedCount,
        fetched_count: fetchedCount,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    try {
      await consumeDashboardCredits({
        userId,
        amount: actualCreditCost,
        resultCount: savedCount,
        externalRequestId: searchRequestId,
      });
    } catch (consumeErr) {
      const detail =
        consumeErr instanceof DashboardCreditsError
          ? consumeErr.message
          : CREDIT_CONSUME_FAILED_MESSAGE;

      await supabase
        .from("search_requests")
        .update({
          status: "failed",
          result_count: savedCount,
          latitude: requestMeta.latitude,
          longitude: requestMeta.longitude,
          radius_m: requestMeta.radiusM,
        })
        .eq("id", searchRequestId);

      await updateJob(jobId, {
        status: "failed" as SearchJobStatus,
        error_message: detail,
        saved_count: savedCount,
        fetched_count: fetchedCount,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    if (!saveFailed) {
      const newPlaceIds = savedResults.map((r) => r.placeId);
      const excludedRows = newPlaceIds.map((placeId) => ({
        user_id: userId,
        place_id: placeId,
        first_seen_search_request_id: searchRequestId,
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

      await completeSearchRequest(supabase, searchRequestId, {
        resultCount: savedCount,
        latitude: requestMeta.latitude,
        longitude: requestMeta.longitude,
        radiusM: requestMeta.radiusM,
      });
    }

    await updateJob(jobId, {
      status: "completed" as SearchJobStatus,
      current_step: "completed",
      saved_count: savedCount,
      fetched_count: fetchedCount,
      credit_consumed: true,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("processSearchJob エラー:", err);
    const message =
      err instanceof Error ? err.message : "検索処理中にエラーが発生しました";

    await supabase
      .from("search_requests")
      .update({ status: "failed" })
      .eq("id", searchRequestId);

    await updateJob(jobId, {
      status: "failed" as SearchJobStatus,
      error_message: message,
      completed_at: new Date().toISOString(),
    });
  }
}
