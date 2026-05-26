export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  phoneNumber: string;
  email: string;
  websiteUrl: string;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
  reviewsText: string;
  regularOpeningHours: string;
  closedDays: string;
  category: string;
  businessStatus: string;
  primaryType: string;
  internationalPhoneNumber: string;
  editorialSummary: string;
  latitude: number | null;
  longitude: number | null;
  priceLevel: string;
  photoNames: string;
};

export type SearchApiResponse = {
  status: "success" | "no_results" | "error";
  message: string;
  results: PlaceSearchResult[];
  copyText: string;
  credit?: number | null;
  /** @deprecated savedCount を使用 */
  resultCount?: number;
  fetchedCount?: number;
  savedCount?: number;
  saveFailedCount?: number;
  creditConsumed?: number;
  creditBefore?: number;
  creditAfter?: number;
  /** DB保存に失敗した場合の警告（検索結果は results に含まれる） */
  saveWarning?: string | null;
  code?:
    | "unauthorized"
    | "insufficient_credit"
    | "api_error"
    | "consume_failed"
    | "save_failed";
};
