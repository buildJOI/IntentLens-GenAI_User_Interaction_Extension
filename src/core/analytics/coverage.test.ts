import { describe, expect, it } from "vitest";
import { computeSessionMetrics } from "./metrics.js";
import { createEvent, gaze } from "../testkit.js";

describe("coverage handling", () => {
  it("does not treat unmapped or missing samples as element attention", () => {
    const events = [
      gaze(0, "a"),
      createEvent("gaze_sample", {
        eventId: "miss",
        timestamp: 1_000_100,
        sessionTimeMs: 100,
        quality: { indicator: "low", missingSample: true, calibrationStatus: "degraded" }
      }),
      createEvent("gaze_sample", {
        eventId: "off",
        timestamp: 1_000_200,
        sessionTimeMs: 200,
        quality: { indicator: "medium", missingSample: false, calibrationStatus: "completed_unvalidated" }
      })
    ];
    const metrics = computeSessionMetrics("ses_test", events, {
      dwellGapMs: 400,
      expectedGazeIntervalMs: 100
    });
    expect(metrics.validGazeSamples).toBe(1);
    expect(metrics.unmappedGazeSamples).toBe(1);
    expect(metrics.missingGazeSamples).toBe(1);
    expect(metrics.elements[0].sampleShare).toBe(1);
    expect(metrics.dataCoverage).toBeLessThanOrEqual(1);
  });
});
