import {
  CREDIT_PER_RESULT,
  MAX_CREDIT_COST,
  MAX_RESULTS,
} from "@/lib/constants";
import { getSafeDashboardUrl } from "@/lib/toolToken";
import type { ToolUser } from "@/lib/toolUser";

type ToolAuthBarProps = {
  user: ToolUser | null;
  isLoading?: boolean;
  loadingMessage?: string;
};

export default function ToolAuthBar({
  user,
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

  if (!user) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
        ログイン前でも検索条件の入力は可能です。検索実行時はダッシュボードからのログインが必要です。
      </div>
    );
  }

  const displayName = user.username?.trim() || user.email || "ユーザー";

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
          <p className="mt-1 text-sm text-gray-600">{user.email}</p>
          <p className="mt-4 text-sm text-gray-700">
            残クレジット:{" "}
            <span className="text-base font-bold text-blue-700">
              {user.credit.toLocaleString("ja-JP")}
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
