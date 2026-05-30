import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

let client: SupabaseClient | null = null;

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(getEnv("NEXT_PUBLIC_SUPABASE_URL") && getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (client) return client;

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY.");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
