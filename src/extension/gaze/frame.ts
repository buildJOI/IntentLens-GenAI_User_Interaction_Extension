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
  setStaticVideo(stream: MediaStream): WebGazerLike;
  getTracker(): { predictionReady?: boolean };
  recordScreenPosition(x: number, y: number, eventType: string): void;
}

let startPromise: Promise<void> | undefined;
let trackingStarted = false;
let frameStream: MediaStream | undefined;
let resolveFrameStream: ((stream: MediaStream) => void) | undefined;
const frameCanvas = document.createElement("canvas");
frameCanvas.width = 640;
frameCanvas.height = 480;
frameCanvas.hidden = true;
document.body.appendChild(frameCanvas);

function post(message: Record<string, unknown>): void {
  parent.postMessage({ source: GAZE_SOURCE, ...message }, "*");
}

function loadWebGazer(): WebGazerLike {
  if (!window.webgazer) throw new Error("webgazer global missing");
  return window.webgazer;
}

async function initializeTracking(): Promise<void> {
  if (trackingStarted) {
    post({ kind: "tracking-ready" });
    return;
  }
  try {
    const stream = await waitForFrameStream();
    const webgazer = loadWebGazer();
    webgazer
      .setStaticVideo(stream)
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
    // WebGazer warns for every non-HTTPS protocol, but extension pages are
    // secure contexts and are allowed to request camera access. Suppress only
    // that known, incorrect warning inside this isolated hidden frame.
    const originalAlert = window.alert;
    window.alert = (message?: unknown) => {
      if (String(message).startsWith("WebGazer works only over https")) return;
      originalAlert(String(message));
    };
    try {
      await webgazer.begin();
    } finally {
      window.alert = originalAlert;
    }
    await waitForFaceFeatures(webgazer);
    trackingStarted = true;
    post({ kind: "tracking-ready" });
  } catch (error) {
    post({
      kind: "unavailable",
      reason: error instanceof Error ? error.message : "init failed"
    });
  }
}

async function waitForFaceFeatures(webgazer: WebGazerLike, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (webgazer.getTracker().predictionReady) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error(
    "The camera stream started, but the face tracker did not detect usable eye features within 20 seconds."
  );
}

function start(): Promise<void> {
  if (!startPromise) {
    startPromise = initializeTracking().finally(() => {
      if (!trackingStarted) startPromise = undefined;
    });
  }
  return startPromise;
}

window.addEventListener("message", (event) => {
  const data = event.data as HostToGaze;
  if (!data || data.source !== GAZE_SOURCE) return;
  if (data.kind === "frame") {
    const bitmap = data.bitmap;
    if (frameCanvas.width !== bitmap.width || frameCanvas.height !== bitmap.height) {
      frameCanvas.width = bitmap.width;
      frameCanvas.height = bitmap.height;
    }
    frameCanvas.getContext("2d", { alpha: false })!.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (!frameStream) {
      frameStream = frameCanvas.captureStream(15);
      resolveFrameStream?.(frameStream);
      resolveFrameStream = undefined;
    }
    return;
  }
  if (data.kind === "start") void start();
  if (data.kind === "stop") {
    trackingStarted = false;
    startPromise = undefined;
    void window.webgazer?.end();
  }
  if (data.kind === "calibrate") {
    window.webgazer?.recordScreenPosition(data.x, data.y, "click");
    post({ kind: "calibrated" });
  }
});

function waitForFrameStream(): Promise<MediaStream> {
  if (frameStream) return Promise.resolve(frameStream);
  return new Promise((resolve) => {
    resolveFrameStream = resolve;
  });
}

post({ kind: "ready" });
