import { redeemInviteCode } from "@/lib/invites";
import { getSessionUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { user } = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim();
    if (!code) return Response.json({ error: "Invite code is required." }, { status: 400 });

    const result = await redeemInviteCode(user.id, code);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
