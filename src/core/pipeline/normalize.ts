import { parseEvent } from "../schema/validate.js";
import type { IntentEvent } from "../schema/events.js";

export interface NormalizeResult {
  accepted: IntentEvent[];
  rejected: Array<{ reason: string; eventId?: string }>;
  duplicatesDropped: number;
}

export function normalizeEvents(
  inputs: unknown[],
  seenIds: Set<string>
): NormalizeResult {
  const accepted: IntentEvent[] = [];
  const rejected: Array<{ reason: string; eventId?: string }> = [];
  let duplicatesDropped = 0;

  for (const input of inputs) {
    try {
      const event = parseEvent(input);
      if (seenIds.has(event.eventId)) {
        duplicatesDropped += 1;
        continue;
      }
      seenIds.add(event.eventId);
      accepted.push(event);
    } catch (error) {
      const eventId =
        input && typeof input === "object" && "eventId" in input
          ? String((input as { eventId: unknown }).eventId)
          : undefined;
      rejected.push({
        reason: error instanceof Error ? error.message : "invalid event",
        eventId
      });
    }
  }

  accepted.sort(compareEvents);
  return { accepted, rejected, duplicatesDropped };
}

export function compareEvents(a: IntentEvent, b: IntentEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.sessionTimeMs !== b.sessionTimeMs) return a.sessionTimeMs - b.sessionTimeMs;
  return a.eventId.localeCompare(b.eventId);
}

export function detectGaps(
  events: IntentEvent[],
  expectedIntervalMs: number
): Array<{ fromEventId: string; toEventId: string; gapMs: number }> {
  const samples = events
    .filter((e) => e.type === "gaze_sample")
    .sort(compareEvents);
  const gaps: Array<{ fromEventId: string; toEventId: string; gapMs: number }> = [];
  for (let i = 1; i < samples.length; i += 1) {
    const gap = samples[i].timestamp - samples[i - 1].timestamp;
    if (gap > expectedIntervalMs * 2.5) {
      gaps.push({
        fromEventId: samples[i - 1].eventId,
        toEventId: samples[i].eventId,
        gapMs: gap
      });
    }
  }
  return gaps;
}
