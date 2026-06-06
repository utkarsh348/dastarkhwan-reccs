import { CityTile } from "@/components/CityTile";
import { safeListRecommendations } from "@/lib/public-data";

export default async function Home() {
  const { data, error } = await safeListRecommendations({ limit: 1 });
  const cities = [...data.cities].sort((left, right) => left.city.localeCompare(right.city));

  return (
    <main className="page-shell home-page-shell" data-testid="home-page">
      <section className="home-hero">
        <div className="hero-copy-wrap">
          <h1 className="detail-title">The Dastarkhwan notebook</h1>
          <p className="hero-copy">Where we take our loved ones and ...break bread together</p>
        </div>
      </section>

      {error ? <p className="notice">{error}</p> : null}

      <section className="section-block city-section" id="cities">
        {cities.length ? (
          <div className="city-grid">
            {cities.map((city) => (
              <CityTile city={city} key={city.citySlug} />
            ))}
          </div>
        ) : (
          <p className="notice">No cities yet.</p>
        )}
      </section>
    </main>
  );
}
