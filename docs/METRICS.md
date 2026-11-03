# Metric definitions

All percentages use an explicit denominator. None of them represent “the user’s entire visual attention.”

| Metric | Definition |
| --- | --- |
| `estimatedDwellMs` | Sum of inter-sample intervals for consecutive `gaze_sample` events on the same element when `0 < Δt ≤ dwellGapMs` (default 400ms). Derived estimate. |
| `validGazeSamples` | `gaze_sample` events that are not marked missing and have an `elementId`. Observed, filtered. |
| `sampleShare` | `element.validGazeSamples / session.validGazeSamples`. Denominator is mapped valid samples only. |
| `dwellShare` | `element.estimatedDwellMs / sum(estimatedDwellMs)`. |
| `dataCoverage` | `presentGazeSamples / expectedGazeSamples`, capped at 1. Expected count is `floor(sessionDuration / expectedIntervalMs)`. |
| `visits` | Count of dwell segments; a gap larger than `dwellGapMs` or an element change starts a new visit. |
| `clickThroughRate` | `clickCount / visits`, or 0 if visits is 0. Not a marketing CTR. |
| `timeToFirstAttentionMs` | `sessionTimeMs` of the first valid mapped gaze sample on the element. |
| `meanAttentionToActionMs` | Mean of `attention_to_action.delayMs` for that element. |

Unmapped samples, missing samples, and off-viewport points are excluded from element shares and reported separately.

Element mapping (when performed in the page): `elementFromPoint` at gaze coordinates, with analytics-side fallback using recorded boxes (highest `zIndex`, then smallest area). Invisible and zero-area boxes are ignored.
