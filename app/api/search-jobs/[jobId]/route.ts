import { NextRequest, NextResponse } from "next/server";
import { TOKEN_AUTH_EXPIRED_MESSAGE } from "@/lib/constants";
import {
  DashboardCreditsError,
  getAccessTokenFromRequest,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";
import { mapSearchResultRow } from "@/lib/searchResults";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTsv } from "@/lib/tsv";
import type { PlaceSearchResult, SearchJobResponse } from "@/lib/types";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;

  const accessToken = getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: TOKEN_AUTH_EXPIRED_MESSAGE },
      { status: 401 }
    );
  }

  let verifyResult;
  try {
    verifyResult = await verifyToolAccessToken(accessToken);
  } catch (err) {
    const message =
      err instanceof DashboardCreditsError
        ? err.message
        : TOKEN_AUTH_EXPIRED_MESSAGE;
    return NextResponse.json(
      { error: message },
      { status: err instanceof DashboardCreditsError ? err.status : 401 }
    );
  }

  const userId = verifyResult.user.id;
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
  const creditCost = verifyResult.tool.credit_cost;

  let message: string | undefined;
  if (status === "completed") {
    message = `${savedCount}件の営業リストを作成しました（${creditCost} Credit消費）`;
  } else if (status === "no_results") {
    message = "この検索範囲では新しい検索結果がありません。";
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
    errorMessage: (job.error_message as string) ?? undefined,
  };

  return NextResponse.json(body);
}
