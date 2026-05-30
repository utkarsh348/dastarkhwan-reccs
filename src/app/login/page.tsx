import { AuthForm } from "@/components/AuthForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { user } = await getSessionUser().catch(() => ({ user: null }));

  return (
    <main className="page-shell" data-testid="login-page">
      <section className="page-header hero-header">
        <p className="eyebrow">Welcome back</p>
        <h1>{user ? "You are signed in." : "Sign in to add a note."}</h1>
        <p className="hero-copy">
          Browsing stays open to everyone. Sign in only when you want to contribute.
        </p>
      </section>
      {user ? <SignOutButton /> : <AuthForm nextPath={next ?? "/"} />}
    </main>
  );
}
