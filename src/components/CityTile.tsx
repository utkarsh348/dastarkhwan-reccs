import Link from "next/link";
import type { CitySummary } from "@/lib/types";

export function CityTile({ city }: { city: CitySummary }) {
  return (
    <Link className="city-tile" data-testid="city-tile" href={`/city/${city.citySlug}`}>
      <p className="city-tile-count">
        {city.count} {city.count === 1 ? "note" : "notes"} from the group
      </p>
      <h2>{city.city}</h2>
      {city.mappedCount > 0 ? <p className="city-tile-meta">{city.mappedCount} on the map</p> : null}
    </Link>
  );
}
