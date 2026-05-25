import { GOOGLE_MAP_SEARCH_CREDIT_COST } from "@/lib/constants";

type CreditBarProps = {
  credit: number | null;
  isLoggedIn: boolean;
  isLoading?: boolean;
};

export default function CreditBar({
  credit,
  isLoggedIn,
  isLoading = false,
}: CreditBarProps) {
  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        ログインが必要です。共通ダッシュボードからログインしてからご利用ください。
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3">
      <p className="text-sm text-gray-800">
        {isLoading ? (
          "クレジット残高を読み込み中…"
        ) : (
          <>
            現在のクレジット：
            <span className="ml-1 text-lg font-bold text-blue-700">
              {credit ?? "—"}
            </span>
          </>
        )}
      </p>
      <p className="text-xs text-gray-600">
        この検索は
        <span className="mx-1 font-semibold text-blue-700">
          {GOOGLE_MAP_SEARCH_CREDIT_COST}
        </span>
        Credit消費します（新規1件以上取得できた場合のみ）
      </p>
    </div>
  );
}
