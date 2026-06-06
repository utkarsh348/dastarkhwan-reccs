import { firstName } from "./slug";

const SOURCE_DELIMITER = /\s*(?:,|\/|&|\+|\band\b)\s*/i;

export function formatSourceNames(sourceName: string | null | undefined) {
  if (!sourceName?.trim()) return null;

  const names = sourceName
    .replace(/^recommended by\s+/i, "")
    .split(SOURCE_DELIMITER)
    .map((name) => firstName(name).trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const uniqueNames = names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueNames.length ? uniqueNames.join(", ") : null;
}
