import type { IntentEvent, SessionRecord } from "../core/schema/events.js";
import { createSession, recoverInterrupted } from "../core/session/lifecycle.js";
import type { GeminiInsight } from "../core/gemini/schema.js";
import type { MismatchThresholds } from "../core/mismatch/thresholds.js";
import { DEFAULT_MISMATCH_THRESHOLDS } from "../core/mismatch/thresholds.js";

const MAX_EVENTS = 40_000;

export interface IntentSettings {
  proxyUrl: string;
  proxyToken: string;
  mouseMoveThrottleMs: number;
  gazeExpectedIntervalMs: number;
  showTrackingIndicator: boolean;
  thresholds: MismatchThresholds;
}

export const DEFAULT_SETTINGS: IntentSettings = {
  proxyUrl: "http://127.0.0.1:8787",
  proxyToken: "",
  mouseMoveThrottleMs: 50,
  gazeExpectedIntervalMs: 100,
  showTrackingIndicator: true,
  thresholds: DEFAULT_MISMATCH_THRESHOLDS
};

interface StoreShape {
  session: SessionRecord;
  events: IntentEvent[];
  seenIds: string[];
  insights: GeminiInsight[];
  settings: IntentSettings;
  sessionsIndex: SessionRecord[];
}

async function loadRaw(): Promise<StoreShape> {
  const data = await chrome.storage.local.get([
    "session",
    "events",
    "seenIds",
    "insights",
    "settings",
    "sessionsIndex"
  ]);
  return {
    session: data.session ?? createSession(),
    events: data.events ?? [],
    seenIds: data.seenIds ?? [],
    insights: data.insights ?? [],
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    sessionsIndex: data.sessionsIndex ?? []
  };
}

export async function loadState(): Promise<StoreShape> {
  const store = await loadRaw();
  const recovered = recoverInterrupted(store.session);
  if (recovered.status !== store.session.status) {
    store.session = recovered;
    await chrome.storage.local.set({ session: recovered });
  }
  return store;
}

export async function saveSession(session: SessionRecord): Promise<void> {
  await chrome.storage.local.set({ session });
}

export async function appendEvents(incoming: IntentEvent[]): Promise<{ stored: number; dropped: number }> {
  const store = await loadRaw();
  const seen = new Set(store.seenIds);
  const next = [...store.events];
  let dropped = 0;
  for (const event of incoming) {
    if (seen.has(event.eventId)) {
      dropped += 1;
      continue;
    }
    seen.add(event.eventId);
    next.push(event);
  }
  while (next.length > MAX_EVENTS) next.shift();
  const session = {
    ...store.session,
    eventCount: next.filter((e) => e.sessionId === store.session.sessionId).length,
    lastEventAt: Date.now(),
    pageIds: unique([...store.session.pageIds, ...incoming.map((e) => e.pageId)])
  };
  await chrome.storage.local.set({
    events: next,
    seenIds: [...seen].slice(-MAX_EVENTS),
    session
  });
  return { stored: incoming.length - dropped, dropped };
}

export async function clearCurrentSession(): Promise<void> {
  const store = await loadRaw();
  await chrome.storage.local.set({
    events: store.events.filter((e) => e.sessionId !== store.session.sessionId),
    insights: [],
    session: { ...store.session, eventCount: 0, pageIds: [] }
  });
}

export async function deleteAllData(): Promise<void> {
  await chrome.storage.local.clear();
}

export async function saveInsights(insights: GeminiInsight[]): Promise<void> {
  await chrome.storage.local.set({ insights });
}

export async function saveSettings(settings: IntentSettings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function archiveSession(session: SessionRecord): Promise<void> {
  const store = await loadRaw();
  const index = store.sessionsIndex.filter((s) => s.sessionId !== session.sessionId);
  index.unshift(session);
  await chrome.storage.local.set({ sessionsIndex: index.slice(0, 20) });
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
