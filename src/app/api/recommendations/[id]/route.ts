import { requireContributorSession } from "@/lib/auth";
import { getRecommendation, updateRecommendation } from "@/lib/recommendations";
import { recommendationInputSchema } from "@/lib/api-schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const recommendation = await getRecommendation(id);
    if (!recommendation) return Response.json({ error: "Recommendation not found" }, { status: 404 });
    return Response.json({ recommendation });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireContributorSession();
  if ("error" in session) return session.error;

  const { id } = await context.params;
  try {
    const body = recommendationInputSchema.parse(await request.json());
    const recommendation = await updateRecommendation(
      id,
      {
        ...body,
        updatedBy: session.user.email ?? session.user.id,
      },
      session.supabase,
    );
    return Response.json({ recommendation });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
