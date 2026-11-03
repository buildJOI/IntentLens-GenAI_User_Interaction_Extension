import { createFindingId } from "../ids.js";
import type { IntentEvent } from "../schema/events.js";
import type { SessionMetrics } from "../analytics/metrics.js";
import {
  DEFAULT_MISMATCH_THRESHOLDS,
  type MismatchThresholds
} from "./thresholds.js";

export type FindingCategory =
  | "attention_without_click"
  | "repeated_visits"
  | "long_attention_to_action"
  | "rapid_scroll_revisit"
  | "click_without_gaze_coverage"
  | "high_missing_rate_region"
  | "low_attention_interactive";

export interface UsabilityFinding {
  findingId: string;
  category: FindingCategory;
  elementId?: string;
  regionId?: string;
  supportingEventIds: string[];
  metrics: Record<string, number>;
  calculation: string;
  qualityLimitations: string[];
  interpretation: string;
  suggestedInvestigation: string;
  sufficientData: boolean;
  confidenceNote: string;
}

export function detectMismatches(
  events: IntentEvent[],
  metrics: SessionMetrics,
  thresholds: MismatchThresholds = DEFAULT_MISMATCH_THRESHOLDS
): UsabilityFinding[] {
  const findings: UsabilityFinding[] = [];
  const sufficientGlobal = metrics.validGazeSamples >= thresholds.minSupportedGazeSamples;

  for (const element of metrics.elements) {
    const related = events.filter((e) => e.elementId === element.elementId);
    const supporting = related.map((e) => e.eventId).slice(0, 40);
    const interactive = ["button", "link", "interactive", "input"].includes(element.category);

    if (
      interactive &&
      element.visits >= thresholds.attentionWithoutClickVisits &&
      element.clickCount === 0
    ) {
      findings.push(
        makeFinding({
          category: "attention_without_click",
          elementId: element.elementId,
          supportingEventIds: supporting,
          metrics: { visits: element.visits, clickCount: element.clickCount },
          calculation: `visits (${element.visits}) >= ${thresholds.attentionWithoutClickVisits} and clickCount == 0`,
          sufficientData: sufficientGlobal && element.validGazeSamples >= 8,
          interpretation:
            "Estimated gaze returned to this interactive control multiple times without a recorded click. This is not evidence of confusion.",
          suggestedInvestigation:
            "Check whether the control is discoverable, enabled, or visually competing with nearby actions."
        })
      );
    }

    if (element.visits >= thresholds.repeatedVisitCount) {
      findings.push(
        makeFinding({
          category: "repeated_visits",
          elementId: element.elementId,
          supportingEventIds: supporting,
          metrics: { visits: element.visits, dwellMs: element.estimatedDwellMs },
          calculation: `visits (${element.visits}) >= ${thresholds.repeatedVisitCount}`,
          sufficientData: sufficientGlobal,
          interpretation:
            "The same element accumulated multiple estimated-attention visits. Revisits can occur during reading, scanning, or layout movement.",
          suggestedInvestigation:
            "Inspect whether the element is a landmark, an unclear affordance, or simply central content."
        })
      );
    }

    if (
      element.meanAttentionToActionMs !== undefined &&
      element.meanAttentionToActionMs >= thresholds.longAttentionToActionMs
    ) {
      findings.push(
        makeFinding({
          category: "long_attention_to_action",
          elementId: element.elementId,
          supportingEventIds: supporting.filter((id) =>
            related.some((e) => e.eventId === id && e.type === "attention_to_action")
          ),
          metrics: { meanDelayMs: element.meanAttentionToActionMs },
          calculation: `mean(attention_to_action.delayMs) >= ${thresholds.longAttentionToActionMs}`,
          sufficientData: element.attentionToActionDelaysMs.length >= 1 && sufficientGlobal,
          interpretation:
            "A recorded interaction occurred long after estimated attention on the same element. Delay has many non-usability causes.",
          suggestedInvestigation:
            "Review whether the control requires extra reading, confirmation, or is easy to miss after first glance."
        })
      );
    }

    if (
      element.clickCount > 0 &&
      element.validGazeSamples < thresholds.clickGazeCoverageSamples
    ) {
      findings.push(
        makeFinding({
          category: "click_without_gaze_coverage",
          elementId: element.elementId,
          supportingEventIds: related.filter((e) => e.type === "click").map((e) => e.eventId),
          metrics: {
            clickCount: element.clickCount,
            validGazeSamples: element.validGazeSamples
          },
          calculation: `clickCount > 0 and validGazeSamples (${element.validGazeSamples}) < ${thresholds.clickGazeCoverageSamples}`,
          sufficientData: true,
          interpretation:
            "A click was observed with little mapped gaze on the target. This may reflect tracking error, peripheral pointing, or rapid motor action—not necessarily inattention.",
          suggestedInvestigation:
            "Compare click coordinates with gaze quality around the same timestamps."
        })
      );
    }
  }

  const velocities = events.filter((e) => e.type === "scroll_velocity");
  const revisits = events.filter((e) => e.type === "region_revisit");
  for (const scroll of velocities) {
    const speed = Math.abs(Number(scroll.metadata.velocityPxPerSec ?? 0));
    if (speed < thresholds.rapidScrollVelocityPxPerSec) continue;
    const later = revisits.filter(
      (r) =>
        r.timestamp >= scroll.timestamp &&
        r.timestamp - scroll.timestamp <= thresholds.rapidScrollRevisitWindowMs
    );
    if (later.length === 0) continue;
    findings.push(
      makeFinding({
        category: "rapid_scroll_revisit",
        regionId: String(later[0].metadata.regionId ?? "unknown"),
        supportingEventIds: [scroll.eventId, ...later.map((e) => e.eventId)],
        metrics: { velocityPxPerSec: speed, revisits: later.length },
        calculation: `|velocity| >= ${thresholds.rapidScrollVelocityPxPerSec} followed by region_revisit within ${thresholds.rapidScrollRevisitWindowMs}ms`,
        sufficientData: sufficientGlobal,
        interpretation:
          "Rapid scrolling was followed by returning to a page region. This can indicate scanning, overshoot, or content that was easy to skip.",
        suggestedInvestigation:
          "Check heading hierarchy, density, and whether key actions sit below a long scroll."
      })
    );
  }

  const quality = events.filter((e) => e.type === "tracking_quality");
  const byRegion = new Map<string, IntentEvent[]>();
  for (const event of quality) {
    const region = String(event.metadata.regionId ?? "page");
    const list = byRegion.get(region) ?? [];
    list.push(event);
    byRegion.set(region, list);
  }
  for (const [regionId, list] of byRegion) {
    if (list.length < thresholds.minRegionSamples) continue;
    const missing = list.filter((e) => e.quality?.missingSample || Number(e.metadata.missingRate ?? 0) > 0);
    const rate =
      list.reduce((s, e) => s + Number(e.metadata.missingRate ?? (e.quality?.missingSample ? 1 : 0)), 0) /
      list.length;
    if (rate >= thresholds.highMissingRate) {
      findings.push(
        makeFinding({
          category: "high_missing_rate_region",
          regionId,
          supportingEventIds: list.map((e) => e.eventId).slice(0, 20),
          metrics: { missingRate: rate, samples: list.length },
          calculation: `mean(missingRate) >= ${thresholds.highMissingRate} with n >= ${thresholds.minRegionSamples}`,
          sufficientData: true,
          interpretation:
            "Tracking produced a high missing-sample rate in this region. Findings here are weakly supported.",
          suggestedInvestigation:
            "Treat analytics for this region as incomplete; consider lighting, pose, or overlay occlusion."
        })
      );
    }
  }

  const interactive = metrics.elements.filter((e) =>
    ["button", "link", "interactive"].includes(e.category)
  );
  const byCat = new Map<string, typeof interactive>();
  for (const el of interactive) {
    const list = byCat.get(el.category) ?? [];
    list.push(el);
    byCat.set(el.category, list);
  }
  for (const [, peers] of byCat) {
    if (peers.length < thresholds.minPeerCount) continue;
    const dwells = [...peers.map((p) => p.estimatedDwellMs)].sort((a, b) => a - b);
    const median = dwells[Math.floor(dwells.length / 2)] || 0;
    if (median <= 0) continue;
    for (const el of peers) {
      if (el.estimatedDwellMs <= median * thresholds.lowAttentionPeerRatio) {
        findings.push(
          makeFinding({
            category: "low_attention_interactive",
            elementId: el.elementId,
            supportingEventIds: events
              .filter((e) => e.elementId === el.elementId)
              .map((e) => e.eventId)
              .slice(0, 20),
            metrics: {
              dwellMs: el.estimatedDwellMs,
              peerMedianDwellMs: median,
              ratio: el.estimatedDwellMs / median
            },
            calculation: `element dwell / median(${el.category} dwell) <= ${thresholds.lowAttentionPeerRatio}`,
            sufficientData: sufficientGlobal && median > 200,
            interpretation:
              "This interactive element received unusually little estimated dwell relative to peers. That may reflect placement, size, tracking bias, or genuine skip-over.",
            suggestedInvestigation:
              "Compare visual prominence and position against peer controls of the same category."
          })
        );
      }
    }
  }

  return findings;
}

function makeFinding(
  partial: Omit<UsabilityFinding, "findingId" | "qualityLimitations" | "confidenceNote">
): UsabilityFinding {
  return {
    findingId: createFindingId(),
    qualityLimitations: [
      "Webcam gaze estimation is noisy and is not a clinical or lab-grade eye tracker.",
      "Estimated gaze is not the same as conscious attention.",
      "Lack of a click is not evidence of confusion or intent."
    ],
    confidenceNote: partial.sufficientData
      ? "Supported by the configured sample-size heuristic; still a hypothesis."
      : "Insufficient gaze coverage or sample size; treat as unsupported.",
    ...partial
  };
}
