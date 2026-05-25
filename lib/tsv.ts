import { displayEmail, displayOrEmpty } from "@/lib/placeFormat";
import type { PlaceSearchResult } from "./types";

const TSV_HEADER =
  "No\t店舗名\t住所\t電話番号\tメールアドレス\tWebサイトURL\tGoogleマップURL\t評価\t口コミ数\t口コミコメント\t営業時間\t定休日\t業種カテゴリ\tステータス\tplace_id";

function escapeTsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

export function buildTsv(results: PlaceSearchResult[]): string {
  const rows = results.map((r, index) => {
    const no = index + 1;
    return [
      no,
      escapeTsvCell(r.name),
      escapeTsvCell(r.address),
      escapeTsvCell(displayOrEmpty(r.phoneNumber)),
      escapeTsvCell(r.email || displayEmail()),
      escapeTsvCell(r.websiteUrl),
      escapeTsvCell(r.googleMapsUrl),
      escapeTsvCell(r.rating),
      escapeTsvCell(r.reviewCount),
      escapeTsvCell(r.reviewsText),
      escapeTsvCell(r.regularOpeningHours),
      escapeTsvCell(r.closedDays),
      escapeTsvCell(r.category),
      escapeTsvCell(r.businessStatus),
      escapeTsvCell(r.placeId),
    ].join("\t");
  });

  return [TSV_HEADER, ...rows].join("\n");
}
