import { getMapRecommendations } from "@/lib/recommendations";

export async function GET(_request: Request, context: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await context.params;
  try {
    const recommendations = await getMapRecommendations(citySlug);
    return Response.json({ recommendations });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
