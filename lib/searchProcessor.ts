import {
  CREDIT_CONSUME_FAILED_MESSAGE,
  MAX_RESULTS,
  NO_NEW_RESULTS_MESSAGE,
} from "@/lib/constants";
import { consumeDashboardCredits, DashboardCreditsError } from "@/lib/dashboardCredits";
import {
  geocodeArea,
  getPlaceDetails,
  searchPlaces,
  toPlaceSearchResult,
} from "@/lib/googleMaps";
import { buildResultInsertRow } from "@/lib/searchResults";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SearchJobStatus } from "@/lib/types";

const DETAIL_BATCH_SIZE = 8;

type SearchJobRow = {
  id: string;
  user_id: string;
  search_request_id: string | null;
  area: string;
  keyword1: string;
  keyword2: string | null;
  radius_m: number;
  access_token: string;
  credit_cost: number;
};

function buildSearchQuery(keyword1: string, keyword2?: string | null): string {
  const k2 = keyword2?.trim();
  return k2 ? `${keyword1} ${k2}` : keyword1;
}

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

async function getExcludedPlaceIds(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("excluded_places")
    .select("place_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error("除外リストの取得に失敗しました");
  }

  return new Set((data ?? []).map((row) => row.place_id as string));
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
  const accessToken = row.access_token;

  try {
    await updateJob(jobId, {
      status: "scanning" as SearchJobStatus,
      current_step: "scanning",
    });

    const geocode = await geocodeArea(row.area);
    const query = buildSearchQuery(row.keyword1, row.keyword2);

    await supabase
      .from("search_requests")
      .update({
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        status: "processing",
      })
      .eq("id", searchRequestId);

    await updateJob(jobId, {
      status: "fetching" as SearchJobStatus,
      current_step: "fetching",
    });

    const candidates = await searchPlaces({
      query,
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      radiusM: row.radius_m,
    });

    await updateJob(jobId, { fetched_count: candidates.length });

    await updateJob(jobId, {
      status: "deduping" as SearchJobStatus,
      current_step: "deduping",
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
      await supabase
        .from("search_requests")
        .update({ status: "no_results", result_count: 0 })
        .eq("id", searchRequestId);

      await updateJob(jobId, {
        status: "no_results" as SearchJobStatus,
        current_step: "completed",
        saved_count: 0,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await updateJob(jobId, {
      status: "details" as SearchJobStatus,
      current_step: "details",
      target_count: newPlaceIds.length,
    });

    let savedCount = 0;

    for (let i = 0; i < newPlaceIds.length; i += DETAIL_BATCH_SIZE) {
      const batch = newPlaceIds.slice(i, i + DETAIL_BATCH_SIZE);
      const detailsList = await Promise.all(
        batch.map((placeId) => getPlaceDetails(placeId))
      );

      const resultRows = detailsList.map((d) =>
        buildResultInsertRow(searchRequestId, userId, toPlaceSearchResult(d))
      );

      const { error: insertError } = await supabase
        .from("search_results")
        .insert(resultRows);

      if (insertError) {
        throw new Error("検索結果の保存に失敗しました");
      }

      savedCount += resultRows.length;

      await updateJob(jobId, {
        status: "saving" as SearchJobStatus,
        current_step: "saving",
        saved_count: savedCount,
      });
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
      throw new Error("除外リストの保存に失敗しました");
    }

    try {
      await consumeDashboardCredits(accessToken, searchRequestId);
    } catch (consumeErr) {
      console.error("クレジット消費APIエラー:", consumeErr);
      const detail =
        consumeErr instanceof DashboardCreditsError
          ? consumeErr.message
          : CREDIT_CONSUME_FAILED_MESSAGE;

      await supabase
        .from("search_requests")
        .update({ status: "failed", result_count: savedCount })
        .eq("id", searchRequestId);

      await updateJob(jobId, {
        status: "failed" as SearchJobStatus,
        error_message: detail,
        saved_count: savedCount,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await supabase
      .from("search_requests")
      .update({ status: "completed", result_count: savedCount })
      .eq("id", searchRequestId);

    await updateJob(jobId, {
      status: "completed" as SearchJobStatus,
      current_step: "completed",
      saved_count: savedCount,
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
  } finally {
    await supabase
      .from("search_jobs")
      .update({ access_token: "" })
      .eq("id", jobId);
  }
}

export { NO_NEW_RESULTS_MESSAGE };
