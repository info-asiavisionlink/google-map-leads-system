import { NextRequest, NextResponse } from "next/server";
import { USER_INFO_MISSING_MESSAGE } from "@/lib/constants";
import {
  DashboardCreditsError,
  getAccessTokenFromRequest,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";

/** verify 結果からクレジット情報のみ返す（後方互換） */
export async function GET(request: NextRequest) {
  const token = getAccessTokenFromRequest(request);

  if (!token) {
    return NextResponse.json(
      { error: USER_INFO_MISSING_MESSAGE, credit: null },
      { status: 401 }
    );
  }

  try {
    const result = await verifyToolAccessToken(token);
    return NextResponse.json({
      credit: result.credit,
      searchCreditCost: result.tool.credit_cost,
      user: result.user,
      tool: result.tool,
    });
  } catch (err) {
    console.error("GET /api/user/credit エラー:", err);
    if (err instanceof DashboardCreditsError) {
      return NextResponse.json(
        { error: err.message, credit: null },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: USER_INFO_MISSING_MESSAGE, credit: null },
      { status: 500 }
    );
  }
}
