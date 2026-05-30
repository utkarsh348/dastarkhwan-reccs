import Link from "next/link";
import { InviteForm } from "@/components/InviteForm";
import { getSessionUser } from "@/lib/auth";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { user } = await getSessionUser().catch(() => ({ user: null }));

  if (!user) {
    return (
      <main className="page-shell" data-testid="join-page">
        <section className="page-header hero-header">
          <p className="eyebrow">Contributor access</p>
          <h1>Sign in first.</h1>
          <p>
            <Link href={`/login?next=${encodeURIComponent("/join")}`}>Sign in</Link> before redeeming your invite.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell" data-testid="join-page">
      <section className="page-header hero-header">
        <p className="eyebrow">Contributor access</p>
        <h1>Enter your invite code.</h1>
        <p>Once redeemed, you can add and edit recommendations.</p>
      </section>
      <InviteForm nextPath={next ?? "/add"} />
    </main>
  );
}
