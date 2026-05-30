import { isContributor } from "./invites";
import { createSupabaseServerClient } from "./supabase/server";

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireContributorSession() {
  const { supabase, user } = await getSessionUser();
  if (!user) return { error: unauthorized("Sign in required.") };
  if (!(await isContributor(user.id))) return { error: forbidden("Redeem an invite code to add recommendations.") };
  return { supabase, user };
}

function unauthorized(message: string) {
  return Response.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return Response.json({ error: message }, { status: 403 });
}
