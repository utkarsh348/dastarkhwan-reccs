import {
  derivePlaceLabels,
  formatCuisineSummary,
  type PlaceMetadata,
} from "./place-metadata";

const GENERIC_FAMOUS_TERMS = new Set([
  "curries",
  "curry",
  "beverages",
  "beverage",
  "restaurant",
  "food",
  "drinks",
  "dining",
  "eatery",
  "shop",
  "meals",
]);

const TESTIMONIAL_SIGNALS =
  /\b(I|I've|I'm|I'd|Ill|my|we|our|me|you|your|they|their|this place|that place|please go|must try|love|loved|awesome|amazing|recommend|vibey|kickass|had in|I've had|i've had|when I|used to|thank you|definitely try|don't miss|do not miss|sounds cliched|more of a hangout)\b/i;

const REQUEST_CONTEXT_SIGNALS =
  /\b(recommendations?|reccos?|recos?|looking for|around|near|lunch|dinner|breakfast|friends visiting|with friends|date night|price no bar|open to any|outdoor seating|places?\s+(?:for|to|with)|excellent lunch|cake around|bakery\/cake|vegetarian food places|ambience\s+\+?\s*good food)\b/i;

export function isTestimonialLikeCuisineSummary(summary: string | null | undefined): boolean {
  if (!summary?.trim()) return false;

  const text = summary.trim();
  const knownForCore = text.replace(/^Known for\s+/i, "").trim();

  if (TESTIMONIAL_SIGNALS.test(text)) return true;
  if (/\b(best|worst|favourite|favorite)\b/i.test(knownForCore) && knownForCore.split(/\s+/).length > 4) {
    return true;
  }
  if (/\bin\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*$/i.test(knownForCore)) return true;
  if (/[.!?]/.test(knownForCore)) return true;
  if (knownForCore.split(/\s+/).length > 8) return true;

  return false;
}

export function isRequestContextCuisineSummary(summary: string | null | undefined): boolean {
  if (!summary?.trim()) return false;

  const text = summary.trim();
  if (/^Known for\b/i.test(text)) return false;

  const parts = splitSummaryParts(text);
  if (parts.length > 1 && parts.every((part) => part.split(/\s+/).length <= 3)) return false;
  return REQUEST_CONTEXT_SIGNALS.test(text);
}

export function isWeakGenericCuisineSummary(summary: string | null | undefined): boolean {
  if (!summary?.trim()) return false;

  const parts = splitSummaryParts(summary)
    .map((part) => part.replace(/^Known for\s+/i, "").trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) return true;

  const onlyGeneric = parts.every((part) => {
    const terms = part.split(/\s*&\s*|\s+and\s+/i).map((term) => term.trim());
    return terms.every((term) => GENERIC_FAMOUS_TERMS.has(term) || term.length < 3);
  });

  return onlyGeneric;
}

export function isValidCuisineSummary(summary: string | null | undefined): boolean {
  if (!summary?.trim()) return false;
  if (isTestimonialLikeCuisineSummary(summary)) return false;
  if (isRequestContextCuisineSummary(summary)) return false;
  if (isWeakGenericCuisineSummary(summary)) return false;
  return true;
}

export function cuisineSummaryOverlapsTestimonial(
  summary: string | null | undefined,
  note: string | null | undefined,
  snippet: string | null | undefined,
): boolean {
  if (!summary?.trim()) return false;

  const testimonial = [note, snippet]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();
  if (!testimonial) return false;

  const core = summary
    .replace(/^Known for\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (core.length < 12) return false;

  if (testimonial.includes(core)) return true;

  const longTokens = core.split(/\s+/).filter((token) => token.length > 5);
  if (longTokens.length >= 3 && longTokens.every((token) => testimonial.includes(token))) {
    return true;
  }

  return false;
}

export function typesOnlyCuisineSummary(metadata: PlaceMetadata): string | null {
  const labels = derivePlaceLabels(metadata).slice(0, 3);
  if (!labels.length) return null;
  return dedupeSummaryParts(labels.join(" · "));
}

export function buildCuisineSummary(metadata: PlaceMetadata): string | null {
  const candidates = [
    formatCuisineSummary(metadata),
    typesOnlyCuisineSummary(metadata),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => dedupeSummaryParts(value));

  for (const candidate of candidates) {
    if (isValidCuisineSummary(candidate)) return candidate;
  }

  return null;
}

function dedupeSummaryParts(summary: string) {
  const parts = splitSummaryParts(summary).map((part) => part.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const part of parts) {
    const key = part
      .toLowerCase()
      .replace(/^known for\s+/, "")
      .replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  return unique.join(" · ");
}

export function repairCuisineSummary(
  current: string | null | undefined,
  metadata: PlaceMetadata,
  testimonial?: { note?: string | null; snippet?: string | null },
): string | null {
  const rebuilt = buildCuisineSummary(metadata);

  if (
    current &&
    isValidCuisineSummary(current) &&
    !cuisineSummaryOverlapsTestimonial(current, testimonial?.note, testimonial?.snippet)
  ) {
    return current.trim();
  }

  return rebuilt && isValidCuisineSummary(rebuilt) ? rebuilt : null;
}

export type CuisineSummaryIssue = {
  code: "testimonial" | "request_context" | "weak_generic" | "overlaps_note" | "missing";
  message: string;
};

export function auditCuisineSummary(input: {
  cuisineSummary: string | null;
  note: string | null;
  snippet: string | null;
}): CuisineSummaryIssue[] {
  const issues: CuisineSummaryIssue[] = [];
  const { cuisineSummary, note, snippet } = input;

  if (!cuisineSummary?.trim()) {
    issues.push({ code: "missing", message: "No cuisine line" });
    return issues;
  }

  if (isTestimonialLikeCuisineSummary(cuisineSummary)) {
    issues.push({ code: "testimonial", message: "Reads like a review quote, not a place descriptor" });
  }
  if (isRequestContextCuisineSummary(cuisineSummary)) {
    issues.push({ code: "request_context", message: "Reads like request context, not a place descriptor" });
  }
  if (isWeakGenericCuisineSummary(cuisineSummary)) {
    issues.push({ code: "weak_generic", message: "Too generic to be useful" });
  }
  if (cuisineSummaryOverlapsTestimonial(cuisineSummary, note, snippet)) {
    issues.push({ code: "overlaps_note", message: "Duplicates the testimonial text" });
  }

  return issues;
}

function splitSummaryParts(summary: string) {
  return summary.split(/\s*(?:·|\u00c2·)\s*/).map((part) => part.trim()).filter(Boolean);
}
