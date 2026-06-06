import { readFile } from "fs/promises";
import JSZip from "jszip";

export type WhatsAppMessage = {
  timestamp: Date;
  sender: string;
  body: string;
  lineStart: number;
  lineEnd: number;
};

export type WhatsAppDateOrder = "day-first" | "month-first";

const timestampPattern =
  /^\s*\[?(?<date>\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(?<time>\d{1,2}:\d{2}(?::\d{2})?)\s*(?<ampm>[AP]M|[ap]m)?\]?\s*-?\s*~?\s*(?<sender>[^:]+):\s*(?<body>.*)$/u;

export function stripWhatsAppControls(text: string): string {
  return text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\u202f/g, " ");
}

export function detectWhatsAppDateOrder(text: string): WhatsAppDateOrder {
  const cleaned = stripWhatsAppControls(text);
  const matches = cleaned.matchAll(
    /^\s*\[?(?<first>\d{1,2})\/(?<second>\d{1,2})\/(?<year>\d{2,4}),\s*\d{1,2}:\d{2}/gmu,
  );
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;

  for (const match of matches) {
    const first = Number(match.groups?.first);
    const second = Number(match.groups?.second);
    if (first > 12 && second <= 12) dayFirstEvidence += 1;
    if (second > 12 && first <= 12) monthFirstEvidence += 1;
  }

  return monthFirstEvidence > dayFirstEvidence ? "month-first" : "day-first";
}

export function parseWhatsAppText(
  text: string,
  options: { dateOrder?: WhatsAppDateOrder } = {},
): WhatsAppMessage[] {
  const cleaned = stripWhatsAppControls(text);
  const dateOrder = options.dateOrder ?? detectWhatsAppDateOrder(cleaned);
  const lines = cleaned.split(/\r?\n/);
  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  lines.forEach((line, index) => {
    const match = line.match(timestampPattern);
    if (match?.groups) {
      const nested = match.groups.body.match(timestampPattern);
      const groups = nested?.groups ?? match.groups;
      const timestamp = parseWhatsAppDate(groups.date, groups.time, groups.ampm, dateOrder);
      if (!timestamp) return;
      if (current) messages.push(current);
      current = {
        timestamp,
        sender: groups.sender.trim(),
        body: groups.body.trim(),
        lineStart: index + 1,
        lineEnd: index + 1,
      };
      return;
    }

    if (current) {
      current.body = `${current.body}\n${line}`.trim();
      current.lineEnd = index + 1;
    }
  });

  if (current) messages.push(current);
  return messages;
}

export function sortMessagesChronologically(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return [...messages].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

/** Canonical pipeline order: WhatsApp export file/line order (B2). */
export function messagesInFileOrder(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return [...messages].sort((left, right) => left.lineStart - right.lineStart);
}

export function messageGapMs(left: WhatsAppMessage, right: WhatsAppMessage): number {
  const gap = right.timestamp.getTime() - left.timestamp.getTime();
  if (!Number.isFinite(gap) || gap < 0) return 0;
  return gap;
}

export function indexMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return messagesInFileOrder(messages);
}

export function clusterMessages(messages: WhatsAppMessage[], windowHours = 8): WhatsAppMessage[][] {
  const sorted = sortMessagesChronologically(messages);
  const clusters: WhatsAppMessage[][] = [];
  const maxGap = windowHours * 60 * 60 * 1000;

  for (const message of sorted) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || message.timestamp.getTime() - previous.timestamp.getTime() > maxGap) {
      clusters.push([message]);
      continue;
    }

    current.push(message);
  }

  return clusters;
}

export async function readWhatsAppInput(path: string): Promise<string> {
  const buffer = await readFile(path);
  if (path.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buffer);
    const entry = zip.file("_chat.txt") ?? zip.file(/_chat\.txt$/i)[0];
    if (!entry) throw new Error("No _chat.txt file found in WhatsApp zip");
    return entry.async("string");
  }

  return buffer.toString("utf8");
}

function parseWhatsAppDate(
  date: string,
  time: string,
  ampm: string | undefined,
  dateOrder: WhatsAppDateOrder,
): Date | null {
  const [firstDatePart, secondDatePart, rawYear] = date.split("/").map(Number);
  const day = dateOrder === "day-first" ? firstDatePart : secondDatePart;
  const month = dateOrder === "day-first" ? secondDatePart : firstDatePart;
  const [rawHour, minute, second = 0] = time.split(":").map(Number);
  const suffix = ampm?.toUpperCase();
  const hour =
    suffix === "PM" && rawHour < 12 ? rawHour + 12 : suffix === "AM" && rawHour === 12 ? 0 : rawHour;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!isValidDateParts(year, month, day, hour, minute, second)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }
  return parsed;
}

function isValidDateParts(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    Number.isInteger(second) &&
    year >= 2000 &&
    year <= 2099 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31 &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}
