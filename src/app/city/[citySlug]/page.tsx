import { CityViewTabs } from "@/components/CityViewTabs";
import { RecommendationCard } from "@/components/RecommendationCard";
import { safeListRecommendations } from "@/lib/public-data";

type CityPageProps = {
  params: Promise<{ citySlug: string }>;
};

export default async function CityPage({ params }: CityPageProps) {
  const { citySlug } = await params;
  const { data, error } = await safeListRecommendations({
    city: citySlug,
    limit: 200,
  });
  const cityName = data.recommendations[0]?.city ?? (citySlug === "unsorted" ? "Unsorted" : citySlug);

  return (
    <main className="page-shell" data-testid="city-page">
      <section className="page-header hero-header">
        <p className="eyebrow">City notebook</p>
        <div className="browse-header-row">
          <h1>{cityName}</h1>
          <CityViewTabs active="list" citySlug={citySlug} />
        </div>
      </section>

      {error ? <p className="notice">{error}</p> : null}

      {data.recommendations.length ? (
        <section className="rec-grid">
          {data.recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </section>
      ) : (
        <p className="notice">No recommendations found for this city.</p>
      )}
    </main>
  );
}
