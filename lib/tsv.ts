import type { PlaceSearchResult } from "./types";

const TSV_HEADER =
  "店舗名\tカテゴリ\t住所\t電話\tWeb\tGoogleマップURL\t評価\t口コミ数\tplace_id";

function tsvPhone(value: string | null | undefined): string {
  if (!value || value.trim() === "" || value === "-") return "";
  return escapeTsvCell(value);
}

export function escapeTsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTsv(results: PlaceSearchResult[]): string {
  const rows = results.map((r) => {
    return [
      escapeTsvCell(r.name),
      escapeTsvCell(r.category),
      escapeTsvCell(r.address),
      tsvPhone(r.phoneNumber),
      escapeTsvCell(r.websiteUrl),
      escapeTsvCell(r.googleMapsUrl),
      escapeTsvCell(r.rating),
      escapeTsvCell(r.reviewCount),
      escapeTsvCell(r.placeId),
    ].join("\t");
  });

  return [TSV_HEADER, ...rows].join("\n");
}
