import { z } from "zod";

export const recommendationInputSchema = z.object({
  restaurant: z.string().min(1),
  city: z.string().optional(),
  area: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
  googleMapsUrl: z.string().nullable().optional(),
  locationStatus: z
    .enum(["resolved_from_link", "resolved_from_places", "manual", "needs_lookup", "ambiguous"])
    .optional(),
  locationConfidence: z.number().min(0).max(1).optional(),
  dishes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().nullable().optional(),
  sourceHash: z.string().optional(),
  sourceType: z.enum(["whatsapp_zip", "snippet", "manual"]).optional(),
  sourceDate: z.string().nullable().optional(),
  rawRefLabel: z.string().nullable().optional(),
});

export const importPayloadSchema = z.object({
  inputName: z.string().min(1),
  inputHash: z.string().min(1),
  model: z.string().optional(),
  parsedMessageCount: z.number().int().min(0).default(0),
  recommendations: z.array(recommendationInputSchema),
});

export const locationResolvePayloadSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
  })
  .default({ limit: 25 });
