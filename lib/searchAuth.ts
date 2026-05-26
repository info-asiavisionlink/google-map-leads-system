import { NextRequest } from "next/server";
import { authDebugError, authDebugInfo, maskToken } from "@/lib/authDebug";
import { TOKEN_AUTH_EXPIRED_MESSAGE } from "@/lib/constants";
import {
  DashboardCreditsError,
  verifyToolAccessToken,
} from "@/lib/dashboardCredits";
import { getBearerTokenFromHeader } from "@/lib/toolVerify";

export type SearchAuthBody = {
  user_id?: string;
  access_token?: string;
  token?: string;
  current_credit?: number;
};

export type ResolvedSearchAuth = {
  userId: string;
  accessToken: string;
};

export type SearchAuthContext = {
  userId: string;
  accessToken: string;
  currentCredit: number;
  verifiedViaDashboard: boolean;
};

export function extractSearchAuth(
  request: NextRequest,
  body: SearchAuthBody
): ResolvedSearchAuth | null {
  const bearerToken = getBearerTokenFromHeader(
    request.headers.get("authorization")
  );
  const bodyToken =
    body.access_token?.trim() || body.token?.trim() || undefined;
  const accessToken = bearerToken || bodyToken || null;

  const headerUserId = request.headers.get("x-user-id")?.trim();
  const bodyUserId = body.user_id?.trim();
  const userId = headerUserId || bodyUserId || null;

  authDebugInfo("search-auth-extract", {
    authorization_header_exists: Boolean(bearerToken),
    bearer_token_length: maskToken(bearerToken).token_length,
    body_access_token_exists: Boolean(body.access_token?.trim()),
    body_token_exists: Boolean(body.token?.trim()),
    header_user_id: headerUserId ?? "(none)",
    body_user_id: bodyUserId ?? "(none)",
    resolved_user_id: userId ?? "(none)",
    resolved_token_exists: Boolean(accessToken),
    resolved_token_length: maskToken(accessToken).token_length,
    current_credit_hint:
      typeof body.current_credit === "number" ? body.current_credit : "(none)",
  });

  if (!userId || !accessToken) {
    authDebugError("search-auth-extract", {
      failure: "missing_user_or_token",
      user_id_empty: !userId,
      token_empty: !accessToken,
    });
    return null;
  }

  return { userId, accessToken };
}

/**
 * ダッシュボード verify を試行し、失敗時は body の user_id / current_credit にフォールバック。
 */
export async function resolveSearchAuthContext(
  auth: ResolvedSearchAuth,
  creditHint?: number
): Promise<SearchAuthContext> {
  try {
    const verifyResult = await verifyToolAccessToken(auth.accessToken);
    authDebugInfo("search-auth-context", {
      source: "dashboard_verify",
      user_id: verifyResult.user.id,
      credit: verifyResult.credit,
    });
    return {
      userId: verifyResult.user.id,
      accessToken: auth.accessToken,
      currentCredit: verifyResult.credit,
      verifiedViaDashboard: true,
    };
  } catch (err) {
    authDebugError(
      "search-auth-context",
      {
        source: "fallback_to_request",
        request_user_id: auth.userId,
        credit_hint: creditHint ?? "(none)",
      },
      err
    );

    if (creditHint === undefined || Number.isNaN(creditHint)) {
      throw new DashboardCreditsError(
        err instanceof DashboardCreditsError
          ? err.message
          : TOKEN_AUTH_EXPIRED_MESSAGE,
        err instanceof DashboardCreditsError ? err.status : 401,
        "unauthorized"
      );
    }

    return {
      userId: auth.userId,
      accessToken: auth.accessToken,
      currentCredit: creditHint,
      verifiedViaDashboard: false,
    };
  }
}
