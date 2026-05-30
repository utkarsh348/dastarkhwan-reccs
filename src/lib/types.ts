export type LocationStatus =
  | "resolved_from_link"
  | "resolved_from_places"
  | "manual"
  | "needs_lookup"
  | "ambiguous";

export type Recommendation = {
  id: string;
  restaurant: string;
  restaurantSlug: string;
  city: string;
  citySlug: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  locationStatus: LocationStatus;
  locationConfidence: number;
  dishes: string[];
  tags: string[];
  cuisineSummary: string | null;
  note: string | null;
  snippet: string | null;
  sourceName: string | null;
  confidence: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecommendationInput = {
  restaurant: string;
  city?: string;
  area?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  locationStatus?: LocationStatus;
  locationConfidence?: number;
  dishes?: string[];
  tags?: string[];
  cuisineSummary?: string | null;
  note?: string | null;
  snippet?: string | null;
  sourceName?: string | null;
  confidence?: number;
  createdBy?: string;
  updatedBy?: string | null;
  sourceHash?: string;
  sourceType?: "whatsapp_zip" | "snippet" | "manual";
  sourceDate?: string | null;
  rawRefLabel?: string | null;
};

export type CitySummary = {
  city: string;
  citySlug: string;
  count: number;
  mappedCount: number;
};
