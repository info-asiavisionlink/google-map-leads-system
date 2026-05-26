/**
 * 認証フロー一時デバッグ用（本番では NEXT_PUBLIC_AUTH_DEBUG / AUTH_DEBUG を外す）
 * 削除時: このファイルと authDebugClient.ts / AuthDebugPanel / api/debug を削除
 */

export const AUTH_DEBUG_LOG_PREFIX = "[auth-debug]";

export type AuthDebugFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AuthSystemApiUrlInfo = {
  configured: boolean;
  url: string | null;
  source: "AUTH_SYSTEM_API_URL" | "NEXT_PUBLIC_DASHBOARD_BASE_URL" | "none";
  mismatch_warning: string | null;
};

export function isServerAuthDebugEnabled(): boolean {
  return (
    process.env.AUTH_DEBUG === "true" ||
    process.env.NEXT_PUBLIC_AUTH_DEBUG === "true"
  );
}

export function maskToken(token: string | null | undefined): {
  token_exists: boolean;
  token_length: number;
  token_preview: string;
} {
  if (!token?.trim()) {
    return { token_exists: false, token_length: 0, token_preview: "" };
  }
  const trimmed = token.trim();
  const len = trimmed.length;
  const preview =
    len <= 8 ? "***" : `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  return {
    token_exists: true,
    token_length: len,
    token_preview: preview,
  };
}

/** 管理システム API のベース URL（AUTH_SYSTEM_API_URL を優先、なければ DASHBOARD） */
export function resolveAuthSystemApiUrl(): string | null {
  const fromAuth = process.env.AUTH_SYSTEM_API_URL?.trim();
  if (fromAuth) return fromAuth.replace(/\/$/, "");

  const fromDashboard = process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL?.trim();
  if (fromDashboard) return fromDashboard.replace(/\/$/, "");

  return null;
}

export function getAuthSystemApiUrlInfo(): AuthSystemApiUrlInfo {
  const authUrl = process.env.AUTH_SYSTEM_API_URL?.trim()?.replace(/\/$/, "");
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL?.trim()?.replace(
    /\/$/,
    ""
  );

  let mismatch_warning: string | null = null;
  if (
    authUrl &&
    dashboardUrl &&
    authUrl !== dashboardUrl
  ) {
    mismatch_warning =
      "AUTH_SYSTEM_API_URL と NEXT_PUBLIC_DASHBOARD_BASE_URL が異なります。どちらかに統一してください。";
  }

  if (authUrl) {
    return {
      configured: true,
      url: authUrl,
      source: "AUTH_SYSTEM_API_URL",
      mismatch_warning,
    };
  }

  if (dashboardUrl) {
    return {
      configured: true,
      url: dashboardUrl,
      source: "NEXT_PUBLIC_DASHBOARD_BASE_URL",
      mismatch_warning,
    };
  }

  return {
    configured: false,
    url: null,
    source: "none",
    mismatch_warning: null,
  };
}

function formatFields(fields: AuthDebugFields): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${v === undefined ? "undefined" : String(v)}`)
    .join(" ");
}

export function authDebugInfo(scope: string, fields: AuthDebugFields): void {
  if (!isServerAuthDebugEnabled()) return;
  console.info(`${AUTH_DEBUG_LOG_PREFIX}[${scope}] ${formatFields(fields)}`);
}

export function authDebugError(
  scope: string,
  fields: AuthDebugFields,
  err?: unknown
): void {
  if (!isServerAuthDebugEnabled()) return;
  const errMessage =
    err instanceof Error ? err.message : err !== undefined ? String(err) : "";
  console.error(
    `${AUTH_DEBUG_LOG_PREFIX}[${scope}] ${formatFields({
      ...fields,
      error: errMessage || fields.error,
    })}`
  );
}

export function safeJsonForLog(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (text.length > 2000) {
      return `${text.slice(0, 2000)}…(truncated)`;
    }
    return text;
  } catch {
    return String(value);
  }
}
