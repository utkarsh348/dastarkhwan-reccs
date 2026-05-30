import { locationResolvePayloadSchema } from "@/lib/api-schemas";
import { getEnv, isImportAuthorized } from "@/lib/env";
import { resolveLocation } from "@/lib/geocode";
import { getPendingLocationRecommendations, updateRecommendation } from "@/lib/recommendations";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isImportAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  if (!apiKey) return Response.json({ error: "GOOGLE_MAPS_SERVER_KEY is not configured" }, { status: 503 });
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is required for location resolve." }, { status: 503 });
  }

  const admin = getSupabaseAdminClient();

  try {
    const payload = locationResolvePayloadSchema.parse(await request.json().catch(() => ({})));
    const pending = await getPendingLocationRecommendations(payload.limit);
    const resolved = [];

    for (const recommendation of pending) {
      const location = await resolveLocation(recommendation, { apiKey });
      const updated = await updateRecommendation(
        recommendation.id,
        {
          ...recommendation,
          ...location,
          updatedBy: "location-resolver",
        },
        admin,
      );
      resolved.push(updated);
    }

    return Response.json({ resolved });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
