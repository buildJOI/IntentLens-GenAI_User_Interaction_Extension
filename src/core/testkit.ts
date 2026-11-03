import { EVENT_SCHEMA_VERSION, type EventType, type IntentEvent } from "./schema/events.js";

export function createEvent(
  type: EventType,
  overrides: Partial<IntentEvent> = {}
): IntentEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId: "ses_test",
    eventId: overrides.eventId ?? `evt_${type}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: 1_000_000,
    sessionTimeMs: 0,
    pageId: "https://example.test/",
    metadata: {},
    ...overrides
  };
}

export function gaze(
  t: number,
  elementId: string,
  extra: Partial<IntentEvent> = {}
): IntentEvent {
  return createEvent("gaze_sample", {
    eventId: `evt_gaze_${t}_${elementId}`,
    timestamp: 1_000_000 + t,
    sessionTimeMs: t,
    elementId,
    elementCategory: extra.elementCategory ?? "button",
    coordinates: { x: 10, y: 10 },
    quality: {
      indicator: "medium",
      missingSample: false,
      calibrationStatus: "completed_with_holdout"
    },
    ...extra
  });
}
