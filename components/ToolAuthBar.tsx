import { GOOGLE_MAP_SEARCH_CREDIT_COST } from "@/lib/constants";
import { getSafeDashboardUrl } from "@/lib/toolToken";
import type { ToolUserSession } from "@/lib/toolUserSession";
import type { ToolVerifyResult } from "@/lib/toolVerify";

type ToolAuthBarProps = {
  verify: ToolVerifyResult | null;
  userSession: ToolUserSession | null;
  isLoading?: boolean;
};

export default function ToolAuthBar({
  verify,
  userSession,
  isLoading = false,
}: ToolAuthBarProps) {
  const dashboardHref = getSafeDashboardUrl("/dashboard");

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">認証情報を確認しています…</p>
      </div>
    );
  }

  if (!verify && !userSession) {
    return null;
  }

  const displayName =
    userSession?.username?.trim() ||
    verify?.user.username?.trim() ||
    userSession?.email ||
    verify?.user.email ||
    "ユーザー";
  const email = userSession?.email ?? verify?.user.email ?? "";
  const remainingCredit =
    userSession?.remaining_credit ?? verify?.credit ?? 0;
  const creditCost = verify?.tool.credit_cost ?? GOOGLE_MAP_SEARCH_CREDIT_COST;

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
          {email ? (
            <p className="mt-1 text-sm text-gray-600">{email}</p>
          ) : null}
          <p className="mt-4 text-sm text-gray-700">
            残クレジット:{" "}
            <span className="text-base font-bold text-blue-700">
              {remainingCredit}
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
        この検索は{" "}
        <span className="font-semibold text-blue-700">{creditCost}</span>{" "}
        Credit を消費します（管理システム経由で減算）
      </p>
    </div>
  );
}
