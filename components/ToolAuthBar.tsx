import {
  CREDIT_PER_RESULT,
  MAX_CREDIT_COST,
  MAX_RESULTS,
} from "@/lib/constants";
import {
  getActiveCredit,
  getActiveUserId,
  type AuthState,
} from "@/lib/authState";
import { getSafeDashboardUrl } from "@/lib/toolToken";

type ToolAuthBarProps = {
  authState: AuthState | null;
  isLoading?: boolean;
  loadingMessage?: string;
};

export default function ToolAuthBar({
  authState,
  isLoading = false,
  loadingMessage = "ユーザー情報を確認中…",
}: ToolAuthBarProps) {
  const dashboardHref = getSafeDashboardUrl("/dashboard");

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">{loadingMessage}</p>
      </div>
    );
  }

  if (!authState?.userId && !getActiveUserId()) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
        ログイン前でも検索条件の入力は可能です。検索実行時はダッシュボードからのログインが必要です。
      </div>
    );
  }

  const displayName =
    authState?.nickname?.trim() ||
    authState?.email?.trim() ||
    "ユーザー";
  const userId = authState?.userId ?? getActiveUserId() ?? "";
  const credit = authState?.credit ?? getActiveCredit() ?? 0;

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            ログインユーザー
          </p>
          <p className="mt-2 text-lg font-bold text-gray-900 sm:text-xl">
            {displayName}
          </p>
          {authState?.email && (
            <p className="mt-1 text-sm text-gray-600">{authState.email}</p>
          )}
          <p className="mt-1 font-mono text-xs text-gray-400">
            ID: {userId}
          </p>
          <p className="mt-4 text-sm text-gray-700">
            残クレジット:{" "}
            <span className="text-base font-bold text-blue-700">
              {credit.toLocaleString("ja-JP")}
            </span>
          </p>
        </div>
        <a
          href={dashboardHref}
          className="inline-flex shrink-0 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
        >
          ← ダッシュボードへ戻る
        </a>
      </div>
      <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-500">
        最大{MAX_RESULTS}件 / 1件{CREDIT_PER_RESULT}クレジット / 最大
        {MAX_CREDIT_COST}クレジット（実際は取得件数に応じて消費・共通ダッシュボード経由）
      </p>
    </div>
  );
}
