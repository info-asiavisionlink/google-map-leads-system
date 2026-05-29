import {
  OpeningHoursDisplay,
  ReviewsDisplay,
} from "@/components/FormattedField";
import PlaceAiChat from "@/components/PlaceAiChat";
import { displayOrEmpty } from "@/lib/placeFormat";
import type { PlaceSearchResult } from "@/lib/types";
import type { ReactNode } from "react";

type ResultCardProps = {
  row: PlaceSearchResult;
  index: number;
  userId?: string | null;
  onCreditUpdate?: (credit: number) => void;
};

function LinkButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center break-all rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
    >
      {label}
    </a>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-800">{children}</dd>
    </div>
  );
}

export default function ResultCard({
  row,
  index,
  userId,
  onCreditUpdate,
}: ResultCardProps) {
  return (
    <article className="min-w-0 max-w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium text-blue-600">No.{index + 1}</span>
          <h3 className="mt-0.5 break-words text-lg font-bold text-gray-900">
            {row.name}
          </h3>
        </div>
        {row.rating != null && (
          <div className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 text-center">
            <p className="text-sm font-bold text-amber-800">{row.rating}</p>
            <p className="text-[10px] text-amber-700">
              {row.reviewCount != null ? `${row.reviewCount}件` : "—"}
            </p>
          </div>
        )}
      </div>

      <dl className="grid min-w-0 gap-3">
        <Field label="住所">{displayOrEmpty(row.address)}</Field>
        <Field label="電話番号">{displayOrEmpty(row.phoneNumber)}</Field>
        <Field label="メールアドレス">{displayOrEmpty(row.email)}</Field>
        <div className="flex min-w-0 flex-wrap gap-2">
          {row.websiteUrl ? (
            <LinkButton href={row.websiteUrl} label="Webサイト" />
          ) : (
            <span className="text-sm text-gray-400">Webサイト: -</span>
          )}
          <LinkButton href={row.googleMapsUrl} label="地図" />
        </div>
        {row.reviewsText && row.reviewsText !== "-" && (
          <Field label="口コミ">
            <ReviewsDisplay text={row.reviewsText} className="text-sm" />
          </Field>
        )}
        <Field label="営業時間">
          <OpeningHoursDisplay
            text={row.regularOpeningHours}
            className="text-sm"
          />
        </Field>
        <Field label="定休日">{displayOrEmpty(row.closedDays)}</Field>
        <Field label="業種カテゴリ">{displayOrEmpty(row.category)}</Field>
        <Field label="ステータス">{displayOrEmpty(row.businessStatus)}</Field>
        <Field label="place_id">
          <code className="break-all text-xs text-gray-500">{row.placeId}</code>
        </Field>
      </dl>

      <PlaceAiChat
        place={row}
        userId={userId ?? null}
        onCreditUpdate={onCreditUpdate}
      />
    </article>
  );
}
