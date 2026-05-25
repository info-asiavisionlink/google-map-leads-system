import type { ToolVerifyResult } from "@/lib/toolVerify";
import { getDashboardUrl } from "@/lib/toolToken";

type ToolAuthBarProps = {
  verify: ToolVerifyResult | null;
  isLoading?: boolean;
};

export default function ToolAuthBar({ verify, isLoading = false }: ToolAuthBarProps) {
  const dashboardHref = getDashboardUrl("/dashboard");

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
        認証情報を確認しています…
      </div>
    );
  }

  if (!verify) {
    return null;
  }

  const displayName =
    verify.user.username?.trim() || verify.user.email || "ユーザー";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <a
          href={dashboardHref}
          className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-100"
        >
          ← ダッシュボードへ戻る
        </a>
        <span className="text-gray-600">
          ログイン中:{" "}
          <span className="font-medium text-gray-900">{displayName}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-gray-600">
        <span>
          現在のクレジット:{" "}
          <span className="font-bold text-blue-700">{verify.credit}</span>
        </span>
        <span>
          この検索は{" "}
          <span className="font-bold text-blue-700">
            {verify.tool.credit_cost}
          </span>{" "}
          Credit消費します
        </span>
      </div>
    </div>
  );
}
