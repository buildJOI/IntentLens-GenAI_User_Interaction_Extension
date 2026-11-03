export interface MismatchThresholds {
  /** Consecutive estimated-attention visits on an interactive element without a later click. */
  attentionWithoutClickVisits: number;
  /** Repeated visits that may indicate hunting rather than a single glance. */
  repeatedVisitCount: number;
  /** Delay from first estimated attention to click, milliseconds. */
  longAttentionToActionMs: number;
  /** Scroll speed in px/s considered rapid. */
  rapidScrollVelocityPxPerSec: number;
  /** Revisit window after a rapid scroll, milliseconds. */
  rapidScrollRevisitWindowMs: number;
  /** Minimum gaze samples near a clicked element to consider coverage sufficient. */
  clickGazeCoverageSamples: number;
  /** Missing-sample rate in a region that warrants a finding. */
  highMissingRate: number;
  /** Minimum samples in a region before missing-rate findings are eligible. */
  minRegionSamples: number;
  /** Peer ratio: element dwell relative to median of comparable category. */
  lowAttentionPeerRatio: number;
  /** Minimum comparable elements in the same category. */
  minPeerCount: number;
  /** Minimum mapped gaze samples before any finding is "supported". */
  minSupportedGazeSamples: number;
}

/**
 * Defaults are conservative investigation heuristics, not validated UX scores.
 * They exist so findings are reproducible, not because they represent ground truth.
 */
export const DEFAULT_MISMATCH_THRESHOLDS: MismatchThresholds = {
  attentionWithoutClickVisits: 3,
  repeatedVisitCount: 4,
  longAttentionToActionMs: 4000,
  rapidScrollVelocityPxPerSec: 1800,
  rapidScrollRevisitWindowMs: 4000,
  clickGazeCoverageSamples: 3,
  highMissingRate: 0.4,
  minRegionSamples: 20,
  lowAttentionPeerRatio: 0.25,
  minPeerCount: 3,
  minSupportedGazeSamples: 40
};
