import { GAZE_SOURCE, type HostToGaze } from "./protocol.js";

declare global {
  interface Window {
    webgazer?: WebGazerLike;
  }
}

interface WebGazerLike {
  setRegression(name: string): WebGazerLike;
  setTracker(name: string): WebGazerLike;
  setGazeListener(cb: (data: { x: number; y: number } | null, t: number) => void): WebGazerLike;
  begin(): Promise<void>;
  end(): Promise<void>;
  showVideoPreview(show: boolean): WebGazerLike;
  showPredictionPoints(show: boolean): WebGazerLike;
  applyKalmanFilter(on: boolean): WebGazerLike;
  recordScreenPosition(x: number, y: number, eventType: string): void;
}

function post(message: Record<string, unknown>): void {
  parent.postMessage({ source: GAZE_SOURCE, ...message }, "*");
}

async function loadWebGazer(): Promise<WebGazerLike> {
  if (window.webgazer) return window.webgazer;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("vendor/webgazer.js");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("webgazer script failed to load"));
    document.head.appendChild(script);
  });
  if (!window.webgazer) throw new Error("webgazer global missing");
  return window.webgazer;
}

async function start(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop());
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError") {
      post({ kind: "denied" });
      return;
    }
    post({ kind: "unavailable", reason: name || "camera error" });
    return;
  }

  try {
    const webgazer = await loadWebGazer();
    webgazer
      .setRegression("ridge")
      .setTracker("TFFacemesh")
      .showVideoPreview(false)
      .showPredictionPoints(false)
      .applyKalmanFilter(true)
      .setGazeListener((data, t) => {
        if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) {
          post({ kind: "sample", x: 0, y: 0, t, missing: true });
          return;
        }
        post({ kind: "sample", x: data.x, y: data.y, t, missing: false });
      });
    await webgazer.begin();
    post({ kind: "ready" });
  } catch (error) {
    post({
      kind: "unavailable",
      reason: error instanceof Error ? error.message : "init failed"
    });
  }
}

window.addEventListener("message", (event) => {
  const data = event.data as HostToGaze;
  if (!data || data.source !== GAZE_SOURCE) return;
  if (data.kind === "start") void start();
  if (data.kind === "stop") void window.webgazer?.end();
  if (data.kind === "calibrate") {
    window.webgazer?.recordScreenPosition(data.x, data.y, "click");
    post({ kind: "calibrated" });
  }
});

post({ kind: "ready" });
