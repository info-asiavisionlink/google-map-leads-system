import { after, NextRequest, NextResponse } from "next/server";
import {
  INSUFFICIENT_CREDIT_MESSAGE,
  MAX_RESULTS,
  RADIUS_OPTIONS,
  TOKEN_AUTH_EXPIRED_MESSAGE,
} from "@/lib/constants";
import {
  DashboardCreditsError,
  hasEnoughCredit,
} from "@/lib/dashboardCredits";
import { processSearchJob } from "@/lib/searchProcessor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SearchApiResponse, SearchStartResponse } from "@/lib/types";

/** 1回の検索ボタンで目指す新規保存件数（100件で止めない・必ず200を目標） */
const TARGET_RESULTS = SEARCH_TARGET_RESULTS;

/** 内部バッチサイズ（レスポンスはループ完了後にまとめて返す） */
const BATCH_SIZE = SEARCH_BATCH_SIZE;

/** 長時間の検索ループ用（デプロイ環境の上限に合わせて調整） */
export const maxDuration = 300;

/** ループ停止の安全マージン（Vercel 300秒上限の手前・270秒超） */
const TIMEOUT_NEAR_LIMIT_MS = 270_000;

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

  const { data: searchRequest, error: requestInsertError } = await supabase
    .from("search_requests")
    .insert({
      user_id: userId,
      area,
      keyword1,
      keyword2,
      radius_m: radiusM,
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
      area,
      keyword1,
      keyword2,
      radius_m: radiusM,
      status: "pending",
      current_step: "scanning",
      fetched_count: 0,
      saved_count: 0,
      target_count: MAX_RESULTS,
      access_token: accessToken,
      credit_cost: creditCost,
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

  const response: SearchStartResponse = {
    jobId,
    searchRequestId,
    status: "processing",
    message: "検索を開始しました。店舗情報を取得しています…",
  };

  return jsonResponse(
    {
      status: "processing",
      message: response.message,
      results: [],
      copyText: "",
      jobId,
      credit: currentCredit,
    },
    202
  );
}
