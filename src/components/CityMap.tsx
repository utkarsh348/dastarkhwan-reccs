"use client";

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDisplayQuote } from "@/lib/display-quote";
import type { Recommendation } from "@/lib/types";

type GoogleWindow = Window & typeof globalThis & { google?: typeof google };

export function CityMap({ recommendations }: { recommendations: Recommendation[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapped = useMemo(
    () =>
      recommendations.filter(
        (item) => typeof item.latitude === "number" && typeof item.longitude === "number",
      ),
    [recommendations],
  );
  const [selected, setSelected] = useState<Recommendation | null>(mapped[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const configError = key ? null : "Google Maps browser key is not configured.";
  const quote = selected ? getDisplayQuote(selected) : null;

  useEffect(() => {
    if (!key) return;
    if (!mapRef.current || mapped.length === 0) return;

    let cancelled = false;

    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = {
          lat: mapped[0]?.latitude ?? 20.5937,
          lng: mapped[0]?.longitude ?? 78.9629,
        };
        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new google.maps.LatLngBounds();
        const markers = mapped.map((recommendation) => {
          const position = { lat: recommendation.latitude!, lng: recommendation.longitude! };
          bounds.extend(position);
          const marker = new google.maps.Marker({
            map,
            position,
            title: recommendation.restaurant,
          });
          marker.addListener("click", () => setSelected(recommendation));
          return marker;
        });
        new MarkerClusterer({ markers, map });
        if (mapped.length > 1) map.fitBounds(bounds, 64);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Unable to load Google Maps.");
      });

    return () => {
      cancelled = true;
    };
  }, [key, mapped]);

  return (
    <section className="map-shell" data-testid="city-map">
      <div className="map-canvas" ref={mapRef}>
        {mapped.length === 0 ? <p>No mapped recommendations yet.</p> : null}
        {configError || error ? <p>{configError ?? error}</p> : null}
      </div>
      <aside className="map-panel">
        {selected ? (
          <>
            <p className="rec-card-meta">
              {[selected.area, selected.city].filter(Boolean).join(" / ")}
            </p>
            <h2>{selected.restaurant}</h2>
            {selected.cuisineSummary ? (
              <p className="rec-cuisine">{selected.cuisineSummary}</p>
            ) : null}
            {quote ? <blockquote className="rec-quote">{quote}</blockquote> : null}
            {selected.googleMapsUrl ? (
              <a className="map-panel-link" href={selected.googleMapsUrl} rel="noreferrer" target="_blank">
                Open in Google Maps
              </a>
            ) : null}
          </>
        ) : (
          <p>Select a marker to see the recommendation.</p>
        )}
      </aside>
    </section>
  );
}

function loadGoogleMaps(key: string) {
  const win = window as GoogleWindow;
  if (win.google?.maps) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key,
    )}&libraries=marker&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
}
