# IntentLens architecture

Modules are separated so collection, analytics, storage, and presentation can change independently.

```
content script  ->  event bus / batch queue  ->  background ingest
gaze iframe (extension origin, WebGazer) -> postMessage samples -> content
background  ->  chrome.storage.local
dashboard/popup  ->  messages  ->  background snapshot (metrics + findings)
background  ->  local proxy  ->  Gemini  (optional, consented)
```

## Packages

- `src/core` — typed schema, normalization, analytics, mismatch detector, Gemini JSON validation. Used by tests and the extension bundle.
- `src/extension` — Manifest V3 service worker, content collectors, overlay, popup, dashboard, gaze iframe.
- `src/proxy` — local Node service that holds `GEMINI_API_KEY`.

## Gaze provider

`GazeProvider` in `src/extension/gaze/provider.ts` is the replacement point. The default runtime adapter is the WebGazer iframe (`gaze/frame.ts`). Webcam frames never leave the browser and are never sent to Gemini.

WebGazer is research software. It is not treated as a maintained clinical tracker. If the vendor file is missing, the provider reports `unavailable` rather than substituting the cursor as gaze.

## Event pipeline

1. Collectors emit versioned `IntentEvent` objects.
2. High-frequency signals are throttled; ingest is batched.
3. Background validates with Zod, drops duplicates, stores a capped buffer.
4. Analytics and mismatch detection run on demand over stored events.
5. Gemini only receives structured summaries, never frames or typed text.
