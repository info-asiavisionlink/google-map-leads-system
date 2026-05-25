import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  AUTH_REQUIRED_MESSAGE,
  GOOGLE_MAP_SEARCH_CREDIT_COST,
} from "@/lib/constants";
import {
  DashboardCreditsError,
  fetchDashboardBalance,
} from "@/lib/dashboardCredits";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);

  if (!user) {
    return NextResponse.json(
      { error: AUTH_REQUIRED_MESSAGE, credit: null },
      { status: 401 }
    );
  }

  try {
    const credit = await fetchDashboardBalance(request);
    return NextResponse.json({
      credit,
      searchCreditCost: GOOGLE_MAP_SEARCH_CREDIT_COST,
    });
  } catch (err) {
    console.error("GET /api/user/credit エラー:", err);
    if (err instanceof DashboardCreditsError && err.status === 401) {
      return NextResponse.json(
        { error: AUTH_REQUIRED_MESSAGE, credit: null },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "クレジット残高の取得に失敗しました", credit: null },
      { status: 500 }
    );
  }
}
