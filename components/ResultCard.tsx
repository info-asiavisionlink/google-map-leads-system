"use client";

import {
  OpeningHoursDisplay,
  ReviewsDisplay,
} from "@/components/FormattedField";
import {
  displayOrEmpty,
  formatBusinessStatus,
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

function ReviewSummary({ text }: { text: string }) {
  const display = displayOrEmpty(text);
  if (display === "-") {
    return <span className="text-sm text-gray-400">-</span>;
  }

  const items = splitReviewItems(display);
  const preview = items.slice(0, 2).join(" / ");

  return (
    <p className="line-clamp-3 break-words text-sm leading-relaxed text-gray-700">
      {preview}
      {items.length > 2 ? " …" : ""}
    </p>
  );
}

function HoursPreview({ text }: { text: string }) {
  const display = displayOrEmpty(text);
  if (display === "-") {
    return <span className="text-sm text-gray-400">-</span>;
  }

  const lines = display.split("\n").filter(Boolean).slice(0, 3);

  return (
    <div className="space-y-1 text-sm leading-relaxed text-gray-700">
      {lines.map((line, i) => (
        <p key={i} className="break-words">
          {line}
        </p>
      ))}
      {display.split("\n").filter(Boolean).length > 3 && (
        <p className="text-xs text-gray-500">…ほか（詳細を見る）</p>
      )}
    </div>
  );
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

  return (
    <article
      className={`min-w-0 max-w-full overflow-hidden rounded-xl border bg-gradient-to-br from-white to-blue-50/50 p-4 shadow-sm sm:p-5 ${
        isAiSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-blue-100"
      }`}
    >
      {/* 上部：店舗概要 + AIボタン */}
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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

        {onAiClick && (
          <button
            type="button"
            onClick={onAiClick}
            className={`shrink-0 inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition sm:h-11 ${
              isAiSelected
                ? "border-blue-400 bg-blue-100 text-blue-900"
                : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
            }`}
          >
            AIに質問
          </button>
        )}
      </div>

      {/* 中段：連絡先・URL */}
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

      {/* 下段：営業情報・口コミ要約 */}
      <div className="mt-4 grid min-w-0 gap-3 border-t border-blue-100 pt-4 sm:grid-cols-2">
        <Field label="営業時間">
          <HoursPreview text={row.regularOpeningHours} />
        </Field>
        <Field label="定休日">{displayOrEmpty(row.closedDays)}</Field>
        <div className="min-w-0 sm:col-span-2">
          <Field label="口コミ要約">
            <ReviewSummary text={row.reviewsText} />
          </Field>
        </div>
      </div>

      {/* アクション */}
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

      {/* 折りたたみ詳細 */}
      {detailsOpen && (
        <div className="mt-4 min-w-0 space-y-3 rounded-xl border border-gray-100 bg-white/80 p-4">
          <Field label="place_id">
            <code className="break-all text-xs text-gray-600">{row.placeId}</code>
          </Field>
          <Field label="primary_type">
            {displayOrEmpty(row.primaryType)}
          </Field>
          <Field label="国際電話番号">
            {displayOrEmpty(row.internationalPhoneNumber)}
          </Field>
          <Field label="メールアドレス">
            {displayOrEmpty(row.email)}
          </Field>
          <Field label="price_level">
            {displayOrEmpty(row.priceLevel)}
          </Field>
          {row.editorialSummary && row.editorialSummary !== "-" && (
            <Field label="editorial_summary">
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
                {row.editorialSummary}
              </p>
            </Field>
          )}
          {row.reviewsText && row.reviewsText !== "-" && (
            <Field label="口コミ全文">
              <ReviewsDisplay text={row.reviewsText} className="text-sm" />
            </Field>
          )}
          {row.photoNames && row.photoNames !== "-" && (
            <Field label="photo_names">
              <p className="break-all text-xs text-gray-600">{row.photoNames}</p>
            </Field>
          )}
          <Field label="営業時間（全文）">
            <OpeningHoursDisplay
              text={row.regularOpeningHours}
              className="text-sm"
            />
          </Field>
        </div>
      )}
    </article>
  );
}
