import { getElapsedMs } from "../core/index.js";

function send(type: string, payload?: unknown) {
  return chrome.runtime.sendMessage({
    type,
    requestId: `${type}_${Date.now()}`,
    payload
  });
}

const els = {
  status: document.getElementById("status")!,
  elapsed: document.getElementById("elapsed")!,
  events: document.getElementById("events")!,
  coverage: document.getElementById("coverage")!,
  cal: document.getElementById("cal")!,
  track: document.getElementById("track")!,
  cInt: document.getElementById("c-int") as HTMLInputElement,
  cGaze: document.getElementById("c-gaze") as HTMLInputElement,
  cAi: document.getElementById("c-ai") as HTMLInputElement,
  error: document.getElementById("error")!
};

async function refresh(): Promise<void> {
  const res = await send("get-state");
  if (!res?.ok) return showError(res?.error ?? "Unable to load state");
  const { session, metrics } = res.payload;
  els.status.textContent = session.status;
  const elapsed = Math.round(getElapsedMs(session) / 1000);
  els.elapsed.textContent = `${elapsed}s`;
  els.events.textContent = String(session.eventCount ?? metrics.eventCount ?? 0);
  els.coverage.textContent = `${Math.round((metrics.dataCoverage ?? 0) * 100)}% samples`;
  els.cal.textContent = session.calibration?.status ?? "not started";
  els.track.textContent = metrics.trackingQuality ?? session.tracking?.qualityIndicator;
  els.cInt.checked = !!session.consent.interactionCollection;
  els.cGaze.checked = !!session.consent.webcamGaze;
  els.cAi.checked = !!session.consent.aiAnalysis;
}

function showError(text: string): void {
  els.error.hidden = !text;
  els.error.textContent = text;
}

async function requestHostPermission(): Promise<boolean> {
  try {
    console.info("IntentLens: requesting host permission from popup click");
    const granted = await chrome.permissions.request({
      origins: ["http://*/*", "https://*/*"]
    });
    console.info("IntentLens: host permission result", granted);
    return granted;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Host permission request failed";
    console.error("IntentLens: host permission request threw", error);
    showError(message);
    return false;
  }
}

async function persistConsent(): Promise<void> {
  console.info("IntentLens: persisting consent", {
    interactionCollection: els.cInt.checked,
    webcamGaze: els.cGaze.checked,
    aiAnalysis: els.cAi.checked
  });
  await send("set-consent", {
    interactionCollection: els.cInt.checked,
    webcamGaze: els.cGaze.checked,
    aiAnalysis: els.cAi.checked
  });
}

for (const id of ["c-int", "c-gaze", "c-ai"]) {
  document.getElementById(id)!.addEventListener("change", () => void persistConsent());
}

document.getElementById("start")!.addEventListener("click", async () => {
  console.info("IntentLens: Start click fired");
  showError("");
  const granted = await requestHostPermission();
  console.info("IntentLens: permission granted state", granted);
  if (!granted) {
    showError("Page access permission is required to collect a session.");
    return;
  }
  await persistConsent();
  console.info("IntentLens: sending start-session message");
  const res = await send("start-session");
  console.info("IntentLens: start-session response", res);
  if (!res?.ok) {
    showError(res?.error ?? "start failed");
    return;
  }
  await refresh();
});
document.getElementById("pause")!.addEventListener("click", async () => {
  await send("pause-session");
  await refresh();
});
document.getElementById("resume")!.addEventListener("click", async () => {
  await send("resume-session");
  await refresh();
});
document.getElementById("stop")!.addEventListener("click", async () => {
  await send("stop-session");
  await refresh();
});
document.getElementById("calibrate")!.addEventListener("click", async () => {
  await send("begin-calibration");
});
document.getElementById("dash")!.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unable to open dashboard");
  }
});

void refresh();
setInterval(() => void refresh(), 1500);
