import { NextRequest, NextResponse } from "next/server";
import {
  authDebugError,
  authDebugInfo,
  getAuthSystemApiUrlInfo,
  maskToken,
} from "@/lib/authDebug";
import { USER_INFO_MISSING_MESSAGE } from "@/lib/constants";
import {
  DashboardCreditsError,
  getAccessTokenFromRequest,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";

export async function GET(request: NextRequest) {
  const token = getAccessTokenFromRequest(request);
  const apiInfo = getAuthSystemApiUrlInfo();

  authDebugInfo("api-tools-verify", {
    route: "GET /api/tools/verify",
    AUTH_SYSTEM_API_URL: apiInfo.url ?? "(not configured)",
    env_source: apiInfo.source,
    authorization_header_exists: Boolean(token),
    token_exists: maskToken(token).token_exists,
    token_length: maskToken(token).token_length,
  });

  if (!token) {
    authDebugError("api-tools-verify", {
      failure: "missing_bearer_token",
      message: USER_INFO_MISSING_MESSAGE,
    });
    return NextResponse.json(
      { error: USER_INFO_MISSING_MESSAGE },
      { status: 401 }
    );
  }

  try {
    const result = await verifyToolAccessToken(token);
    authDebugInfo("api-tools-verify", {
      result: "success",
      user_id: result.user.id,
      remaining_credit: result.credit,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof DashboardCreditsError) {
      authDebugError("api-tools-verify", {
        result: "failed",
        status: err.status,
        code: err.code ?? "(none)",
        error_message: err.message,
      });
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }

    authDebugError("api-tools-verify", {
      result: "failed",
      error_message: USER_INFO_MISSING_MESSAGE,
    }, err);

    return NextResponse.json(
      { error: USER_INFO_MISSING_MESSAGE },
      { status: 500 }
    );
  }
}
