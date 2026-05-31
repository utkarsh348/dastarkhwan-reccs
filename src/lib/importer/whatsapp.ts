import { readFile } from "fs/promises";
import JSZip from "jszip";

export type WhatsAppMessage = {
  timestamp: Date;
  sender: string;
  body: string;
  lineStart: number;
  lineEnd: number;
};

const timestampPattern =
  /^\s*\[?(?<date>\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(?<time>\d{1,2}:\d{2}(?::\d{2})?)\s*(?<ampm>[AP]M|[ap]m)?\]?\s*-?\s*~?\s*(?<sender>[^:]+):\s*(?<body>.*)$/u;

export function stripWhatsAppControls(text: string): string {
  return text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\u202f/g, " ");
}

export function parseWhatsAppText(text: string): WhatsAppMessage[] {
  const lines = stripWhatsAppControls(text).split(/\r?\n/);
  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  lines.forEach((line, index) => {
    const match = line.match(timestampPattern);
    if (match?.groups) {
      if (current) messages.push(current);
      const nested = match.groups.body.match(timestampPattern);
      const groups = nested?.groups ?? match.groups;
      current = {
        timestamp: parseWhatsAppDate(groups.date, groups.time, groups.ampm),
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

function parseWhatsAppDate(date: string, time: string, ampm?: string): Date {
  const [day, month, rawYear] = date.split("/").map(Number);
  const [rawHour, minute, second = 0] = time.split(":").map(Number);
  const suffix = ampm?.toUpperCase();
  const hour =
    suffix === "PM" && rawHour < 12 ? rawHour + 12 : suffix === "AM" && rawHour === 12 ? 0 : rawHour;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}
