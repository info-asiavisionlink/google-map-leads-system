import { NextRequest, NextResponse } from "next/server";
import {
  calculateCreditCost,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import { getDashboardUserCredit } from "@/lib/dashboardCredits";
import { mapSearchResultRow } from "@/lib/searchResults";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTsv } from "@/lib/tsv";
import type { PlaceSearchResult, SearchJobResponse } from "@/lib/types";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function extractUserId(request: NextRequest): string | null {
  const headerUserId = request.headers.get("x-user-id")?.trim();
  return headerUserId || null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;

  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: USER_INFO_MISSING_MESSAGE },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: job, error: jobError } = await supabase
    .from("search_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
  }

  const searchRequestId = job.search_request_id as string | null;
  let results: PlaceSearchResult[] = [];

  if (searchRequestId) {
    const { data: rows, error: resultsError } = await supabase
      .from("search_results")
      .select("*")
      .eq("search_request_id", searchRequestId)
      .order("created_at", { ascending: true });

    if (resultsError) {
      console.error("search_results 取得エラー:", resultsError);
    } else {
      results = (rows ?? []).map(mapSearchResultRow);
    }
  }

  const status = job.status as SearchJobResponse["status"];
  const savedCount = (job.saved_count as number) ?? results.length;

  let creditAfter: number | null = null;
  if (status === "completed") {
    try {
      creditAfter = await getDashboardUserCredit(userId);
    } catch {
      creditAfter = null;
    }
  }

  const creditConsumed =
    status === "completed" ? calculateCreditCost(savedCount) : 0;

  let message: string | undefined;
  if (status === "completed") {
    message = [
      `取得件数: ${savedCount}件`,
      `消費クレジット: ${creditConsumed}`,
      creditAfter != null
        ? `残クレジット: ${creditAfter.toLocaleString("ja-JP")}`
        : "",
    ]
      .filter(Boolean)
      .join(" / ");
  } else if (status === "no_results") {
    message = "この条件では新規店舗が見つかりませんでした。";
  } else if (status === "failed") {
    message = (job.error_message as string) ?? "検索中にエラーが発生しました";
  }

  const body: SearchJobResponse = {
    jobId,
    searchRequestId: searchRequestId ?? undefined,
    status,
    currentStep: (job.current_step as string) ?? status,
    fetchedCount: (job.fetched_count as number) ?? 0,
    savedCount,
    targetCount: (job.target_count as number) ?? 200,
    results,
    copyText: buildTsv(results),
    message,
    credit: creditAfter,
    creditConsumed,
    errorMessage: (job.error_message as string) ?? undefined,
  };

  return NextResponse.json(body);
}
