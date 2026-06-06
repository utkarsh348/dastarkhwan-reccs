import type { PlaceMetadata } from "./place-metadata";

const FOOD_PLACE_TYPES = new Set([
  "restaurant",
  "food",
  "cafe",
  "bakery",
  "bar",
  "meal_takeaway",
  "meal_delivery",
  "food_court",
  "ice_cream_shop",
  "dessert_shop",
  "coffee_shop",
  "tea_house",
  "sandwich_shop",
  "pizza_restaurant",
  "hamburger_restaurant",
  "brunch_restaurant",
  "buffet_restaurant",
  "confectionery",
]);

const KNOWN_CITY_ALIASES: Array<[RegExp, string]> = [
  [/\bbengaluru\b|\bbangalore\b/i, "Bengaluru"],
  [/\bahmedabad\b/i, "Ahmedabad"],
  [/\bkolkata\b|\bcalcutta\b/i, "Kolkata"],
  [/\bjaipur\b/i, "Jaipur"],
  [/\bmumbai\b|\bbombay\b/i, "Mumbai"],
  [/\bamritsar\b/i, "Amritsar"],
  [/\bsrinagar\b/i, "Srinagar"],
  [/\bambur\b/i, "Ambur"],
  [/\bsomnath\b/i, "Somnath"],
  [/\bayodhya\b|\bfaizabad\b/i, "Faizabad"],
];

export function isFoodPlaceMetadata(metadata: Pick<PlaceMetadata, "types">) {
  return metadata.types.some((type) => FOOD_PLACE_TYPES.has(type) || type.endsWith("_restaurant"));
}

export function detectCityFromAddress(address: string | null | undefined) {
  if (!address) return null;
  for (const [pattern, city] of KNOWN_CITY_ALIASES) {
    if (pattern.test(address)) return city;
  }
  return null;
}

export function scorePlaceNameMatch(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const matched = leftTokens.filter((token) =>
    rightTokens.some((rightToken) => tokenMatches(token, rightToken)),
  ).length;
  return matched / leftTokens.length;
}

function tokenMatches(left: string, right: string) {
  if (left === right || collapseRepeatedVowels(left) === collapseRepeatedVowels(right)) return true;
  if (left.length > 3 && right.length > 3 && (left.includes(right) || right.includes(left))) return true;
  return levenshteinDistance(left, right) <= 1;
}

function collapseRepeatedVowels(value: string) {
  return value.replace(/([aeiou])\1+/g, "$1");
}

function tokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "cafe",
  "restaurant",
  "hotel",
  "ki",
  "ka",
  "of",
  "bangalore",
  "bengaluru",
  "ahmedabad",
  "kolkata",
  "jaipur",
  "mumbai",
  "amritsar",
  "srinagar",
  "ambur",
]);

function levenshteinDistance(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}
