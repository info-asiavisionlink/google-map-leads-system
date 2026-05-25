const EMPTY = "-";
const CLOSED_UNKNOWN = "要確認";

/** 口コミ複数件の区切り（表示・保存用） */
export const REVIEW_ITEM_SEPARATOR = "\n\n";

const PRICE_LEVEL_LABELS: Record<string, string> = {
  PRICE_LEVEL_FREE: "無料",
  PRICE_LEVEL_INEXPENSIVE: "安い",
  PRICE_LEVEL_MODERATE: "普通",
  PRICE_LEVEL_EXPENSIVE: "高い",
  PRICE_LEVEL_VERY_EXPENSIVE: "とても高い",
};

const BUSINESS_STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: "営業中",
  CLOSED_TEMPORARILY: "一時休業",
  CLOSED_PERMANENTLY: "閉業",
};

const WEEKDAY_EN_TO_JA: Record<string, string> = {
  Monday: "月曜日",
  Tuesday: "火曜日",
  Wednesday: "水曜日",
  Thursday: "木曜日",
  Friday: "金曜日",
  Saturday: "土曜日",
  Sunday: "日曜日",
  Mon: "月",
  Tue: "火",
  Wed: "水",
  Thu: "木",
  Fri: "金",
  Sat: "土",
  Sun: "日",
};

const CLOSED_LINE_PATTERN =
  /定休|休業|休み|closed|Closed|定休日|臨時休業|24時間営業/i;

export function normalizePlaceId(id: string): string {
  if (id.startsWith("places/")) {
    return id.slice("places/".length);
  }
  return id;
}

export function truncateText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

/** 英語の曜日・営業表現を日本語に置換（既に日本語の行はそのまま） */
export function localizeWeekdayLine(line: string): string {
  let result = line.trim();
  if (!result) return result;

  for (const [en, ja] of Object.entries(WEEKDAY_EN_TO_JA)) {
    result = result.replace(
      new RegExp(`^${en}\\b`, "i"),
      ja
    );
    result = result.replace(
      new RegExp(`(^|\\s)${en}:`, "i"),
      `$1${ja}:`
    );
  }

  result = result.replace(/\bOpen 24 hours\b/gi, "24時間営業");
  result = result.replace(/\bClosed\b/gi, "定休日");

  // 時刻の AM / PM のみ置換（数字付き時刻はそのまま）
  result = result.replace(/\bAM\b/g, "午前");
  result = result.replace(/\bPM\b/g, "午後");

  return result;
}

function localizeWeekdayDescriptions(
  weekdayDescriptions: string[] | undefined
): string[] {
  if (!weekdayDescriptions?.length) return [];
  return weekdayDescriptions.map(localizeWeekdayLine);
}

export function formatPriceLevel(
  priceLevel: string | null | undefined
): string {
  if (!priceLevel) return EMPTY;
  return PRICE_LEVEL_LABELS[priceLevel] ?? priceLevel;
}

export function formatBusinessStatus(
  status: string | null | undefined
): string {
  if (!status) return EMPTY;
  return BUSINESS_STATUS_LABELS[status] ?? status;
}

/** 曜日ごと改行の営業時間テキスト */
export function formatOpeningHours(
  weekdayDescriptions: string[] | undefined
): string {
  const lines = localizeWeekdayDescriptions(weekdayDescriptions);
  if (!lines.length) return EMPTY;
  return lines.join("\n");
}

export function detectClosedDays(
  weekdayDescriptions: string[] | undefined
): string {
  const lines = localizeWeekdayDescriptions(weekdayDescriptions);
  if (!lines.length) {
    return CLOSED_UNKNOWN;
  }

  const closedDays: string[] = [];
  for (const line of lines) {
    if (!CLOSED_LINE_PATTERN.test(line)) continue;
    const dayPart = line.split(/[:：]/)[0]?.trim();
    if (dayPart) {
      closedDays.push(localizeWeekdayLine(dayPart));
    }
  }

  if (closedDays.length === 0) {
    return CLOSED_UNKNOWN;
  }
  return closedDays.join("、");
}

export function formatReviewsText(
  reviews:
    | Array<{ text?: { text?: string }; rating?: number }>
    | undefined,
  maxItems = 3,
  maxLen = 80
): string {
  if (!reviews?.length) return EMPTY;

  const parts = reviews.slice(0, maxItems).map((review) => {
    const raw = review.text?.text?.trim() ?? "";
    if (!raw) return null;
    const body = truncateText(raw, maxLen);
    if (review.rating != null) {
      return `【★${review.rating}】${body}`;
    }
    return body;
  });

  const filtered = parts.filter((p): p is string => Boolean(p));
  return filtered.length > 0 ? filtered.join(REVIEW_ITEM_SEPARATOR) : EMPTY;
}

export function formatPhotoNames(
  photos: Array<{ name?: string }> | undefined
): string {
  if (!photos?.length) return EMPTY;
  const names = photos
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : EMPTY;
}

export function displayOrEmpty(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : EMPTY;
}

export function displayEmail(): string {
  return EMPTY;
}

/** 口コミテキストを表示用に分割 */
export function splitReviewItems(text: string): string[] {
  if (!text || text === EMPTY) return [];
  return text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
}
