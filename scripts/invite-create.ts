import { randomBytes } from "crypto";
import { loadEnvConfig } from "@next/env";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";
import { hashInviteCode } from "../src/lib/invites";

loadEnvConfig(process.cwd());

async function main() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to create invite codes.");
  }

  const label = process.argv.find((arg) => arg.startsWith("--label="))?.split("=")[1] ?? "Community invite";
  const maxUses = Number(process.argv.find((arg) => arg.startsWith("--max="))?.split("=")[1] ?? "10");
  const code = randomBytes(4).toString("hex");

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("invite_codes").insert({
    code_hash: hashInviteCode(code),
    label,
    max_uses: Number.isFinite(maxUses) ? maxUses : null,
  });

  if (error) throw error;

  console.log(`Invite created (${label})`);
  console.log(`Code (share once): ${code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
