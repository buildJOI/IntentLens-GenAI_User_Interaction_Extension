import { z } from "zod";
import {
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  type IntentEvent
} from "./events.js";

const qualitySchema = z.object({
  indicator: z.enum(["high", "medium", "low", "unknown"]),
  missingSample: z.boolean(),
  calibrationStatus: z.enum([
    "not_started",
    "in_progress",
    "completed_unvalidated",
    "completed_with_holdout",
    "degraded",
    "failed",
    "denied"
  ]),
  sampleIntervalMs: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional()
});

export const intentEventSchema: z.ZodType<IntentEvent> = z.object({
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  eventId: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  timestamp: z.number().finite(),
  sessionTimeMs: z.number().nonnegative(),
  pageId: z.string().min(1),
  tabId: z.number().int().optional(),
  elementId: z.string().optional(),
  elementSelector: z.string().max(300).optional(),
  elementCategory: z
    .enum([
      "button",
      "link",
      "input",
      "media",
      "heading",
      "text",
      "nav",
      "interactive",
      "unknown"
    ])
    .optional(),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative()
    })
    .optional(),
  coordinates: z
    .object({
      x: z.number(),
      y: z.number()
    })
    .optional(),
  quality: qualitySchema.optional(),
  metadata: z.record(z.unknown())
});

const SENSITIVE_META_KEYS = new Set([
  "value",
  "password",
  "text",
  "innerText",
  "typed",
  "key",
  "code",
  "inputValue",
  "formData"
]);

export function assertNoSensitivePayload(event: IntentEvent): void {
  for (const key of Object.keys(event.metadata)) {
    if (SENSITIVE_META_KEYS.has(key)) {
      throw new Error(`Sensitive metadata key is not allowed: ${key}`);
    }
  }
}

export function parseEvent(input: unknown): IntentEvent {
  const event = intentEventSchema.parse(input);
  assertNoSensitivePayload(event);
  return event;
}

export function isValidEvent(input: unknown): input is IntentEvent {
  const result = intentEventSchema.safeParse(input);
  if (!result.success) return false;
  try {
    assertNoSensitivePayload(result.data);
    return true;
  } catch {
    return false;
  }
}
