import {
  EVENT_SCHEMA_VERSION,
  createEventId,
  createPageId,
  type EventType,
  type IntentEvent,
  type QualityInfo
} from "../../core/index.js";
import type { ElementInfo } from "./element.js";

export interface SessionContext {
  sessionId: string;
  startedAt: number;
  tabId?: number;
}

export function pageIdFromLocation(): string {
  return createPageId(location.href);
}

export function makeEvent(
  ctx: SessionContext,
  type: EventType,
  rest: Partial<Omit<IntentEvent, "schemaVersion" | "sessionId" | "type">> = {},
  el?: ElementInfo
): IntentEvent {
  const now = Date.now();
  const { metadata, ...restFields } = rest;
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId: ctx.sessionId,
    eventId: rest.eventId ?? createEventId(),
    type,
    timestamp: rest.timestamp ?? now,
    sessionTimeMs: rest.sessionTimeMs ?? Math.max(0, now - ctx.startedAt),
    pageId: rest.pageId ?? pageIdFromLocation(),
    tabId: rest.tabId ?? ctx.tabId,
    elementId: rest.elementId ?? el?.elementId,
    elementSelector: rest.elementSelector ?? el?.selector,
    elementCategory: rest.elementCategory ?? el?.category,
    viewport: rest.viewport ?? {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    },
    coordinates: rest.coordinates,
    quality: rest.quality,
    metadata: metadata ?? {},
    ...omitUndefined(restFields)
  };
}

function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function qualityFromHealth(
  missing: boolean,
  calibrationStatus: QualityInfo["calibrationStatus"],
  indicator: QualityInfo["indicator"]
): QualityInfo {
  return { missingSample: missing, calibrationStatus, indicator };
}
