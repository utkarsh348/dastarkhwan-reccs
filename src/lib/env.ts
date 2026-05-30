export function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getEnv("NEXT_PUBLIC_SUPABASE_URL") && getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}

export function isImportAuthorized(request: Request): boolean {
  const token = getEnv("IMPORT_TOKEN");
  if (!token) return false;
  return request.headers.get("authorization") === `Bearer ${token}`;
}
