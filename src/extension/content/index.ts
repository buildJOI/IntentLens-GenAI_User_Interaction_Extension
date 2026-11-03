import { BatchQueue, type CalibrationStatus, type IntentEvent } from "../../core/index.js";
import { attachCollectors } from "./collectors.js";
import { elementAtPoint } from "./element.js";
import { makeEvent, qualityFromHealth, type SessionContext } from "./factory.js";
import { calibrationUi, ensureOverlay, setIndicator } from "./overlay.js";
import { GAZE_SOURCE, type GazeFrameMessage } from "../gaze/protocol.js";

declare global {
  interface Window {
    __intentlensLoaded?: boolean;
  }
}

console.info("IntentLens:content:boot:start", {
  ts: new Date().toISOString(),
  url: window.location.origin + window.location.pathname,
  hasLoadedGuard: Boolean(window.__intentlensLoaded)
});

const alreadyLoaded = Boolean(window.__intentlensLoaded);
console.info("IntentLens:content:guard:before-set", {
  ts: new Date().toISOString(),
  alreadyLoaded,
  url: window.location.origin + window.location.pathname
});
window.__intentlensLoaded = true;
console.info("IntentLens:content:guard:after-set", {
  ts: new Date().toISOString(),
  url: window.location.origin + window.location.pathname,
  loaded: true
});

let ctx: SessionContext | undefined;
let detachCollectors: (() => void) | undefined;
let gazeFrame: HTMLIFrameElement | undefined;
let lastGazeAt = 0;
let lastGazeEl: string | undefined;
let lastGazeTime = 0;
let missingWindow = 0;
let totalWindow = 0;
let calibrationStatus: CalibrationStatus = "not_started";

const queue = new BatchQueue<IntentEvent>(20, 400, (items) => {
  void chrome.runtime.sendMessage({
    type: "ingest-events",
    requestId: `ing_${Date.now()}`,
    payload: items
  });
});

function currentCtx(): SessionContext | undefined {
  return ctx;
}

function emit(event: IntentEvent): void {
  queue.push(event);
}

