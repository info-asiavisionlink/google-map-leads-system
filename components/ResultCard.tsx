"use client";

import { OpeningHoursDisplay } from "@/components/FormattedField";
import {
  displayOrEmpty,
  formatBusinessStatus,
  formatPriceLevel,
  splitReviewItems,
} from "@/lib/placeFormat";
import type { PlaceSearchResult } from "@/lib/types";
import { useState, type ReactNode } from "react";

type ResultCardProps = {
  row: PlaceSearchResult;
  index: number;
  isAiSelected?: boolean;
  onAiClick?: () => void;
};

const REVIEW_DISPLAY_MAX_LEN = 600;

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-800">{children}</dd>
    </div>
  );
}

function ExternalLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex max-w-full break-all rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 ${className}`}
    >
      {label}
    </a>
  );
}

/** 写真IDや内部コードを除外した口コミテキスト */
function isInternalCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/places\/[\w-]+\/photos\//i.test(trimmed)) return true;
  if (/^[\w\-/.:,]+$/.test(trimmed) && trimmed.length > 80) return true;
  return false;
}

function formatReviewTextForDisplay(text: string): string {
  const display = displayOrEmpty(text);
  if (display === "-") return "";

  const items = splitReviewItems(display).filter((item) => !isInternalCodeLine(item));
  if (items.length === 0) return "";

  let joined = items.join("\n");
  if (joined.length > REVIEW_DISPLAY_MAX_LEN) {
    joined = `${joined.slice(0, REVIEW_DISPLAY_MAX_LEN)}…`;
  }
  return joined;
}

function ReviewTextDisplay({ text }: { text: string }) {
  const formatted = formatReviewTextForDisplay(text);
  if (!formatted) {
    return <span className="text-sm text-gray-400">-</span>;
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">
      {formatted}
    </p>
  );
}

function displayOptionalField(value: string | null | undefined): string | null {
  const v = displayOrEmpty(value);
  if (v === "-" || v === "undefined" || v === "null") return null;
  return v;
}

export default function ResultCard({
  row,
  index,
  isAiSelected = false,
  onAiClick,
}: ResultCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const statusLabel = formatBusinessStatus(row.businessStatus);
  const isOperational = row.businessStatus === "OPERATIONAL";
  const priceLabel = displayOptionalField(formatPriceLevel(row.priceLevel));
  const primaryType = displayOptionalField(row.primaryType);
  const intlPhone = displayOptionalField(row.internationalPhoneNumber);
  const editorial = displayOptionalField(row.editorialSummary);
  const closedDays = displayOptionalField(row.closedDays);
  const hasOpeningHours = displayOrEmpty(row.regularOpeningHours) !== "-";
  const hasReviews = formatReviewTextForDisplay(row.reviewsText).length > 0;

  return (
    <article
      className={`min-w-0 max-w-full overflow-hidden rounded-xl border bg-gradient-to-br from-white to-blue-50/50 p-4 shadow-sm sm:p-5 ${
        isAiSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-blue-100"
      }`}
    >
      <div className="mb-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
            No.{index + 1}
          </span>
          {row.category && row.category !== "-" && (
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {row.category}
            </span>
          )}
          {statusLabel !== "-" && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                isOperational
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {statusLabel}
            </span>
          )}
        </div>
        <h3 className="mt-2 break-words text-lg font-bold text-gray-900 sm:text-xl">
          {row.name}
        </h3>
        {(row.rating != null || row.reviewCount != null) && (
          <p className="mt-1 text-sm text-amber-800">
            評価：{row.rating ?? "—"}
            {row.reviewCount != null && (
              <span className="text-gray-600">
                {" "}
                / 口コミ {row.reviewCount.toLocaleString("ja-JP")}件
              </span>
            )}
          </p>
        )}
      </div>

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label="住所">{displayOrEmpty(row.address)}</Field>
        <Field label="電話番号">{displayOrEmpty(row.phoneNumber)}</Field>
      </dl>

      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        {row.websiteUrl ? (
          <ExternalLink
            href={row.websiteUrl}
            label="公式サイトを見る"
            className="w-full justify-center sm:w-auto"
          />
        ) : (
          <span className="text-sm text-gray-400">Webサイト：-</span>
        )}
        {row.googleMapsUrl && (
          <ExternalLink
            href={row.googleMapsUrl}
            label="Googleマップで開く"
            className="w-full justify-center sm:w-auto"
          />
        )}
      </div>

      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
        {onAiClick && (
          <button
            type="button"
            onClick={onAiClick}
            className={`flex h-12 w-full items-center justify-center rounded-xl border-2 px-4 text-base font-semibold transition sm:flex-1 ${
              isAiSelected
                ? "border-blue-400 bg-blue-100 text-blue-900"
                : "border-blue-200 bg-white text-blue-800 hover:bg-blue-50"
            }`}
          >
            AIに質問
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-base font-medium text-gray-700 transition hover:bg-gray-50 sm:flex-1"
        >
          {detailsOpen ? "詳細を閉じる" : "詳細を見る"}
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-4 min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white/80 p-4">
          {hasOpeningHours && (
            <Field label="営業時間">
              <OpeningHoursDisplay
                text={row.regularOpeningHours}
                className="text-sm"
              />
            </Field>
          )}

          {closedDays && (
            <Field label="定休日">{closedDays}</Field>
          )}

          {hasReviews && (
            <Field label="口コミ要約">
              <ReviewTextDisplay text={row.reviewsText} />
            </Field>
          )}

          {priceLabel && (
            <Field label="価格帯">{priceLabel}</Field>
          )}

          {intlPhone && (
            <Field label="国際電話番号">{intlPhone}</Field>
          )}

          {primaryType && (
            <Field label="業種タイプ">{primaryType}</Field>
          )}

          {editorial && (
            <Field label="概要">
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
                {editorial}
              </p>
            </Field>
          )}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400">place_id</p>
            <code className="mt-0.5 block break-all text-xs text-gray-500">
              {row.placeId}
            </code>
          </div>
        </div>
      )}
    </article>
  );
}
