import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

let client: SupabaseClient | null = null;

export function getSupabasePublicClient(): SupabaseClient {
  if (client) return client;

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Supabase public client is not configured.");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
