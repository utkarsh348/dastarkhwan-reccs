import { importPayloadSchema } from "@/lib/api-schemas";
import { isImportAuthorized } from "@/lib/env";
import {
  createRecommendation,
  findRecommendationIdBySourceHash,
  mergeRecommendation,
} from "@/lib/recommendations";
import { importRecommendations } from "@/lib/recommendation-service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isImportAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = importPayloadSchema.parse(await request.json());
    const supabase = getSupabaseAdminClient();

    const result = await importRecommendations(
      { findRecommendationIdBySourceHash, createRecommendation, mergeRecommendation },
      payload.recommendations,
    );

    await supabase.from("import_batches").upsert(
      {
        input_name: payload.inputName,
        input_hash: payload.inputHash,
        model: payload.model,
        status: "imported",
        parsed_message_count: payload.parsedMessageCount,
        candidate_count: payload.recommendations.length,
        inserted_count: result.inserted,
        merged_count: result.merged,
      },
      { onConflict: "input_hash" },
    );

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
