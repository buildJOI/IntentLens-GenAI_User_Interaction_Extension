import { describe, expect, it } from "vitest";
import { mapPointToElement, type ElementGeometry } from "./elements.js";
import { computeSessionMetrics } from "./metrics.js";
import { createEvent, gaze } from "../testkit.js";

describe("mapPointToElement", () => {
  const viewport = { width: 100, height: 100 };
  const a: ElementGeometry = {
    elementId: "a",
    category: "button",
    box: { x: 0, y: 0, width: 50, height: 50 },
    visible: true,
    zIndex: 1
  };
  const b: ElementGeometry = {
    elementId: "b",
    category: "link",
    box: { x: 10, y: 10, width: 10, height: 10 },
    visible: true,
    zIndex: 2
  };

  it("prefers higher z-index then smaller area", () => {
    expect(mapPointToElement({ x: 12, y: 12 }, viewport, [a, b])?.elementId).toBe("b");
  });

  it("ignores off-screen points and invisible boxes", () => {
    expect(mapPointToElement({ x: 200, y: 10 }, viewport, [a])).toBeUndefined();
    expect(
      mapPointToElement({ x: 12, y: 12 }, viewport, [{ ...a, visible: false }])
    ).toBeUndefined();
  });
});

describe("computeSessionMetrics", () => {
  it("computes dwell from consecutive samples and uses mapped samples as share denominator", () => {
    const events = [
      gaze(0, "btn"),
      gaze(100, "btn"),
      gaze(200, "btn"),
      gaze(300, "link", { elementCategory: "link" }),
      createEvent("gaze_sample", {
        eventId: "unmapped",
        timestamp: 1_000_400,
        sessionTimeMs: 400,
        quality: { indicator: "low", missingSample: false, calibrationStatus: "completed_unvalidated" }
      }),
      createEvent("gaze_sample", {
        eventId: "missing",
        timestamp: 1_000_500,
        sessionTimeMs: 500,
        quality: { indicator: "low", missingSample: true, calibrationStatus: "degraded" }
      }),
      createEvent("click", { eventId: "c1", elementId: "btn", timestamp: 1_000_600, sessionTimeMs: 600 })
    ];
    const metrics = computeSessionMetrics("ses_test", events, {
      dwellGapMs: 400,
      expectedGazeIntervalMs: 100
    });
    const btn = metrics.elements.find((e) => e.elementId === "btn");
    expect(btn?.estimatedDwellMs).toBe(200);
    expect(btn?.visits).toBe(1);
    expect(btn?.validGazeSamples).toBe(3);
    expect(btn?.sampleShare).toBe(0.75);
    expect(metrics.validGazeSamples).toBe(4);
    expect(metrics.unmappedGazeSamples).toBe(1);
    expect(metrics.missingGazeSamples).toBe(1);
    expect(metrics.dataCoverage).toBeGreaterThan(0);
    expect(btn?.clickCount).toBe(1);
  });

  it("starts a new visit after a dwell gap", () => {
    const events = [gaze(0, "btn"), gaze(100, "btn"), gaze(2000, "btn")];
    const metrics = computeSessionMetrics("ses_test", events, {
      dwellGapMs: 400,
      expectedGazeIntervalMs: 100
    });
    expect(metrics.elements[0].visits).toBe(2);
  });
});
