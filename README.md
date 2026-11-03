# IntentLens

Privacy-first Chrome extension (Manifest V3) for multimodal **interaction collection**, **webcam gaze estimation**, **deterministic attention analytics**, an **Attention–Action Mismatch Detector**, and optional **Gemini** interpretation.

Gaze is an estimate. It is not conscious attention. Findings are investigation hypotheses.

## Requirements

- Node.js 20+
- Chrome 114+ (or Chromium)
- Optional: a Gemini API key for the local proxy

## Install (development)

```powershell
cd C:\Users\hp\Projects\intentlens
npm install
npm test
npm run build
```

Load the extension:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked
4. Select `dist/extension`

## Gemini proxy (optional)

```powershell
copy .env.example .env
# set GEMINI_API_KEY in .env — never in the extension
npx tsx src/proxy/index.ts
```

In the IntentLens console, keep the proxy URL at `http://127.0.0.1:8787`. Collection and analytics work if Gemini is down.

## Using a session

1. Open the popup.
2. Opt in to interaction collection (and optionally webcam + AI).
3. Click Start. Chrome will ask for optional host access.
4. Calibrate if you enabled gaze. Completing targets does **not** mean accuracy.
5. Open the console for events, metrics, findings, and export/delete.

## Tests and checks

```powershell
npm test
npm run typecheck
npm run build
```

## What is verified in automated tests

- Event schema, sensitive-field rejection, ordering, duplicates, gaps
- Dwell, distribution denominators, DOM hit-testing rules
- Mismatch detector categories
- Interrupted session recovery
- Gemini JSON validation and error classification
- Export round-trip
- Message allow-list and sender checks
- Proxy rate limiter

## Manual verification still required

- Webcam permission, calibration overlay, and WebGazer on a real page
- Chrome host-permission prompt
- Dashboard charts on a live browsing session
- End-to-end Gemini call with a real key

## WebGazer

The library is vendored at build time from `node_modules/webgazer` when present. It is research-grade and not a statistically calibrated tracker. The `GazeProvider` interface is the replacement point.

## Layout

- `src/core` — schema, pipeline, analytics, mismatch, Gemini validation
- `src/extension` — MV3 extension
- `src/proxy` — Gemini proxy
- `docs/` — metrics, privacy, architecture, mismatch thresholds
