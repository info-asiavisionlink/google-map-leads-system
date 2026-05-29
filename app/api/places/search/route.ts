import { after, NextRequest, NextResponse } from "next/server";
import { authDebugError, authDebugInfo } from "@/lib/authDebug";
import {
  EXHAUSTED_NO_NEW_RESULTS_MESSAGE,
  INSUFFICIENT_CREDIT_MESSAGE,
  MIN_CREDIT_TO_SEARCH,
  SEARCH_TARGET_RESULTS,
  USER_INFO_MISSING_MESSAGE,
} from "@/lib/constants";
import { hasEnoughCredit } from "@/lib/dashboardCredits";
import { PREFECTURES } from "@/lib/prefectures";
import { processSearchJob } from "@/lib/searchProcessor";
import {
  extractSearchUserId,
  resolveSearchAuthContext,
  type SearchAuthBody,
} from "@/lib/searchAuth";
import { loadSearchProgressRecord } from "@/lib/searchProgress";
import { FIXED_SEARCH_RADIUS_M } from "@/lib/spiralSearch";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SearchApiResponse, SearchStartResponse } from "@/lib/types";

export const maxDuration = 300;

type SearchBody = SearchAuthBody & {
  area?: string;
  prefecture?: string;
  keyword1?: string;
  keyword2?: string;
};

function jsonResponse(
  body: SearchApiResponse | SearchStartResponse,
  status = 200
) {
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

  const { data: searchRequest, error: requestInsertError } = await supabase
    .from("search_requests")
    .insert({
      user_id: userId,
      area: prefecture,
      keyword1,
      keyword2,
      radius_m: FIXED_SEARCH_RADIUS_M,
      result_count: 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (requestInsertError || !searchRequest) {
    console.error("search_requests 保存エラー:", requestInsertError);
    return jsonResponse(
      {
        status: "error",
        message: "検索の開始に失敗しました",
        results: [],
        copyText: "",
        code: "api_error",
      },
      500
    );
  }

  const searchRequestId = searchRequest.id as string;

  const { data: job, error: jobError } = await supabase
    .from("search_jobs")
    .insert({
      user_id: userId,
      search_request_id: searchRequestId,
      area: prefecture,
      keyword1,
      keyword2,
      radius_m: FIXED_SEARCH_RADIUS_M,
      status: "pending",
      current_step: "scanning",
      fetched_count: 0,
      saved_count: 0,
      target_count: SEARCH_TARGET_RESULTS,
      credit_cost: 0,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("search_jobs 保存エラー:", jobError);
    return jsonResponse(
      {
        status: "error",
        message: "検索ジョブの作成に失敗しました",
        results: [],
        copyText: "",
        code: "api_error",
      },
      500
    );
  }

  const jobId = job.id as string;

  after(async () => {
    await processSearchJob(jobId);
  });

  return jsonResponse(
    {
      status: "processing",
      message: "検索を開始しました。店舗情報を取得しています…",
      results: [],
      copyText: "",
      jobId,
      credit: currentCredit,
    },
    202
  );
}
