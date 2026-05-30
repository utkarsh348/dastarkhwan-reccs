import Link from "next/link";

export function CityViewTabs({ citySlug, active }: { citySlug: string; active: "list" | "map" }) {
  return (
    <div className="view-tabs" role="tablist" aria-label="City view">
      <Link className={active === "list" ? "view-tab is-active" : "view-tab"} href={`/city/${citySlug}`}>
        List
      </Link>
      <Link className={active === "map" ? "view-tab is-active" : "view-tab"} href={`/city/${citySlug}/map`}>
        Map
      </Link>
    </div>
  );
}
