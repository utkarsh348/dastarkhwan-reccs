import { titleCase } from "../slug";

export type PlaceAnchor = {
  name: string;
  index: number;
  trigger: "called" | "goto";
};

const PLACE_NAME = String.raw`[A-Z][\p{L}\p{N}'& /-]{2,}?`;

export function findPlaceAnchors(body: string): PlaceAnchor[] {
  const anchors: PlaceAnchor[] = [];

  for (const match of body.matchAll(
    new RegExp(String.raw`\bcalled\s+(?<name>${PLACE_NAME})(?=\.|,|\s+I\s|\s+For\s|\s+only|[.!]|$)`, "giu"),
  )) {
    const name = match.groups?.name?.trim();
    if (!name || isNonPlacePhrase(name)) continue;
    anchors.push({ name: normalizePlaceName(name), index: match.index ?? 0, trigger: "called" });
  }

  for (const match of body.matchAll(
    new RegExp(
      String.raw`\b(?:go|visit|head)\s+(?:early\s+morning\s+)?to\s+(?<name>${PLACE_NAME})(?=[.!]|$)`,
      "giu",
    ),
  )) {
    const name = match.groups?.name?.trim();
    if (!name || isNonPlacePhrase(name)) continue;
    anchors.push({ name: normalizePlaceName(name), index: match.index ?? 0, trigger: "goto" });
  }

  return dedupeAnchors(anchors);
}

export function shouldSplitMultiPlace(body: string, anchors: PlaceAnchor[]): boolean {
  if (anchors.length < 2) return false;
  if (body.length < 70) return false;

  const keys = new Set(anchors.map((anchor) => placeKey(anchor.name)));
  return keys.size >= 2;
}

export function splitTopicSegments(body: string): string[] {
  const parts = body.split(/\.\s+For\s+(?=[A-Za-z])/i);
  return parts.map((part, index) => (index === 0 ? part.trim() : `For ${part.trim()}`)).filter(Boolean);
}

export function assignSegmentsToPlaces(
  segments: string[],
  anchors: PlaceAnchor[],
): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  const orderedPlaces = [...anchors].sort((left, right) => left.index - right.index);
  const trailingPlace = orderedPlaces.at(-1);

  segments.forEach((segment, segmentIndex) => {
    const mentioned = orderedPlaces.filter((anchor) => segmentMentionsPlace(segment, anchor.name));
    if (mentioned.length === 1) {
      pushSegment(assignments, mentioned[0].name, segment);
      return;
    }

    const goto = segment.match(
      new RegExp(String.raw`\bto\s+(${PLACE_NAME})(?=[.!]|$)`, "iu"),
    )?.[1];
    if (goto) {
      pushSegment(assignments, normalizePlaceName(goto), segment);
      return;
    }

    if (segmentIndex > 0 && trailingPlace) {
      pushSegment(assignments, trailingPlace.name, segment);
    }
  });

  return assignments;
}

export function buildPlaceNote(segments: string[]): string {
  return polishPlaceNote(segments.join(". "));
}

export function extractTrailingPlaceNote(body: string, anchors: PlaceAnchor[]): string | null {
  const trailing = anchors.at(-1);
  const called = anchors.find((anchor) => anchor.trigger === "called");
  if (!trailing || !called) return null;

  const afterCalled = body.slice(called.index);
  const topicBreak = afterCalled.search(/\.\s+For\s+/i);
  if (topicBreak === -1) return null;

  return polishPlaceNote(afterCalled.slice(topicBreak + 2));
}

function polishPlaceNote(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\bdiffernt\b/gi, "different")
    .replace(/\bparimal\s+garde\b/gi, "Parimal Garden")
    .trim();
}

export function normalizePlaceName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (/^parimal\s+garde?$/i.test(cleaned)) return "Parimal Garden";
  if (/^uno\s+pizza$/i.test(cleaned)) return "UNO Pizza";
  return titleCase(cleaned.replace(/[.!?,]+$/, ""));
}

export function placeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function segmentMentionsPlace(segment: string, place: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(place)}\\b`, "i");
  if (pattern.test(segment)) return true;
  if (/^uno\s+pizza$/i.test(place)) return /\buno\s+pizza\b/i.test(segment);
  if (/^parimal\s+garden$/i.test(place)) return /\bparimal\s+gar(?:de|den)\b/i.test(segment);
  return false;
}

function pushSegment(map: Map<string, string[]>, place: string, segment: string) {
  const key = normalizePlaceName(place);
  const existing = map.get(key) ?? [];
  existing.push(segment);
  map.set(key, existing);
}

function dedupeAnchors(anchors: PlaceAnchor[]): PlaceAnchor[] {
  const seen = new Set<string>();
  const result: PlaceAnchor[] = [];
  for (const anchor of anchors.sort((left, right) => left.index - right.index)) {
    const key = placeKey(anchor.name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(anchor);
  }
  return result;
}

function isNonPlacePhrase(value: string): boolean {
  return /^(this|that|it|them|their|the|a|an)\b/i.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMultiPlaceAssignments(body: string): Map<string, string> | null {
  const normalized = body.replace(/\s+/g, " ").trim();
  const anchors = findPlaceAnchors(normalized);
  if (!shouldSplitMultiPlace(normalized, anchors)) return null;

  const segments = splitTopicSegments(normalized);
  const grouped = assignSegmentsToPlaces(segments, anchors);
  if (grouped.size < 2) return null;

  const notes = new Map<string, string>();
  for (const [place, placeSegments] of grouped) {
    const note = buildPlaceNote(placeSegments);
    if (note.length >= 12) notes.set(place, note);
  }

  const trailing = orderedPlaceNames(anchors).at(-1);
  const tailNote = trailing ? extractTrailingPlaceNote(normalized, anchors) : null;
  if (trailing && tailNote && (!notes.get(trailing) || tailNote.length > (notes.get(trailing)?.length ?? 0))) {
    notes.set(trailing, tailNote);
  }

  return notes.size >= 2 ? notes : null;
}

function orderedPlaceNames(anchors: PlaceAnchor[]) {
  return [...anchors]
    .sort((left, right) => left.index - right.index)
    .map((anchor) => normalizePlaceName(anchor.name));
}

export type MultiPlaceCandidateInput = {
  restaurant: string;
  dishes?: string[];
  tags?: string[];
  note: string;
};

export function multiPlaceInputsFromBody(body: string): MultiPlaceCandidateInput[] | null {
  const assignments = extractMultiPlaceAssignments(body);
  if (!assignments) return null;

  return [...assignments.entries()].map(([restaurant, note]) => ({
    restaurant,
    note,
    dishes: inferDishesFromNote(note),
    tags: inferTagsFromNote(note),
  }));
}

function inferDishesFromNote(note: string): string[] {
  const lower = note.toLowerCase();
  const dishes: string[] = [];
  if (/calzone/i.test(lower)) dishes.push("calzone");
  if (/pizza/i.test(lower) && /uno/i.test(lower)) dishes.push("pizza");
  if (/poha/i.test(lower)) dishes.push("poha");
  return dishes;
}

function inferTagsFromNote(note: string): string[] {
  const lower = note.toLowerCase();
  const tags: string[] = [];
  if (/breakfast|morning/i.test(lower)) tags.push("breakfast");
  if (/pizza|calzone/i.test(lower)) tags.push("pizza");
  if (/college/i.test(lower)) tags.push("nostalgia");
  return tags;
}
