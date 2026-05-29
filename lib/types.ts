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

export type SearchStopReason =
  | "reached_target"
  | "prefecture_fully_scanned"
  | "timeout_near_limit"
  | "google_api_error"
  | "save_error"
  | "credit_shortage";

export type SearchJobStatus =
  | "pending"
  | "processing"
  | "scanning"
  | "fetching"
  | "details"
  | "deduping"
  | "saving"
  | "completed"
  | "failed"
  | "no_results";

export type SearchJobResponse = {
  jobId: string;
  searchRequestId?: string;
  status: SearchJobStatus;
  currentStep: string;
  fetchedCount: number;
  savedCount: number;
  targetCount: number;
  candidateCount?: number;
  duplicateCount?: number;
  previouslySavedCount?: number;
  searchPointCount?: number;
  pageFetchCount?: number;
  currentLocationLabel?: string;
  searchSummary?: string;
  results: PlaceSearchResult[];
  copyText: string;
  message?: string;
  credit?: number | null;
  creditConsumed?: number;
  errorMessage?: string;
};

export type SearchStartResponse = {
  jobId: string;
  searchRequestId: string;
  status: SearchJobStatus;
  message: string;
};

export type SearchApiResponse = {
  status: "success" | "no_results" | "error" | "processing";
  message: string;
  stopReason?: SearchStopReason;
  results: PlaceSearchResult[];
  copyText: string;
  credit?: number | null;
  jobId?: string;
  resultCount?: number;
  fetchedCount?: number;
  savedCount?: number;
  saveFailedCount?: number;
  duplicateExclusionCount?: number;
  creditConsumed?: number;
  creditBefore?: number;
  creditAfter?: number;
  saveWarning?: string | null;
  code?:
    | "unauthorized"
    | "insufficient_credit"
    | "api_error"
    | "consume_failed"
    | "save_failed";
};

export type PlaceChatApiResponse = {
  status: "success" | "error";
  message: string;
  answer?: string;
  credit?: number | null;
  usedWebsite?: boolean;
  historySaveFailed?: boolean;
  historySaveWarning?: string;
  code?: "unauthorized" | "insufficient_credit" | "api_error";
};
