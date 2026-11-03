import type { ElementCategory, IntentEvent } from "../schema/events.js";
import { mappedElementId } from "./elements.js";

export interface ElementMetrics {
  elementId: string;
  selector?: string;
  category: ElementCategory;
  estimatedDwellMs: number;
  validGazeSamples: number;
  sampleShare: number;
  dwellShare: number;
  visits: number;
  timeToFirstAttentionMs?: number;
  clickCount: number;
  hoverCount: number;
  clickThroughRate: number;
  attentionToActionDelaysMs: number[];
  meanAttentionToActionMs?: number;
}

export interface SessionMetrics {
  sessionId: string;
  generatedAt: number;
  eventCount: number;
  observedEventCounts: Record<string, number>;
  durationMs: number;
  validGazeSamples: number;
  unmappedGazeSamples: number;
  missingGazeSamples: number;
  expectedGazeSamples: number;
  dataCoverage: number;
  trackingQuality: "high" | "medium" | "low" | "unknown";
  maxScrollDepth: number;
  regionRevisits: number;
  elements: ElementMetrics[];
  categoryDistribution: Record<ElementCategory, { dwellMs: number; share: number }>;
  timeline: Array<{ t: number; type: string; elementId?: string }>;
  notes: string[];
}

export interface MetricsOptions {
  dwellGapMs: number;
  expectedGazeIntervalMs: number;
}

export const DEFAULT_METRICS_OPTIONS: MetricsOptions = {
  dwellGapMs: 400,
  expectedGazeIntervalMs: 100
};

/**
 * Metric definitions (deterministic, derived from stored events):
 *
 * estimatedDwellMs: sum of inter-sample intervals for consecutive gaze_sample
 *   events on the same element when the interval is > 0 and <= dwellGapMs.
 *   This is an estimate from sampled gaze, not a ground-truth fixation duration.
 *
 * sampleShare: element.validGazeSamples / total valid mapped gaze samples.
 *   Denominator excludes missing samples and unmapped samples.
 *
 * dwellShare: element.estimatedDwellMs / sum of estimated dwell across elements.
 *
 * dataCoverage: validGazeSamples / expectedGazeSamples, capped at 1.
 *   expectedGazeSamples = floor(sessionDuration / expectedGazeIntervalMs)
 *   when gaze collection was consented; otherwise 0 and coverage is null-safe 0.
 *
 * clickThroughRate: clickCount / visits, 0 if visits is 0.
 *
 * timeToFirstAttentionMs: sessionTime of first valid gaze_sample on the element.
 *
 * visits: number of dwell segments (broken when gap > dwellGapMs or element changes).
 *
 * Percentages never represent "all visual attention". Incomplete tracking coverage
 * is reported separately via dataCoverage and unmappedGazeSamples.
 */
