import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "./supabase/admin";
import { getSupabasePublicClient } from "./supabase/public";

/** Server-side data access: service role when available, otherwise public anon + RLS. */
export function getSupabaseServerClient(): SupabaseClient {
  if (isSupabaseAdminConfigured()) return getSupabaseAdminClient();
  return getSupabasePublicClient();
}
