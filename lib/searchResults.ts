import type { PlaceSearchResult } from "@/lib/types";

type SearchResultRow = {
  place_id: string;
  name: string;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  opening_hours: string | null;
  phone_number: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  email: string | null;
  international_phone_number: string | null;
  business_status: string | null;
  category: string | null;
  primary_type: string | null;
  closed_days: string | null;
  reviews_text: string | null;
  editorial_summary: string | null;
  price_level: string | null;
  photo_names: string | null;
};

export function mapSearchResultRow(row: SearchResultRow): PlaceSearchResult {
  return {
    placeId: row.place_id,
    name: row.name,
    address: row.address ?? "",
    phoneNumber: row.phone_number ?? "",
    email: row.email ?? "-",
    websiteUrl: row.website_url ?? "",
    googleMapsUrl: row.google_maps_url ?? "",
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count,
    reviewsText: row.reviews_text ?? "-",
    regularOpeningHours: row.opening_hours ?? "-",
    closedDays: row.closed_days ?? "-",
    category: row.category ?? "-",
    businessStatus: row.business_status ?? "-",
    primaryType: row.primary_type ?? "",
    internationalPhoneNumber: row.international_phone_number ?? "",
    editorialSummary: row.editorial_summary ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    priceLevel: row.price_level ?? "-",
    photoNames: row.photo_names ?? "-",
  };
}

export function buildResultInsertRow(
  searchRequestId: string,
  userId: string,
  r: PlaceSearchResult
) {
  return {
    search_request_id: searchRequestId,
    user_id: userId,
    place_id: r.placeId,
    name: r.name,
    address: r.address,
    rating: r.rating,
    review_count: r.reviewCount,
    opening_hours: r.regularOpeningHours,
    phone_number: r.phoneNumber,
    website_url: r.websiteUrl,
    google_maps_url: r.googleMapsUrl,
    latitude: r.latitude,
    longitude: r.longitude,
    email: r.email,
    international_phone_number: r.internationalPhoneNumber,
    business_status: r.businessStatus,
    category: r.category,
    primary_type: r.primaryType,
    closed_days: r.closedDays,
    reviews_text: r.reviewsText,
    editorial_summary: r.editorialSummary,
    price_level: r.priceLevel,
    photo_names: r.photoNames,
  };
}

export function buildPlaceContextText(place: PlaceSearchResult): string {
  return [
    `店舗名: ${place.name}`,
    `住所: ${place.address}`,
    `電話番号: ${place.phoneNumber}`,
    `Webサイト: ${place.websiteUrl || "なし"}`,
    `Google評価: ${place.rating ?? "不明"}`,
    `口コミ数: ${place.reviewCount ?? "不明"}`,
    `営業時間: ${place.regularOpeningHours}`,
    `定休日: ${place.closedDays}`,
    `業種: ${place.category}`,
    `ステータス: ${place.businessStatus}`,
    `口コミ抜粋: ${place.reviewsText}`,
    `概要: ${place.editorialSummary}`,
    `place_id: ${place.placeId}`,
  ].join("\n");
}
