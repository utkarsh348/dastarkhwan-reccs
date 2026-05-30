import Link from "next/link";
import { RecommendationCard } from "@/components/RecommendationCard";
import { RecommendationForm } from "@/components/RecommendationForm";
import { getSessionUser } from "@/lib/auth";
import { isContributor } from "@/lib/invites";
import { safeGetRecommendation } from "@/lib/public-data";

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await safeGetRecommendation(id);
  const { user } = await getSessionUser().catch(() => ({ user: null }));
  const contributor = user ? await isContributor(user.id).catch(() => false) : false;

  return (
    <main className="page-shell" data-testid="recommendation-page">
      <section className="page-header hero-header">
        <p className="eyebrow">Recommendation</p>
        <h1>{data?.restaurant ?? "Recommendation"}</h1>
        {error ? <p className="notice">{error}</p> : null}
      </section>

      {data ? (
        <>
          <RecommendationCard recommendation={data} showEdit={false} />
          {contributor ? (
            <section className="page-header">
              <p className="eyebrow">Edit</p>
              <RecommendationForm recommendation={data} />
            </section>
          ) : (
            <p className="notice">
              {user ? (
                <>
                  Redeem your <Link href={`/join?next=/recommendation/${id}`}>invite code</Link> to edit this note.
                </>
              ) : (
                <>
                  <Link href={`/login?next=/recommendation/${id}`}>Sign in</Link> and use an invite code to edit.
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="notice">Recommendation not found.</p>
      )}
    </main>
  );
}
