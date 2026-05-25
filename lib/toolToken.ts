/** sessionStorage キー（localStorage は使わない） */
export const TOOL_ACCESS_TOKEN_KEY = "tool_access_token";

const TOKEN_PARAM = "access_token";

/** URL から access_token を取得し sessionStorage に保存、URL から削除 */
export function captureAccessTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get(TOKEN_PARAM)?.trim();

  if (fromUrl) {
    sessionStorage.setItem(TOOL_ACCESS_TOKEN_KEY, fromUrl);
    params.delete(TOKEN_PARAM);
    const query = params.toString();
    const newUrl =
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
    return fromUrl;
  }

  return sessionStorage.getItem(TOOL_ACCESS_TOKEN_KEY);
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOOL_ACCESS_TOKEN_KEY);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOOL_ACCESS_TOKEN_KEY);
}

export function getDashboardBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_DASHBOARD_BASE_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_DASHBOARD_BASE_URL が設定されていません");
  }
  return url.replace(/\/$/, "");
}

export function getDashboardUrl(path: string): string {
  return `${getDashboardBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
