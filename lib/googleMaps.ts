import {
  detectClosedDays,
  formatBusinessStatus,
  formatOpeningHours,
  formatPhotoNames,
  formatPriceLevel,
  formatReviewsText,
  normalizePlaceId,
} from "@/lib/placeFormat";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_SEARCH_TEXT_URL =
  "https://places.googleapis.com/v1/places:searchText";
const PLACES_BASE_URL = "https://places.googleapis.com/v1/places";

const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.googleMapsUri",
].join(",");

const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "currentOpeningHours",
  "businessStatus",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "reviews",
  "editorialSummary",
  "location",
  "priceLevel",
  "photos",
].join(",");

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY が設定されていません");
  }
  return key;
}

function placesHeaders(fieldMask: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": getApiKey(),
    "X-Goog-FieldMask": fieldMask,
  };
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

export async function geocodeArea(area: string): Promise<GeocodeResult> {
  const key = getApiKey();
  const params = new URLSearchParams({
    address: area,
    key,
    language: "ja",
    region: "jp",
  });

  const res = await fetch(`${GEOCODE_URL}?${params.toString()}`);
  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
    error_message?: string;
  };

  if (data.status !== "OK" || !data.results?.[0]) {
    const detail = data.error_message ?? data.status;
    throw new Error(`エリア「${area}」の位置情報を取得できませんでした: ${detail}`);
  }

  const first = data.results[0];
  return {
    latitude: first.geometry.location.lat,
    longitude: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
  };
}

type NewPlaceSearchItem = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  googleMapsUri?: string;
};

export type TextSearchPlace = {
  placeId: string;
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  category?: string;
  googleMapsUri?: string;
};

export type SearchPlacesParams = {
  query: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

export async function searchPlaces(
  params: SearchPlacesParams
): Promise<TextSearchPlace[]> {
  const places: TextSearchPlace[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      textQuery: params.query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: {
            latitude: params.latitude,
            longitude: params.longitude,
          },
          radius: params.radiusM,
        },
      },
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const res = await fetch(PLACES_SEARCH_TEXT_URL, {
      method: "POST",
      headers: placesHeaders(TEXT_SEARCH_FIELD_MASK),
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      places?: NewPlaceSearchItem[];
      nextPageToken?: string;
      error?: { message?: string; status?: string };
    };

    if (!res.ok) {
      const detail =
        data.error?.message ?? res.statusText ?? "Text Search failed";
      throw new Error(`店舗検索に失敗しました: ${detail}`);
    }

    for (const item of data.places ?? []) {
      if (!item.id) continue;
      const placeId = normalizePlaceId(item.id);
      places.push({
        placeId,
        name: item.displayName?.text ?? "",
        formattedAddress: item.formattedAddress,
        latitude: item.location?.latitude,
        longitude: item.location?.longitude,
        rating: item.rating,
        userRatingCount: item.userRatingCount,
        businessStatus: item.businessStatus,
        primaryType: item.primaryType,
        category: item.primaryTypeDisplayName?.text,
        googleMapsUri: item.googleMapsUri,
      });
    }

    pageToken = data.nextPageToken;
    if (pageToken && places.length < 60) {
      await new Promise((r) => setTimeout(r, 300));
    } else {
      pageToken = undefined;
    }
  } while (pageToken && places.length < 60);

  return places;
}

export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  regularOpeningHours: string;
  closedDays: string;
  phoneNumber: string;
  internationalPhoneNumber: string;
  websiteUrl: string;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string;
  category: string;
  primaryType: string;
  reviewsText: string;
  editorialSummary: string;
  priceLevel: string;
  photoNames: string;
};

export function buildGoogleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

type NewPlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  reviews?: Array<{ text?: { text?: string }; rating?: number }>;
  editorialSummary?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  priceLevel?: string;
  photos?: Array<{ name?: string }>;
};

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const normalizedId = normalizePlaceId(placeId);
  const query = new URLSearchParams({
    languageCode: "ja",
    regionCode: "JP",
  });
  const url = `${PLACES_BASE_URL}/${encodeURIComponent(normalizedId)}?${query.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: placesHeaders(PLACE_DETAILS_FIELD_MASK),
  });

  const data = (await res.json()) as NewPlaceDetails & {
    error?: { message?: string };
  };

  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    throw new Error(
      `店舗詳細の取得に失敗しました (${normalizedId}): ${detail}`
    );
  }

  const weekday = data.regularOpeningHours?.weekdayDescriptions;
  const category =
    data.primaryTypeDisplayName?.text ??
    (data.types?.length ? data.types.join(", ") : "");

  return {
    placeId: normalizedId,
    name: data.displayName?.text ?? "",
    address: data.formattedAddress ?? "",
    rating: data.rating ?? null,
    reviewCount: data.userRatingCount ?? null,
    regularOpeningHours: formatOpeningHours(weekday),
    closedDays: detectClosedDays(weekday),
    phoneNumber: data.nationalPhoneNumber ?? "",
    internationalPhoneNumber: data.internationalPhoneNumber ?? "",
    websiteUrl: data.websiteUri ?? "",
    googleMapsUrl: data.googleMapsUri ?? buildGoogleMapsUrl(normalizedId),
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
    businessStatus: formatBusinessStatus(data.businessStatus),
    category,
    primaryType: data.primaryType ?? "",
    reviewsText: formatReviewsText(data.reviews),
    editorialSummary: data.editorialSummary?.text ?? "",
    priceLevel: formatPriceLevel(data.priceLevel),
    photoNames: formatPhotoNames(data.photos),
  };
}

export function toPlaceSearchResult(d: PlaceDetails): import("@/lib/types").PlaceSearchResult {
  return {
    placeId: d.placeId,
    name: d.name,
    address: d.address,
    phoneNumber: d.phoneNumber,
    email: "-",
    websiteUrl: d.websiteUrl,
    googleMapsUrl: d.googleMapsUrl,
    rating: d.rating,
    reviewCount: d.reviewCount,
    reviewsText: d.reviewsText,
    regularOpeningHours: d.regularOpeningHours,
    closedDays: d.closedDays,
    category: d.category,
    businessStatus: d.businessStatus,
    primaryType: d.primaryType,
    internationalPhoneNumber: d.internationalPhoneNumber,
    editorialSummary: d.editorialSummary,
    latitude: d.latitude,
    longitude: d.longitude,
    priceLevel: d.priceLevel,
    photoNames: d.photoNames,
  };
}
