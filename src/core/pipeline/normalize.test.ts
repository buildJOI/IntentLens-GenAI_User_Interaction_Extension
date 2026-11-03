import { describe, expect, it } from "vitest";
import { detectGaps, normalizeEvents } from "./normalize.js";
import { createEvent, gaze } from "../testkit.js";

describe("normalizeEvents", () => {
  it("orders by timestamp then eventId", () => {
    const seen = new Set<string>();
    const result = normalizeEvents(
      [
        createEvent("click", { eventId: "b", timestamp: 2, sessionTimeMs: 2 }),
        createEvent("click", { eventId: "a", timestamp: 1, sessionTimeMs: 1 }),
        createEvent("click", { eventId: "c", timestamp: 1, sessionTimeMs: 1 })
      ],
      seen
    );
    expect(result.accepted.map((e) => e.eventId)).toEqual(["a", "c", "b"]);
  });

  it("drops duplicates by eventId", () => {
    const seen = new Set<string>();
    const first = normalizeEvents([createEvent("click", { eventId: "x" })], seen);
    const second = normalizeEvents([createEvent("click", { eventId: "x" })], seen);
    expect(first.accepted).toHaveLength(1);
    expect(second.duplicatesDropped).toBe(1);
    expect(second.accepted).toHaveLength(0);
  });

  it("records invalid events without swallowing the reason", () => {
    const result = normalizeEvents([{ eventId: "bad" }], new Set());
    expect(result.rejected[0]?.eventId).toBe("bad");
    expect(result.rejected[0]?.reason.length).toBeGreaterThan(0);
  });
});

describe("detectGaps", () => {
  it("flags missing gaze samples from large timestamp gaps", () => {
    const events = [gaze(0, "a"), gaze(100, "a"), gaze(2500, "a")];
    const gaps = detectGaps(events, 100);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapMs).toBe(2400);
  });
});
