import { describe, expect, it } from "vitest";
import { computeSessionMetrics } from "../analytics/metrics.js";
import { detectMismatches } from "./detector.js";
import { DEFAULT_MISMATCH_THRESHOLDS } from "./thresholds.js";
import { createEvent, gaze } from "../testkit.js";

describe("mismatch detector", () => {
  it("flags repeated attention without a click", () => {
    const events = [];
    for (let i = 0; i < 50; i += 1) {
      events.push(gaze(i * 100, i % 3 === 0 ? "other" : "cta", { elementCategory: "button" }));
    }
    const metrics = computeSessionMetrics("ses_test", events);
    const findings = detectMismatches(events, metrics, {
      ...DEFAULT_MISMATCH_THRESHOLDS,
      minSupportedGazeSamples: 10,
      attentionWithoutClickVisits: 2
    });
    expect(findings.some((f) => f.category === "attention_without_click")).toBe(true);
    expect(findings.every((f) => f.interpretation.includes("not evidence of confusion") || f.qualityLimitations.length > 0)).toBe(true);
  });

  it("flags clicks with insufficient gaze coverage", () => {
    const events = [
      createEvent("click", { eventId: "click1", elementId: "ghost", elementCategory: "button" })
    ];
    const metrics = computeSessionMetrics("ses_test", events);
    const findings = detectMismatches(events, metrics);
    expect(findings.some((f) => f.category === "click_without_gaze_coverage")).toBe(true);
  });

  it("flags rapid scroll then region revisit", () => {
    const events = [
      createEvent("scroll_velocity", {
        eventId: "sv1",
        timestamp: 1,
        sessionTimeMs: 1,
        metadata: { velocityPxPerSec: 2400 }
      }),
      createEvent("region_revisit", {
        eventId: "rv1",
        timestamp: 500,
        sessionTimeMs: 500,
        metadata: { regionId: "r3" }
      })
    ];
    const metrics = computeSessionMetrics("ses_test", events);
    const findings = detectMismatches(events, metrics);
    expect(findings.some((f) => f.category === "rapid_scroll_revisit" && f.regionId === "r3")).toBe(true);
  });
});
