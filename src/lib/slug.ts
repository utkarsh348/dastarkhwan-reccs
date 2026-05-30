import { createHash } from "crypto";

export function slugify(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unsorted";
}

export function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function stableHash(parts: Array<string | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => (part ?? "").trim().toLowerCase()).join("|"))
    .digest("hex");
}

export function firstName(sender: string): string {
  return sender.replace(/^~/, "").trim().split(/\s+/)[0] || "Unknown";
}
