import { NextRequest } from "next/server";
import { authDebugError, authDebugInfo } from "@/lib/authDebug";
import { USER_INFO_MISSING_MESSAGE } from "@/lib/constants";
import { DashboardCreditsError } from "@/lib/dashboardCredits";

export type SearchAuthBody = {
  user_id?: string;
  current_credit?: number;
};

export type SearchAuthContext = {
  userId: string;
  currentCredit: number;
};

/** x-user-id または body.user_id から user_id を取得 */
export function extractSearchUserId(
  request: NextRequest,
  body: SearchAuthBody
): string | null {
  const headerUserId = request.headers.get("x-user-id")?.trim();
  const bodyUserId = body.user_id?.trim();
  const userId = headerUserId || bodyUserId || null;

  authDebugInfo("search-auth-extract", {
    header_user_id: headerUserId ?? "(none)",
    body_user_id: bodyUserId ?? "(none)",
    resolved_user_id: userId ?? "(none)",
    current_credit:
      typeof body.current_credit === "number" ? body.current_credit : "(none)",
  });

  if (!userId) {
    authDebugError("search-auth-extract", { failure: "missing_user_id" });
  }

  return userId;
}

/** user_id を正本とし、残高はリクエストの current_credit を使用 */
export function resolveSearchAuthContext(
  userId: string,
  creditHint?: number
): SearchAuthContext {
  if (!userId.trim()) {
    throw new DashboardCreditsError(USER_INFO_MISSING_MESSAGE, 401, "unauthorized");
  }

  const currentCredit =
    typeof creditHint === "number" && !Number.isNaN(creditHint)
      ? creditHint
      : 0;

  authDebugInfo("search-auth-context", {
    user_id: userId,
    current_credit: currentCredit,
  });

  return { userId, currentCredit };
}
