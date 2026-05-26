import { NextRequest, NextResponse } from "next/server";
import { getAuthSupabaseAdmin } from "@/lib/authSupabase/server";
import {
  TOOL_USER_CREDIT_FETCH_FAILED_MESSAGE,
  TOOL_USER_MISMATCH_MESSAGE,
  TOOL_USER_NOT_FOUND_MESSAGE,
  TOOL_USER_QUERY_MISSING_MESSAGE,
  TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE,
} from "@/lib/constants";
import {
  logToolUserMapping,
  matchQueryWithProfile,
  parseRemainingCredit,
  profileRowToToolUser,
} from "@/lib/toolUserMapping";
import type {
  AuthProfileRow,
  ToolUserAuthErrorCode,
  ToolUserQuery,
  ToolUserVerifyApiResponse,
} from "@/lib/toolUser";

type VerifyBody = {
  user_id?: string;
  username?: string;
  email?: string;
  remaining_credit?: number | string;
};

function errorResponse(
  code: ToolUserAuthErrorCode,
  error: string,
  status: number
): NextResponse<ToolUserVerifyApiResponse> {
  return NextResponse.json({ ok: false, code, error }, { status });
}

function parseBody(body: VerifyBody): ToolUserQuery | { code: ToolUserAuthErrorCode; error: string } {
  const user_id = body.user_id?.trim() ?? "";
  const username = body.username?.trim() ?? "";
  const email = body.email?.trim() ?? "";

  let remaining_credit: number | null = null;
  if (typeof body.remaining_credit === "number") {
    remaining_credit = Number.isNaN(body.remaining_credit)
      ? null
      : body.remaining_credit;
  } else if (typeof body.remaining_credit === "string") {
    remaining_credit = parseRemainingCredit(body.remaining_credit);
  }

  if (!user_id) {
    return { code: "user_id_missing", error: "user_id が指定されていません" };
  }

  if (!username || !email || remaining_credit === null) {
    return { code: "query_missing", error: TOOL_USER_QUERY_MISSING_MESSAGE };
  }

  return { user_id, username, email, remaining_credit };
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ToolUserVerifyApiResponse>> {
  let body: VerifyBody;

  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return errorResponse("query_missing", TOOL_USER_QUERY_MISSING_MESSAGE, 400);
  }

  const parsed = parseBody(body);
  if ("code" in parsed) {
    return errorResponse(parsed.code, parsed.error, 400);
  }

  const query = parsed;

  logToolUserMapping({
    step: "verify_start",
    query_user_id: query.user_id,
    username: query.username,
    email: query.email,
    credit: query.remaining_credit,
  });

  let supabase;
  try {
    supabase = getAuthSupabaseAdmin();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE;
    logToolUserMapping({ step: "supabase_client_error", error: message });
    return errorResponse(
      "supabase_connection_failed",
      TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE,
      500
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, credit")
    .eq("id", query.user_id)
    .maybeSingle();

  if (error) {
    logToolUserMapping({
      step: "supabase_query_error",
      query_user_id: query.user_id,
      error: error.message,
    });
    return errorResponse(
      "supabase_connection_failed",
      TOOL_USER_SUPABASE_CONNECTION_FAILED_MESSAGE,
      500
    );
  }

  if (!data) {
    logToolUserMapping({
      step: "user_not_found",
      query_user_id: query.user_id,
    });
    return errorResponse("user_not_found", TOOL_USER_NOT_FOUND_MESSAGE, 404);
  }

  const row = data as AuthProfileRow;
  const user = profileRowToToolUser(row);

  if (!user) {
    logToolUserMapping({
      step: "credit_fetch_failed",
      query_user_id: query.user_id,
      supabase_user_id: row.id,
    });
    return errorResponse(
      "credit_fetch_failed",
      TOOL_USER_CREDIT_FETCH_FAILED_MESSAGE,
      500
    );
  }

  const matched = matchQueryWithProfile(query, user);

  if (!matched) {
    return errorResponse("mismatch", TOOL_USER_MISMATCH_MESSAGE, 403);
  }

  logToolUserMapping({
    step: "verify_success",
    query_user_id: query.user_id,
    supabase_user_id: user.id,
    username: user.username ?? "",
    email: user.email,
    credit: user.credit,
    matched: true,
  });

  return NextResponse.json({
    ok: true,
    user,
    matched: true,
  });
}
