import { NextRequest, NextResponse } from "next/server";
import { TOKEN_AUTH_EXPIRED_MESSAGE } from "@/lib/constants";
import {
  DashboardCreditsError,
  getAccessTokenFromRequest,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";

export async function GET(request: NextRequest) {
  const token = getAccessTokenFromRequest(request);

  if (!token) {
    return NextResponse.json(
      { error: TOKEN_AUTH_EXPIRED_MESSAGE },
      { status: 401 }
    );
  }

  try {
    const result = await verifyToolAccessToken(token);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/tools/verify エラー:", err);
    if (err instanceof DashboardCreditsError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: TOKEN_AUTH_EXPIRED_MESSAGE },
      { status: 500 }
    );
  }
}
