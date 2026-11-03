import {
  computeSessionMetrics,
  detectMismatches,
  parseEvent,
  parseExtensionMessage,
  isTrustedSender,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  grantConsent,
  createSession,
  buildExport,
  canCollect,
  type IntentEvent,
  type ConsentState,
  type SessionRecord,
  type SessionStatus
} from "../core/index.js";
import {
  appendEvents,
  archiveSession,
  clearCurrentSession,
  deleteAllData,
  loadState,
  saveInsights,
  saveSession,
  saveSettings,
  DEFAULT_SETTINGS
} from "./storage.js";
import { isUnsupportedUrl } from "./unsupported.js";
import { classifyProxyError } from "../core/gemini/errors.js";
import { parseGeminiInsight } from "../core/gemini/schema.js";
import {
  assertSessionControlAck,
  deliverSessionControlToTab,
  waitForContentScriptReady,
  type SessionControlRequest
} from "./sessionControl.js";

chrome.runtime.onInstalled.addListener(() => {
  void loadState();
});

chrome.alarms.create("intentlens-health", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "intentlens-health") void loadState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error"
      });
    });
  return true;
});

async function handleMessage(raw: unknown, sender: chrome.runtime.MessageSender) {
  if (!isTrustedSender({ id: sender.id }, chrome.runtime.id)) {
    return { ok: false, error: "untrusted sender" };
  }
  const message = parseExtensionMessage(raw);
  const state = await loadState();

  switch (message.type) {
    case "ping":
      return { ok: true, payload: { pong: true } };
    case "get-state":
      return { ok: true, payload: await snapshot() };
    case "set-consent": {
      const consent = message.payload as Partial<ConsentState>;
      const session = grantConsent(state.session, consent);
      await saveSession(session);
      return { ok: true, payload: await snapshot() };
    }
    case "start-session": {
      const hasPermission = await chrome.permissions.contains({
        origins: ["http://*/*", "https://*/*"]
      });
      if (!hasPermission) {
        return { ok: false, error: "Page access permission is required to collect a session." };
      }
      const session = startSession(state.session);
      await saveSession(session);
      try {
        await injectActiveTab(session.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await saveSession({ ...session, status: "idle", startedAt: undefined, pausedAt: undefined, stoppedAt: undefined });
        throw new Error(`Unable to activate page collection: ${message}`);
      }
      await setBadge(session.status);
      return { ok: true, payload: await snapshot() };
    }
    case "pause-session": {
      const session = pauseSession(state.session);
      await saveSession(session);
      await setBadge(session.status);
      await broadcastControl(session, session.status);
      return { ok: true, payload: await snapshot() };
    }
    case "resume-session": {
      const session = resumeSession(state.session);
      await saveSession(session);
      try {
        await injectActiveTab(session.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await saveSession({ ...session, status: "paused", startedAt: undefined, pausedAt: Date.now(), stoppedAt: undefined });
        throw new Error(`Unable to resume tracking: ${message}`);
      }
      await setBadge(session.status);
      await broadcastControl(session, session.status);
      return { ok: true, payload: await snapshot() };
    }
    case "stop-session": {
      const session = stopSession(state.session);
      await archiveSession(session);
      await saveSession(session);
      await setBadge(session.status);
      await broadcastControl(session, session.status);
      return { ok: true, payload: await snapshot() };
    }
    case "ingest-events": {
      if (!canCollect(state.session.consent, state.session.status)) {
        return { ok: false, error: "collection inactive" };
      }
      const events = Array.isArray(message.payload) ? message.payload : [];
      const parsed: IntentEvent[] = [];
      for (const item of events) {
        try {
          const event = parseEvent(item);
          if (event.sessionId !== state.session.sessionId) continue;
          parsed.push(event);
        } catch {
          // drop invalid
        }
      }
      const result = await appendEvents(parsed);
      return { ok: true, payload: result };
    }
    case "get-events": {
      const { events, session } = await loadState();
      const current = events.filter((e) => e.sessionId === session.sessionId);
      const payload = message.payload as { query?: string; types?: string[]; limit?: number } | undefined;
      const filtered = current.filter((e) => {
        if (payload?.types?.length && !payload.types.includes(e.type)) return false;
        if (payload?.query) {
          const q = payload.query.toLowerCase();
          return (
            e.eventId.toLowerCase().includes(q) ||
            (e.elementId ?? "").toLowerCase().includes(q) ||
            e.type.includes(q)
          );
        }
        return true;
      });
      return { ok: true, payload: filtered.slice(-(payload?.limit ?? 500)) };
    }
    case "get-analytics": {
      const snap = await snapshot();
      return { ok: true, payload: snap };
    }
    case "get-findings": {
      const snap = await snapshot();
      return { ok: true, payload: snap.findings };
    }
    case "export-session": {
      const snap = await snapshot();
      return {
        ok: true,
        payload: buildExport({
          session: snap.session,
          events: snap.events,
          metrics: snap.metrics,
          findings: snap.findings,
          insights: snap.insights
        })
      };
    }
    case "delete-session": {
      await clearCurrentSession();
      return { ok: true, payload: await snapshot() };
    }
    case "delete-all": {
      await deleteAllData();
      await saveSession(createSession());
      return { ok: true, payload: await snapshot() };
    }
    case "open-dashboard": {
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      return { ok: true };
    }
    case "begin-calibration": {
      await broadcastControl({ type: "session-control", status: "running" } as never, "running");
      return { ok: true };
    }
    case "calibration-progress": {
      const session = {
        ...state.session,
        calibration: { ...state.session.calibration, ...(message.payload as object) }
      };
      await saveSession(session);
      return { ok: true, payload: session.calibration };
    }
    case "update-settings": {
      await saveSettings({ ...DEFAULT_SETTINGS, ...state.settings, ...(message.payload as object) });
      return { ok: true, payload: await snapshot() };
    }
    case "compare-sessions": {
      const { sessionsIndex, events } = await loadState();
      const ids = (message.payload as { sessionIds?: string[] })?.sessionIds ?? [];
      const comparison = ids.map((id) => {
        const record = sessionsIndex.find((s) => s.sessionId === id) ?? state.session;
        const subset = events.filter((e) => e.sessionId === id);
        const metrics = computeSessionMetrics(id, subset, {
          dwellGapMs: 400,
          expectedGazeIntervalMs: state.settings.gazeExpectedIntervalMs
        });
        return { session: record, metrics };
      });
      return { ok: true, payload: comparison };
    }
    case "ask-gemini": {
      if (!state.session.consent.aiAnalysis) {
        return { ok: false, error: "AI analysis is not consented." };
      }
      const snap = await snapshot();
      try {
        const insight = await requestGemini(state.settings.proxyUrl, state.settings.proxyToken, {
          question: (message.payload as { question?: string })?.question,
          sessionId: snap.session.sessionId,
          metrics: snap.metrics,
          findings: snap.findings,
          eventRefs: snap.events.slice(-80).map((e) => e.eventId),
          comparable: (message.payload as { comparable?: unknown })?.comparable
        });
        const insights = [...snap.insights, insight].slice(-10);
        await saveInsights(insights);
        return { ok: true, payload: insight };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Gemini unavailable",
          pipelineContinues: true
        };
      }
    }
    default:
      return { ok: false, error: "unsupported message" };
  }
}

async function snapshot() {
  const state = await loadState();
  const events = state.events.filter((e) => e.sessionId === state.session.sessionId);
  const metrics = computeSessionMetrics(state.session.sessionId, events, {
    dwellGapMs: 400,
    expectedGazeIntervalMs: state.settings.gazeExpectedIntervalMs
  });
  const findings = detectMismatches(events, metrics, state.settings.thresholds);
  return {
    session: { ...state.session, eventCount: events.length },
    settings: state.settings,
    events,
    metrics,
    findings,
    insights: state.insights,
    sessionsIndex: state.sessionsIndex
  };
}

async function ensureHostPermission(): Promise<boolean> {
  return chrome.permissions.request({
    origins: ["http://*/*", "https://*/*"]
  });
}

function sanitizeTabUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname || "/"}`;
  } catch {
    return undefined;
  }
}

function logDiagnostic(stage: string, details: Record<string, unknown>): void {
  console.info("IntentLens:diagnostic", {
    ...details,
    stage,
    ts: new Date().toISOString()
  });
}

async function waitForTabReady(tabId: number, sessionId: string): Promise<void> {
  const requestId = `content-ready-${sessionId}-${Date.now()}`;
  logDiagnostic("ready:request:start", { tabId, sessionId, requestId, payloadType: "content-script-ready" });
  const { session } = await loadState();
  try {
    const ready = await waitForContentScriptReady({
      tabId,
      sessionId: session.sessionId,
      requestId,
      timeoutMs: 2000,
      retries: 2,
      sendMessage: async (payload) => {
        logDiagnostic("ready:send", {
          tabId,
          requestId: payload.requestId,
          sessionId: payload.sessionId,
          payloadType: payload.type
        });
        try {
          const response = await chrome.tabs.sendMessage(tabId, payload);
          logDiagnostic("ready:send:resolved", {
            tabId,
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            payloadType: payload.type,
            responseType: response && typeof response === "object" ? (response as { type?: string }).type : typeof response
          });
          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logDiagnostic("ready:send:rejected", {
            tabId,
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            payloadType: payload.type,
            error: message
          });
          throw error;
        }
      }
    });
    logDiagnostic("ready:ack:accepted", {
      tabId,
      sessionId: ready.sessionId,
      requestId: ready.requestId,
      hasCollectors: ready.hasCollectors
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDiagnostic("ready:ack:failed", {
      tabId,
      sessionId,
      requestId,
      error: message
    });
    throw error;
  }
}

async function injectActiveTab(sessionId: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || isUnsupportedUrl(tab.url)) {
    throw new Error(`IntentLens cannot track unsupported or unavailable page: ${tab?.url ?? "unknown"}`);
  }

  const origin = sanitizeTabUrl(tab.url);
  logDiagnostic("inject:start", { tabId: tab.id, url: origin, sessionId, files: ["content.js"] });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    logDiagnostic("inject:resolved", {
      tabId: tab.id,
      sessionId,
      url: origin,
      resultCount: Array.isArray(results) ? results.length : 0,
      frameId: results?.[0]?.frameId,
      documentId: results?.[0]?.documentId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDiagnostic("inject:rejected", {
      tabId: tab.id,
      sessionId,
      url: origin,
      error: message
    });
    throw error;
  }

  await waitForTabReady(tab.id, sessionId);

  const { session } = await loadState();
  const requestId = `session-control-${sessionId}-running`;
  logDiagnostic("session-control:send", {
    tabId: tab.id,
    sessionId,
    requestId,
    payloadType: "session-control",
    status: "running"
  });
  await deliverSessionControlToTab({
    tabId: tab.id,
    tabUrl: tab.url,
    requestId,
    session,
    status: "running",
    sendMessage: async (payload: SessionControlRequest) => {
      try {
        const response = await chrome.tabs.sendMessage(tab.id!, payload);
        logDiagnostic("session-control:resolved", {
          tabId: tab.id,
          sessionId: session.sessionId,
          requestId: payload.requestId,
          status: payload.status,
          responseType: response && typeof response === "object" ? (response as { type?: string }).type : typeof response
        });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logDiagnostic("session-control:rejected", {
          tabId: tab.id,
          sessionId: session.sessionId,
          requestId: payload.requestId,
          status: payload.status,
          error: message
        });
        throw error;
      }
    },
    inject: async () => {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        files: ["content.js"]
      });
    }
  });
}

async function broadcastControl(session: SessionRecord, status: SessionStatus): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || isUnsupportedUrl(tab.url)) continue;
    const requestId = `session-control-${session.sessionId}-${status}`;
    try {
      console.info("IntentLens: broadcast session-control", { tabId: tab.id, sessionId: session.sessionId, requestId, status });
      await deliverSessionControlToTab({
        tabId: tab.id,
        tabUrl: tab.url,
        requestId,
        session,
        status,
        sendMessage: async (payload: SessionControlRequest) => {
          return chrome.tabs.sendMessage(tab.id!, payload);
        },
        inject: async () => {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ["content.js"]
          });
        }
      });
    } catch (error) {
      console.error("IntentLens: broadcast session-control failed", {
        tabId: tab.id,
        sessionId: session.sessionId,
        requestId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

async function setBadge(status: string): Promise<void> {
  const text = status === "running" ? "REC" : status === "paused" ? "||" : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({
    color: status === "running" ? "#c45c5c" : "#8b93a7"
  });
}

async function requestGemini(url: string, token: string, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/v1/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const classified = classifyProxyError(response.status, text);
      throw new Error(`${classified.code}: ${classified.message}`);
    }
    const json = JSON.parse(text) as { insight?: unknown };
    return parseGeminiInsight(json.insight ?? json);
  } finally {
    clearTimeout(timeout);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    const { session } = await loadState();
    if (session.status !== "running") return;
    if (changeInfo.status === "complete" && tab.id && !isUnsupportedUrl(tab.url)) {
      try {
        console.info("IntentLens: navigation recovery inject", { tabId: tab.id, sessionId: session.sessionId });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        await waitForTabReady(tab.id, session.sessionId);
        const sessionState = await loadState();
        const requestId = `recovery-${session.sessionId}-${Date.now()}`;
        console.info("IntentLens: navigation recovery session-control", { tabId: tab.id, sessionId: session.sessionId, requestId });
        await deliverSessionControlToTab({
          tabId: tab.id,
          tabUrl: tab.url,
          requestId,
          session: sessionState.session,
          status: "running",
          sendMessage: async (payload: SessionControlRequest) => chrome.tabs.sendMessage(tab.id!, payload),
          inject: undefined
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("IntentLens: navigation recovery failed", message);
      }
    }
  })();
});
