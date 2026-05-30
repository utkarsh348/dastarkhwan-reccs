import { NextRequest } from "next/server";
import { requireContributorSession } from "@/lib/auth";
import { createRecommendation, listRecommendations } from "@/lib/recommendations";
import { recommendationInputSchema } from "@/lib/api-schemas";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await listRecommendations({
      city: params.get("city"),
      q: params.get("q"),
      withLocation: params.get("withLocation") === "true",
      locationStatus: params.get("locationStatus"),
      limit: Number(params.get("limit") ?? 200),
      offset: Number(params.get("offset") ?? 0),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await requireContributorSession();
  if ("error" in session) return session.error;

  try {
    const body = recommendationInputSchema.parse(await request.json());
    const recommendation = await createRecommendation(
      {
        ...body,
        sourceType: "manual",
        locationStatus: body.locationStatus ?? "needs_lookup",
        createdBy: session.user.email ?? session.user.id,
        updatedBy: session.user.email ?? session.user.id,
      },
      session.supabase,
    );
    return Response.json({ recommendation }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
