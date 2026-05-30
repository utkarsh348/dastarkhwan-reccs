import { CityMap } from "@/components/CityMap";
import { CityViewTabs } from "@/components/CityViewTabs";
import { safeGetMapRecommendations, safeListRecommendations } from "@/lib/public-data";

export default async function CityMapPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params;
  const [mapData, listData] = await Promise.all([
    safeGetMapRecommendations(citySlug),
    safeListRecommendations({ city: citySlug, limit: 500 }),
  ]);
  const cityName = listData.data.recommendations[0]?.city ?? (citySlug === "unsorted" ? "Unsorted" : citySlug);
  const unmapped = listData.data.recommendations.filter(
    (item) => typeof item.latitude !== "number" || typeof item.longitude !== "number",
  );

  return (
    <main className="page-shell" data-testid="city-map-page">
      <section className="page-header hero-header">
        <p className="eyebrow">City map</p>
        <h1>{cityName}</h1>
        <CityViewTabs active="map" citySlug={citySlug} />
        <p className="hero-copy">
          {mapData.data.length} of {listData.data.recommendations.length} places are on the map.
        </p>
      </section>

      {mapData.error ? <p className="notice">{mapData.error}</p> : null}
      <CityMap recommendations={mapData.data} />

      {unmapped.length ? (
        <section className="page-header">
          <p className="eyebrow">Not on the map yet</p>
          <p className="hero-copy">
            We couldn&apos;t place {unmapped.length}{" "}
            {unmapped.length === 1 ? "recommendation" : "recommendations"} on the map yet.
          </p>
        </section>
      ) : null}
    </main>
  );
}