export function computeSessionMetrics(
  sessionId: string,
  events: IntentEvent[],
  options: MetricsOptions = DEFAULT_METRICS_OPTIONS
): SessionMetrics {
  const sorted = [...events].filter((e) => e.sessionId === sessionId);
  sorted.sort((a, b) => a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));

  const observedEventCounts: Record<string, number> = {};
  for (const event of sorted) {
    observedEventCounts[event.type] = (observedEventCounts[event.type] ?? 0) + 1;
  }

  const durationMs =
    sorted.length === 0
      ? 0
      : Math.max(0, sorted[sorted.length - 1].sessionTimeMs - sorted[0].sessionTimeMs);

  const gaze = sorted.filter((e) => e.type === "gaze_sample");
  const missingGazeSamples = gaze.filter((e) => e.quality?.missingSample).length;
  const presentGaze = gaze.filter((e) => !e.quality?.missingSample);
  const mapped = presentGaze.filter((e) => mappedElementId(e));
  const unmappedGazeSamples = presentGaze.length - mapped.length;
  const validGazeSamples = mapped.length;

  const byElement = new Map<string, ElementMetrics>();

  const ensure = (event: IntentEvent, id: string): ElementMetrics => {
    const existing = byElement.get(id);
    if (existing) return existing;
    const created: ElementMetrics = {
      elementId: id,
      selector: event.elementSelector,
      category: event.elementCategory ?? "unknown",
      estimatedDwellMs: 0,
      validGazeSamples: 0,
      sampleShare: 0,
      dwellShare: 0,
      visits: 0,
      clickCount: 0,
      hoverCount: 0,
      clickThroughRate: 0,
      attentionToActionDelaysMs: []
    };
    byElement.set(id, created);
    return created;
  };

  let prev: IntentEvent | undefined;
  for (const event of mapped) {
    const id = mappedElementId(event)!;
    const metrics = ensure(event, id);
    metrics.validGazeSamples += 1;
    if (metrics.timeToFirstAttentionMs === undefined) {
      metrics.timeToFirstAttentionMs = event.sessionTimeMs;
    }
    if (
      prev &&
      mappedElementId(prev) === id &&
      event.timestamp - prev.timestamp > 0 &&
      event.timestamp - prev.timestamp <= options.dwellGapMs
    ) {
      metrics.estimatedDwellMs += event.timestamp - prev.timestamp;
    } else {
      metrics.visits += 1;
    }
    prev = event;
  }

  for (const event of sorted) {
    if (event.type === "click" && event.elementId) {
      const metrics = ensure(event, event.elementId);
      metrics.clickCount += 1;
    }
    if (event.type === "hover" && event.elementId) {
      const metrics = ensure(event, event.elementId);
      metrics.hoverCount += 1;
    }
    if (event.type === "attention_to_action" && event.elementId) {
      const metrics = ensure(event, event.elementId);
      const delay = Number(event.metadata.delayMs ?? NaN);
      if (Number.isFinite(delay)) metrics.attentionToActionDelaysMs.push(delay);
    }
  }

  const totalDwell = [...byElement.values()].reduce((s, m) => s + m.estimatedDwellMs, 0);
  for (const metrics of byElement.values()) {
    metrics.sampleShare = validGazeSamples === 0 ? 0 : metrics.validGazeSamples / validGazeSamples;
    metrics.dwellShare = totalDwell === 0 ? 0 : metrics.estimatedDwellMs / totalDwell;
    metrics.clickThroughRate = metrics.visits === 0 ? 0 : metrics.clickCount / metrics.visits;
    if (metrics.attentionToActionDelaysMs.length > 0) {
      metrics.meanAttentionToActionMs =
        metrics.attentionToActionDelaysMs.reduce((a, b) => a + b, 0) /
        metrics.attentionToActionDelaysMs.length;
    }
  }

  const categoryTotals: Record<ElementCategory, { dwellMs: number; share: number }> = {
    button: { dwellMs: 0, share: 0 },
    link: { dwellMs: 0, share: 0 },
    input: { dwellMs: 0, share: 0 },
    media: { dwellMs: 0, share: 0 },
    heading: { dwellMs: 0, share: 0 },
    text: { dwellMs: 0, share: 0 },
    nav: { dwellMs: 0, share: 0 },
    interactive: { dwellMs: 0, share: 0 },
    unknown: { dwellMs: 0, share: 0 }
  };
  for (const metrics of byElement.values()) {
    categoryTotals[metrics.category].dwellMs += metrics.estimatedDwellMs;
  }
  for (const key of Object.keys(categoryTotals) as ElementCategory[]) {
    categoryTotals[key].share = totalDwell === 0 ? 0 : categoryTotals[key].dwellMs / totalDwell;
  }

  const maxScrollDepth = sorted
    .filter((e) => e.type === "scroll_depth")
    .reduce((max, e) => Math.max(max, Number(e.metadata.depthRatio ?? 0)), 0);

  const regionRevisits = sorted.filter((e) => e.type === "region_revisit").length;

  const expectedGazeSamples =
    durationMs <= 0 ? 0 : Math.floor(durationMs / options.expectedGazeIntervalMs);
  const dataCoverage =
    expectedGazeSamples === 0 ? 0 : Math.min(1, presentGaze.length / expectedGazeSamples);

  const qualityEvents = sorted.filter((e) => e.type === "tracking_quality");
  const lastQuality = qualityEvents[qualityEvents.length - 1];
  const trackingQuality = lastQuality?.quality?.indicator ?? inferQuality(dataCoverage, missingGazeSamples, gaze.length);

  const timeline = sorted.slice(-400).map((e) => ({
    t: e.sessionTimeMs,
    type: e.type,
    elementId: e.elementId
  }));

  const notes = [
    "Gaze dwell is estimated from sampled coordinates, not measured eye-tracker fixations.",
    "sampleShare uses valid mapped gaze samples as the denominator, not all visual attention.",
    `dataCoverage uses present gaze samples / expected samples at ${options.expectedGazeIntervalMs}ms.`
  ];

  return {
    sessionId,
    generatedAt: Date.now(),
    eventCount: sorted.length,
    observedEventCounts,
    durationMs,
    validGazeSamples,
    unmappedGazeSamples,
    missingGazeSamples,
    expectedGazeSamples,
    dataCoverage,
    trackingQuality,
    maxScrollDepth,
    regionRevisits,
    elements: [...byElement.values()].sort((a, b) => b.estimatedDwellMs - a.estimatedDwellMs),
    categoryDistribution: categoryTotals,
    timeline,
    notes
  };
}

function inferQuality(
  coverage: number,
  missing: number,
  total: number
): "high" | "medium" | "low" | "unknown" {
  if (total === 0) return "unknown";
  const missingRate = missing / total;
  if (coverage >= 0.7 && missingRate < 0.15) return "high";
  if (coverage >= 0.4 && missingRate < 0.35) return "medium";
  return "low";
}
