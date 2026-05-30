import { createHash, timingSafeEqual } from "crypto";
import { getEnv, requireEnv } from "./env";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "./supabase/admin";

export function hashInviteCode(code: string): string {
  const salt = requireEnv("INVITE_CODE_SALT");
  return createHash("sha256").update(`${salt}:${code.trim().toLowerCase()}`).digest("hex");
}

export async function isContributor(userId: string): Promise<boolean> {
  if (isSupabaseAdminConfigured()) {
    const { data } = await getSupabaseAdminClient()
      .from("contributors")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }

  const { createSupabaseServerClient } = await import("./supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("contributors").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function redeemInviteCode(userId: string, code: string) {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Invite redemption requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = getSupabaseAdminClient();
  const codeHash = hashInviteCode(code);

  const { data: invite, error } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (error) throw error;
  if (!invite) throw new Error("Invalid invite code.");

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error("This invite code has expired.");
  }

  if (invite.max_uses != null && invite.uses_count >= invite.max_uses) {
    throw new Error("This invite code has reached its usage limit.");
  }

  const { data: existing } = await supabase.from("contributors").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) return { alreadyContributor: true };

  const { error: contributorError } = await supabase.from("contributors").insert({
    user_id: userId,
    invite_code_id: invite.id,
  });
  if (contributorError) throw contributorError;

  await supabase
    .from("invite_codes")
    .update({ uses_count: invite.uses_count + 1 })
    .eq("id", invite.id);

  return { alreadyContributor: false };
}

export function codesMatch(provided: string, expectedHash: string): boolean {
  const providedHash = hashInviteCode(provided);
  const left = Buffer.from(providedHash);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hasInviteSalt(): boolean {
  return Boolean(getEnv("INVITE_CODE_SALT"));
}
