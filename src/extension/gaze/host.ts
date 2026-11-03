import { GAZE_SOURCE, type GazeFrameMessage, type HostToGaze } from "./protocol.js";

const processor = document.createElement("iframe");
processor.src = chrome.runtime.getURL("gaze-frame.html");
// WebGazer drives prediction with requestAnimationFrame. A display:none frame
// is not rendered, so Chrome can suspend that loop after its first callback.
// Keep the sandbox render-active while remaining invisible and non-interactive.
processor.style.cssText =
  "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:0;bottom:0;";
document.body.appendChild(processor);

let cameraStream: MediaStream | undefined;
let captureTimer: number | undefined;
let frameBusy = false;
let startPromise: Promise<void> | undefined;
let processorReady = false;
let startRequested = false;

function postToParent(message: Record<string, unknown>): void {
  parent.postMessage({ source: GAZE_SOURCE, ...message }, "*");
}

function postToProcessor(message: HostToGaze, transfer: Transferable[] = []): void {
  processor.contentWindow?.postMessage(message, "*", transfer);
}

async function startCamera(): Promise<void> {
  startRequested = true;
  if (cameraStream) {
    if (processorReady) postToProcessor({ source: GAZE_SOURCE, kind: "start" });
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = document.createElement("video");
    video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    captureTimer = window.setInterval(() => {
      if (frameBusy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      frameBusy = true;
      void createImageBitmap(video)
        .then((bitmap) => {
          postToProcessor({ source: GAZE_SOURCE, kind: "frame", bitmap }, [bitmap]);
        })
        .catch((error) => {
          postToParent({ kind: "unavailable", reason: error instanceof Error ? error.message : "frame capture failed" });
        })
        .finally(() => {
          frameBusy = false;
        });
    }, 66);
    if (processorReady) postToProcessor({ source: GAZE_SOURCE, kind: "start" });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    postToParent({
      kind: name === "NotAllowedError" ? "denied" : "unavailable",
      ...(name === "NotAllowedError" ? {} : { reason: name || "camera error" })
    });
  }
}

function stopCamera(): void {
  if (captureTimer !== undefined) window.clearInterval(captureTimer);
  captureTimer = undefined;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  startPromise = undefined;
  startRequested = false;
  if (processorReady) postToProcessor({ source: GAZE_SOURCE, kind: "stop" });
}

window.addEventListener("message", (event) => {
  const data = event.data as HostToGaze | GazeFrameMessage;
  if (!data || data.source !== GAZE_SOURCE) return;
  if (event.source === processor.contentWindow) {
    if (data.kind === "ready") {
      processorReady = true;
      if (startRequested) postToProcessor({ source: GAZE_SOURCE, kind: "start" });
    }
    postToParent(data as unknown as Record<string, unknown>);
    return;
  }
  if (event.source !== parent) return;
  if (data.kind === "start") {
    if (!startPromise) startPromise = startCamera();
    void startPromise;
  } else if (data.kind === "stop") {
    stopCamera();
  } else if (data.kind === "calibrate") {
    postToProcessor(data);
  }
});

postToParent({ kind: "ready" });
