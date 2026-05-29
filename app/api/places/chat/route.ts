import { NextRequest, NextResponse } from "next/server";
import {
  AI_CHAT_CREDIT_COST,
  AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE,
  TOKEN_AUTH_EXPIRED_MESSAGE,
  WEBSITE_CACHE_TTL_MS,
} from "@/lib/constants";
import {
  consumeDashboardCredits,
  DashboardCreditsError,
  getAccessTokenFromRequest,
  getAiChatToolKey,
  hasEnoughCredit,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";
import { fetchWebsiteText } from "@/lib/fetchWebsiteText";
import { generatePlaceAnswer } from "@/lib/openai";
import { buildPlaceContextText, mapSearchResultRow } from "@/lib/searchResults";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PlaceChatApiResponse } from "@/lib/types";

type ChatBody = {
  place_id?: string;
  question?: string;
};

function jsonResponse(
  body: PlaceChatApiResponse,
  status = 200
): NextResponse<PlaceChatApiResponse> {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  let body: ChatBody;

  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return jsonResponse(
      { status: "error", message: "リクエスト形式が不正です" },
      400
    );
  }

  const placeId = body.place_id?.trim();
  const question = body.question?.trim();

  if (!placeId) {
    return jsonResponse(
      { status: "error", message: "place_id を指定してください" },
      400
    );
  }

  if (!question) {
    return jsonResponse(
      { status: "error", message: "質問を入力してください" },
      400
    );
  }

  const accessToken = getAccessTokenFromRequest(request);
  if (!accessToken) {
    return jsonResponse(
      {
        status: "error",
        message: TOKEN_AUTH_EXPIRED_MESSAGE,
        code: "unauthorized",
      },
      401
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
    return jsonResponse(
      {
        status: "error",
        message,
        code: "unauthorized",
      },
      err instanceof DashboardCreditsError ? err.status : 401
    );
  }

  const userId = verifyResult.user.id;
  const currentCredit = verifyResult.credit;

  if (!hasEnoughCredit(currentCredit, AI_CHAT_CREDIT_COST)) {
    return jsonResponse(
      {
        status: "error",
        message: AI_CHAT_INSUFFICIENT_CREDIT_MESSAGE,
        credit: currentCredit,
        code: "insufficient_credit",
      },
      402
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: placeRow, error: placeError } = await supabase
    .from("search_results")
    .select("*")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (placeError || !placeRow) {
    return jsonResponse(
      {
        status: "error",
        message: "店舗情報が見つかりません。検索結果から再度お試しください。",
      },
      404
    );
  }

  const place = mapSearchResultRow(placeRow);
  const mapContext = buildPlaceContextText(place);

  let websiteText = "";
  let usedWebsite = false;
  let websiteFetchFailed = false;

  if (place.websiteUrl) {
    const { data: cacheRow } = await supabase
      .from("place_website_cache")
      .select("*")
      .eq("place_id", placeId)
      .maybeSingle();

    const cacheValid =
      cacheRow &&
      cacheRow.website_url === place.websiteUrl &&
      cacheRow.fetched_at &&
      Date.now() - new Date(cacheRow.fetched_at as string).getTime() <
        WEBSITE_CACHE_TTL_MS;

    if (cacheValid && cacheRow.page_text) {
      websiteText = cacheRow.page_text as string;
      usedWebsite = websiteText.length > 0;
    } else {
      const fetched = await fetchWebsiteText(place.websiteUrl);
      if (fetched.ok && fetched.text) {
        websiteText = fetched.text;
        usedWebsite = true;
        await supabase.from("place_website_cache").upsert(
          {
            place_id: placeId,
            website_url: place.websiteUrl,
            page_text: fetched.text,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "place_id" }
        );
      } else {
        websiteFetchFailed = true;
      }
    }
  }

  let answer: string;
  try {
    answer = await generatePlaceAnswer({
      placeName: place.name,
      question,
      mapContext,
      websiteText: websiteText || undefined,
      websiteFetchFailed,
    });
  } catch (err) {
    console.error("OpenAI 回答生成エラー:", err);
    return jsonResponse(
      {
        status: "error",
        message: "AI回答の生成に失敗しました。時間をおいて再度お試しください。",
        code: "api_error",
      },
      500
    );
  }

  const { data: chatRow, error: chatInsertError } = await supabase
    .from("place_ai_chats")
    .insert({
      user_id: userId,
      place_id: placeId,
      search_result_id: placeRow.id,
      question,
      answer,
      credit_cost: AI_CHAT_CREDIT_COST,
      used_website: usedWebsite,
    })
    .select("id")
    .single();

  if (chatInsertError || !chatRow) {
    console.error("place_ai_chats 保存エラー:", chatInsertError);
    return jsonResponse(
      {
        status: "error",
        message: "チャット履歴の保存に失敗しました",
        code: "api_error",
      },
      500
    );
  }

  let creditAfter = currentCredit;
  try {
    const consumeResult = await consumeDashboardCredits(
      accessToken,
      chatRow.id as string,
      getAiChatToolKey()
    );
    creditAfter = consumeResult.credit;
  } catch (consumeErr) {
    console.error("AIチャット クレジット消費エラー:", consumeErr);
    await supabase.from("place_ai_chats").delete().eq("id", chatRow.id);
    const detail =
      consumeErr instanceof DashboardCreditsError
        ? consumeErr.message
        : "クレジットの消費に失敗しました";
    return jsonResponse(
      {
        status: "error",
        message: detail,
        credit: currentCredit,
        code: "api_error",
      },
      500
    );
  }

  let responseMessage = "回答を生成しました";
  if (websiteFetchFailed && place.websiteUrl) {
    responseMessage =
      "公式サイトの取得ができなかったため、保存済み店舗情報をもとに回答します";
  }

  return jsonResponse({
    status: "success",
    message: responseMessage,
    answer,
    credit: creditAfter,
    usedWebsite,
  });
}
