"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./Button";
import type { Recommendation } from "@/lib/types";

type Props = {
  recommendation?: Recommendation | null;
};

export function RecommendationForm({ recommendation }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      restaurant: String(form.get("restaurant") ?? ""),
      city: String(form.get("city") ?? "Unsorted"),
      area: optional(form.get("area")),
      address: optional(form.get("address")),
      googleMapsUrl: optional(form.get("googleMapsUrl")),
      dishes: splitList(form.get("dishes")),
      tags: splitList(form.get("tags")),
      note: optional(form.get("note")),
      snippet: optional(form.get("snippet")),
      sourceName: optional(form.get("sourceName")),
      createdBy: optional(form.get("editorName")) ?? "community",
      updatedBy: optional(form.get("editorName")) ?? "community",
      locationStatus: recommendation?.locationStatus ?? "needs_lookup",
    };

    const response = await fetch(
      recommendation ? `/api/recommendations/${recommendation.id}` : "/api/recommendations",
      {
        method: recommendation ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setSubmitting(false);
    if (!response.ok) {
      setStatus(await response.text());
      return;
    }

    const data = await response.json();
    router.push(`/recommendation/${data.recommendation.id}`);
    router.refresh();
  }

  return (
    <form className="form-panel" data-testid="recommendation-form" onSubmit={onSubmit}>
      <label>
        Restaurant
        <input className="text-input" defaultValue={recommendation?.restaurant ?? ""} name="restaurant" required />
      </label>
      <label>
        City
        <input className="text-input" defaultValue={recommendation?.city ?? ""} name="city" required />
      </label>
      <label>
        Area
        <input className="text-input" defaultValue={recommendation?.area ?? ""} name="area" />
      </label>
      <label>
        Dishes
        <input className="text-input" defaultValue={recommendation?.dishes.join(", ") ?? ""} name="dishes" />
      </label>
      <label>
        Tags
        <input className="text-input" defaultValue={recommendation?.tags.join(", ") ?? ""} name="tags" />
      </label>
      <label>
        Address
        <input className="text-input" defaultValue={recommendation?.address ?? ""} name="address" />
      </label>
      <label>
        Google Maps link
        <input className="text-input" defaultValue={recommendation?.googleMapsUrl ?? ""} name="googleMapsUrl" />
      </label>
      <label>
        Note
        <textarea className="text-area" defaultValue={recommendation?.note ?? ""} name="note" />
      </label>
      <label>
        Source snippet
        <textarea className="text-area" defaultValue={recommendation?.snippet ?? ""} name="snippet" />
      </label>
      <label>
        Source first name
        <input className="text-input" defaultValue={recommendation?.sourceName ?? ""} name="sourceName" />
      </label>
      <label>
        Your name
        <input className="text-input" name="editorName" required />
      </label>

      {status ? <p className="form-error">{status}</p> : null}
      <Button disabled={submitting} type="submit">
        {submitting ? "Saving..." : "Save recommendation"}
      </Button>
    </form>
  );
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
