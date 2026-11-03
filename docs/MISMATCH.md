# Attention–Action Mismatch Detector

Findings are **hypotheses for investigation**, not diagnoses of user confusion or intent.

Default thresholds live in `src/core/mismatch/thresholds.ts` and can be overridden in extension settings.

| Category | Default rule | Why this default |
| --- | --- | --- |
| attention_without_click | ≥ 3 visits, 0 clicks, interactive category | Repeated estimated returns to a control without activation is worth a look; 3 visits reduces single-glance noise. |
| repeated_visits | ≥ 4 visits | More than a couple of dwell segments may indicate hunting or a landmark. |
| long_attention_to_action | mean delay ≥ 4000ms | Long motor delay after estimated gaze; many benign causes. |
| rapid_scroll_revisit | \|velocity\| ≥ 1800 px/s then region revisit ≤ 4s | Overshoot / skip-then-return scanning pattern. |
| click_without_gaze_coverage | click and < 3 mapped gaze samples | Possible tracking miss or peripheral click. |
| high_missing_rate_region | mean missingRate ≥ 0.4 with n ≥ 20 | Analytics in that band are weakly supported. |
| low_attention_interactive | dwell ≤ 25% of category median, ≥ 3 peers | Placement or tracking bias; not “user ignored this.” |

A finding is `sufficientData` only when session mapped gaze samples meet `minSupportedGazeSamples` (default 40) plus category-specific checks.

Every finding includes supporting event IDs, the calculation string, quality limitations, and a cautious interpretation that refuses emotion inference.