function startCollection(sessionId: string, webcamGaze = false): void {
  if (ctx?.sessionId === sessionId && detachCollectors) return;
  stopCollection();
  ctx = { sessionId, startedAt: Date.now() };
  ensureOverlay(true);
  setIndicator("running");
  try {
    detachCollectors = attachCollectors(currentCtx, emit, { mouseMoveThrottleMs: 50 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown collector error";
    detachCollectors = undefined;
    ctx = undefined;
    setIndicator("idle");
    throw new Error(`Collector initialization failed: ${message}`);
  }
  emit(makeEvent(ctx, "navigation", { metadata: { reason: "session-start" } }));
  if (webcamGaze) {
    mountGazeFrame();
  }
}

export function startCollectionForTest(sessionId: string, webcamGaze = false): boolean {
  try {
    startCollection(sessionId, webcamGaze);
    return true;
  } catch {
    return false;
  }
}

function stopCollection(): void {
  detachCollectors?.();
  detachCollectors = undefined;
  queue.flush();
  setIndicator("idle");
  ctx = undefined;
}

function mountGazeFrame(): void {
  if (gazeFrame) return;
  gazeFrame = document.createElement("iframe");
  gazeFrame.src = chrome.runtime.getURL("gaze-frame.html");
  gazeFrame.allow = "camera; microphone";
  gazeFrame.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;bottom:0;left:0;";
  document.documentElement.appendChild(gazeFrame);
}

window.addEventListener("message", (event) => {
  const data = event.data as GazeFrameMessage;
  if (!data || data.source !== GAZE_SOURCE) return;
  const session = ctx;
  if (!session) return;
  if (data.kind === "denied") {
    calibrationStatus = "denied";
    emit(
      makeEvent(session, "tracking_quality", {
        quality: qualityFromHealth(true, "denied", "low"),
        metadata: { camera: "denied", regionId: "page" }
      })
    );
    return;
  }
  if (data.kind === "unavailable") {
    emit(
      makeEvent(session, "tracking_quality", {
        quality: qualityFromHealth(true, "failed", "low"),
        metadata: { camera: "unavailable", reason: data.reason, regionId: "page" }
      })
    );
    return;
  }
  if (data.kind === "sample") {
    totalWindow += 1;
    if (data.missing) missingWindow += 1;
    lastGazeAt = Date.now();
    const el = data.missing ? undefined : elementAtPoint(data.x, data.y);
    if (el) {
      lastGazeEl = el.elementId;
      lastGazeTime = Date.now();
    }
    emit(
      makeEvent(
        session,
        "gaze_sample",
        {
          coordinates: { x: data.x, y: data.y },
          quality: qualityFromHealth(
            data.missing,
            calibrationStatus,
            data.missing ? "low" : "medium"
          ),
          metadata: { source: "webgazer", sampleIntervalMs: 100 }
        },
        el
      )
    );
    maybeEmitDerivedGaze(session, data.x, data.y, data.missing);
  }
});

let lastFixation: { x: number; y: number; t: number; samples: number } | undefined;

function maybeEmitDerivedGaze(session: SessionContext, x: number, y: number, missing: boolean): void {
  const now = Date.now();
  if (missing) {
    lastFixation = undefined;
    return;
  }
  if (!lastFixation) {
    lastFixation = { x, y, t: now, samples: 1 };
    return;
  }
  const dist = Math.hypot(x - lastFixation.x, y - lastFixation.y);
  if (dist < 40) {
    lastFixation.samples += 1;
    lastFixation.x = (lastFixation.x + x) / 2;
    lastFixation.y = (lastFixation.y + y) / 2;
    if (now - lastFixation.t >= 150 && lastFixation.samples >= 3) {
      emit(
        makeEvent(session, "gaze_fixation", {
          coordinates: { x: lastFixation.x, y: lastFixation.y },
          metadata: { samples: lastFixation.samples, durationMs: now - lastFixation.t },
          quality: qualityFromHealth(false, calibrationStatus, "medium")
        })
      );
      emit(
        makeEvent(session, "gaze_dwell", {
          coordinates: { x: lastFixation.x, y: lastFixation.y },
          metadata: { durationMs: now - lastFixation.t },
          quality: qualityFromHealth(false, calibrationStatus, "medium")
        })
      );
      lastFixation.t = now;
      lastFixation.samples = 0;
    }
  } else {
    emit(
      makeEvent(session, "gaze_saccade", {
        coordinates: { x, y },
        metadata: { fromX: lastFixation.x, fromY: lastFixation.y, distancePx: dist },
        quality: qualityFromHealth(false, calibrationStatus, "medium")
      })
    );
    lastFixation = { x, y, t: now, samples: 1 };
  }
}

document.addEventListener(
  "click",
  (event) => {
    const session = ctx;
    if (!session) return;
    const target = event.target instanceof Element ? event.target.getAttribute("data-intentlens-id") : undefined;
    if (target && lastGazeEl === target && lastGazeTime) {
      emit(
        makeEvent(session, "attention_to_action", {
          elementId: target,
          metadata: { delayMs: Date.now() - lastGazeTime }
        })
      );
    }
  },
  true
);

async function runCalibration(): Promise<void> {
  const session = ctx;
  if (!session) return;
  mountGazeFrame();
  calibrationStatus = "in_progress";
  setIndicator("calibrating");
  const ui = calibrationUi();
  const train = 9;
  const holdout = 2;
  const errors: number[] = [];
  for (let i = 0; i < train + holdout; i += 1) {
    const hold = i >= train;
    const target = ui.showProgress(
      i,
      train + holdout,
      hold
        ? "Hold-out check: look at the target. Error here is a pixel residual, not a statistical confidence."
        : "Look at the target and click it. Completing points does not mean tracking is accurate."
    );
    const point = await waitClick(target, () => {
      console.info("IntentLens: calibration target click triggered start request");
      gazeFrame?.contentWindow?.postMessage({ source: GAZE_SOURCE, kind: "start" }, "*");
    });
    if (!hold) {
      gazeFrame?.contentWindow?.postMessage(
        { source: GAZE_SOURCE, kind: "calibrate", x: point.x, y: point.y },
        "*"
      );
    } else {
      errors.push(Math.hypot(point.predX - point.x, point.predY - point.y));
    }
    void chrome.runtime.sendMessage({
      type: "calibration-progress",
      requestId: `cal_${i}`,
      payload: {
        status: "in_progress",
        completedTargets: i + 1,
        targetCount: train + holdout,
        cursorAssisted: true
      }
    });
  }
  ui.hide();
  const mean = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : undefined;
  calibrationStatus = errors.length ? "completed_with_holdout" : "completed_unvalidated";
  setIndicator("running");
  void chrome.runtime.sendMessage({
    type: "calibration-progress",
    requestId: `cal_done`,
    payload: {
      status: calibrationStatus,
      completedTargets: train + holdout,
      targetCount: train + holdout,
      holdoutMeanErrorPx: mean,
      holdoutCount: errors.length,
      lastCalibratedAt: Date.now(),
      cursorAssisted: true,
      notes: [
        "Hold-out mean error is a pixel residual against clicked targets.",
        "It is not a statistically calibrated prediction interval.",
        "Cursor-assisted clicks may not match actual gaze."
      ]
    }
  });
}

function waitClick(target: HTMLButtonElement, onGesture?: () => void): Promise<{ x: number; y: number; predX: number; predY: number }> {
  return new Promise((resolve) => {
    const handler = (event: MouseEvent) => {
      target.removeEventListener("click", handler);
      onGesture?.();
      resolve({
        x: event.clientX,
        y: event.clientY,
        predX: lastPred.x,
        predY: lastPred.y
      });
    };
    target.addEventListener("click", handler);
  });
}

const lastPred = { x: 0, y: 0 };
window.addEventListener("message", (event) => {
  const data = event.data as GazeFrameMessage;
  if (data?.source === GAZE_SOURCE && data.kind === "sample" && !data.missing) {
    lastPred.x = data.x;
    lastPred.y = data.y;
  }
});

setInterval(() => {
  const session = ctx;
  if (!session) return;
  const missingRate = totalWindow === 0 ? 1 : missingWindow / totalWindow;
  const stale = Date.now() - lastGazeAt > 2000;
  emit(
    makeEvent(session, "tracking_quality", {
      quality: qualityFromHealth(
        stale || missingRate > 0.4,
        calibrationStatus,
        missingRate > 0.4 || stale ? "low" : missingRate > 0.2 ? "medium" : "high"
      ),
      metadata: {
        missingRate,
        stale,
        regionId: `band_${Math.floor(window.scrollY / Math.max(1, window.innerHeight / 2))}`
      }
    })
  );
  missingWindow = 0;
  totalWindow = 0;
  if (stale && calibrationStatus === "completed_with_holdout") {
    calibrationStatus = "degraded";
  }
}, 4000);

function transitionCollection(status: "running" | "paused" | "stopped", sessionId: string, webcamGaze = false): boolean {
  try {
    if (status === "running") {
      startCollection(sessionId, webcamGaze);
    } else if (status === "paused") {
      queue.flush();
      detachCollectors?.();
      detachCollectors = undefined;
      ctx = undefined;
      setIndicator("paused");
    } else {
      queue.flush();
      stopCollection();
      setIndicator("idle");
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown session transition error";
    setIndicator("idle");
    console.error("IntentLens: session transition failed", { status, message });
    return false;
  }
}

export function transitionCollectionForTest(status: "running" | "paused" | "stopped", sessionId: string, webcamGaze = false): boolean {
  return transitionCollection(status, sessionId, webcamGaze);
}

export function debugSessionState() {
  return {
    active: !!ctx,
    sessionId: ctx?.sessionId ?? null,
    hasCollectors: !!detachCollectors
  };
}

try {
  console.info("IntentLens:content:listener:registering", {
    ts: new Date().toISOString(),
    url: window.location.origin + window.location.pathname,
    hasContext: !!ctx,
    hasCollectors: !!detachCollectors
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "content-script-ready") {
      const requestId = String(message.requestId ?? `content-ready-${Date.now()}`);
      const tabId = Number(message.tabId ?? 0);
      const sessionId = String(message.sessionId ?? ctx?.sessionId ?? "");
      const expectedSessionId = ctx?.sessionId ?? "";
      const matchedSession = !sessionId || !expectedSessionId || sessionId === expectedSessionId;
      sendResponse({
        type: "content-script-ready-ack",
        requestId,
        tabId,
        sessionId: expectedSessionId,
        ok: matchedSession,
        hasCollectors: !!detachCollectors,
        error: matchedSession ? undefined : `Session mismatch: expected ${expectedSessionId}, received ${sessionId}`
      });
      return true;
    }

    if (message?.type === "session-control") {
      const status = String(message.status ?? "") as "running" | "paused" | "stopped";
      const sessionId = String(message.sessionId ?? ctx?.sessionId ?? "");
      const success = transitionCollection(status, sessionId, Boolean(message.webcamGaze));
      sendResponse({
        type: "session-control-ack",
        requestId: String(message.requestId ?? `session-control-${Date.now()}`),
        status,
        sessionId,
        ok: success,
        error: success ? undefined : `Failed to transition to ${status}`
      });
      return true;
    }
    if (message?.type === "begin-calibration") {
      void runCalibration();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
  console.info("IntentLens:content:listener:registered", {
    ts: new Date().toISOString(),
    url: window.location.origin + window.location.pathname,
    hasContext: !!ctx,
    hasCollectors: !!detachCollectors
  });
} catch (error) {
  console.error("IntentLens:content:listener:init-failed", {
    ts: new Date().toISOString(),
    url: window.location.origin + window.location.pathname,
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
  throw error;
}

if (!alreadyLoaded) {
  void chrome.runtime.sendMessage({ type: "get-state", requestId: "boot" }).then((response) => {
    const session = response?.payload?.session;
    if (session?.status === "running") {
      try {
        startCollection(session.sessionId, Boolean(session.consent?.webcamGaze));
      } catch (error) {
        console.error("IntentLens: failed to restore running collection", error);
        void chrome.runtime.sendMessage({
          type: "session-control",
          requestId: `boot-recovery-${Date.now()}`,
          payload: { ok: false, error: error instanceof Error ? error.message : "collector restoration failed" }
        });
      }
    }
  });
}
