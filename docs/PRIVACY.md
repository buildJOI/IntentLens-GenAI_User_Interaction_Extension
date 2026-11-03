# Privacy and Chrome compliance

- Manifest V3, least privilege: `storage`, `scripting`, `tabs`, `alarms`.
- Host access to web pages is **optional** and requested when a session starts.
- Local proxy host permissions are limited to `127.0.0.1:8787` / `localhost:8787`.
- Collection requires explicit opt-in (`interactionCollection`).
- Webcam gaze requires a separate opt-in. Frames are processed locally in an extension-origin iframe. They are not sent to Gemini.
- Keyboard events store a category (`printable`, `enter`, …) never `event.key` for characters.
- Passwords, form values, and page text are not collected. Headings sent to Gemini are optional, capped, and treated as untrusted.
- Tracking indicator is shown while a session is running.
- Restricted pages (`chrome://`, Web Store, etc.) are skipped.
- Export and delete controls operate on `chrome.storage.local`.
- Gemini API keys stay in the proxy environment. The extension may store only a local bearer token for the proxy.
- Messages are schema-validated and accepted only from this extension id.

## Gaze limitations (must not be oversold)

Webcam gaze estimation is noisy. Completing calibration points does not mean the estimate is accurate. Hold-out pixel error is a residual against clicked targets, not a statistical confidence. Cursor-assisted calibration assumes the user looked at the cursor, which may be false. IntentLens never treats the cursor as gaze.
