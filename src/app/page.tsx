import { CityTile } from "@/components/CityTile";
import { RecommendationCard } from "@/components/RecommendationCard";
import { safeListRecommendations } from "@/lib/public-data";

export default async function Home() {
  const { data, error } = await safeListRecommendations({ limit: 12 });
  return (
    <main className="page-shell" data-testid="home-page">
      <section className="page-header hero-header">
        <h1>From Dastarkhwan: tried and tasted</h1>
      </section>

      {error ? <p className="notice">{error}</p> : null}

      <section className="city-grid">
        {data.cities.map((city) => (
          <CityTile city={city} key={city.citySlug} />
        ))}
      </section>

      {data.recommendations.length ? (
        <section>
          <h2 className="section-title">Recent notes</h2>
          <div className="rec-masonry">
            {data.recommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        </section>
      ) : (
        <p className="notice">No recommendations yet. Seed the importer or add the first one manually.</p>
      )}
    </main>
  );
}
