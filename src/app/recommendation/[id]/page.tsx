import Link from "next/link";
import { Button } from "@/components/Button";
import { RecommendationForm } from "@/components/RecommendationForm";
import { getSessionUser } from "@/lib/auth";
import { getDisplayQuote } from "@/lib/display-quote";
import { isContributor } from "@/lib/invites";
import { safeGetRecommendation } from "@/lib/public-data";

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await safeGetRecommendation(id);
  const { user } = await getSessionUser().catch(() => ({ user: null }));
  const contributor = user ? await isContributor(user.id).catch(() => false) : false;
  const quote = data ? getDisplayQuote(data) : null;
  const note = data?.note ?? data?.snippet ?? null;
  const location = data ? [data.area, data.city].filter(Boolean).join(" / ") : null;

  return (
    <main className="page-shell" data-testid="recommendation-page">
      <section className="page-header hero-header">
        <Link className="text-link" href={data ? `/city/${data.citySlug}` : "/"}>
          Back to {data?.city ?? "recommendations"}
        </Link>
        <p className="eyebrow">Recommendation</p>
        {error ? <p className="notice">{error}</p> : null}
      </section>

      {data ? (
        <>
          <section className="detail-layout">
            <article className="detail-card">
              <div className="detail-kicker">
                <p className="detail-meta rec-location">{location || data.city}</p>
              </div>
              <h1 className="detail-title">{data.restaurant}</h1>
              {data.cuisineSummary ? <p className="rec-cuisine">{data.cuisineSummary}</p> : null}

              {quote ? <blockquote className="rec-quote">{quote}</blockquote> : null}

              {note ? (
                <section className="detail-block">
                  <h2>Community note</h2>
                  <p className="body-copy">{note}</p>
                </section>
              ) : null}
            </article>

            <aside className="detail-side">
              <p className="eyebrow">From the archive</p>
              <p>
                {data.sourceName ? `Recommended by ${data.sourceName}.` : "Recommended by the Dastarkhwan community."}
              </p>
              <Button href={`/city/${data.citySlug}`} variant="secondary">
                Browse {data.city}
              </Button>
              {data.googleMapsUrl ? (
                <Button href={data.googleMapsUrl} variant="ghost">
                  Open maps
                </Button>
              ) : null}
            </aside>
          </section>

          {contributor ? (
            <section className="section-block">
              <div>
                <p className="eyebrow">Edit</p>
                <h2 className="section-title">Keep this note accurate</h2>
              </div>
              <RecommendationForm recommendation={data} />
            </section>
          ) : (
            <p className="notice">
              {user ? (
                <>
                  Redeem your <Link className="text-link" href={`/join?next=/recommendation/${id}`}>invite code</Link>{" "}
                  to edit this note.
                </>
              ) : (
                <>
                  <Link className="text-link" href={`/login?next=/recommendation/${id}`}>Sign in</Link> and use an
                  invite code to edit.
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
