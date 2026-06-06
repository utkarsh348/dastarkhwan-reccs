import Link from "next/link";
import type { CitySummary } from "@/lib/types";

export function CityTile({ city }: { city: CitySummary }) {
  return (
    <Link className="city-tile" data-testid="city-tile" href={`/city/${city.citySlug}`}>
      <div className="city-tile-name">
        <h2>{city.city}</h2>
      </div>
      <p className="city-tile-count">
        {city.count} {city.count === 1 ? "place" : "places"} to visit
      </p>
    </Link>
  );
}
