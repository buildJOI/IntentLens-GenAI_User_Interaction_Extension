export const EVENT_SCHEMA_VERSION = "1.0.0";

export const EVENT_TYPES = [
  "gaze_sample",
  "gaze_dwell",
  "gaze_fixation",
  "gaze_saccade",
  "mouse_move",
  "click",
  "scroll_depth",
  "scroll_velocity",
  "hover",
  "keyboard",
  "element_visibility",
  "tab_visibility",
  "navigation",
  "region_revisit",
  "attention_to_action",
  "tracking_quality"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type ElementCategory =
  | "button"
  | "link"
  | "input"
  | "media"
  | "heading"
  | "text"
  | "nav"
  | "interactive"
  | "unknown";

export type KeyboardCategory =
  | "printable"
  | "enter"
  | "tab"
  | "escape"
  | "modifier"
  | "navigation"
  | "edit"
  | "other";

export interface ViewportBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface QualityInfo {
  /** Documented quality indicator, not a statistically calibrated confidence. */
  indicator: "high" | "medium" | "low" | "unknown";
  missingSample: boolean;
  calibrationStatus: CalibrationStatus;
  sampleIntervalMs?: number;
  notes?: string;
}

export type CalibrationStatus =
  | "not_started"
  | "in_progress"
  | "completed_unvalidated"
  | "completed_with_holdout"
  | "degraded"
  | "failed"
  | "denied";

export interface BaseEvent {
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  sessionId: string;
  eventId: string;
  type: EventType;
  timestamp: number;
  sessionTimeMs: number;
  pageId: string;
  tabId?: number;
  elementId?: string;
  elementSelector?: string;
  elementCategory?: ElementCategory;
  viewport?: ViewportBox;
  coordinates?: Point;
  quality?: QualityInfo;
  metadata: Record<string, unknown>;
}

export type IntentEvent = BaseEvent;

export interface SessionRecord {
  sessionId: string;
  status: SessionStatus;
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  stoppedAt?: number;
  activeMs?: number;
  consent: ConsentState;
  pageIds: string[];
  eventCount: number;
  lastEventAt?: number;
  calibration: CalibrationRecord;
  tracking: TrackingHealth;
}

export type SessionStatus = "idle" | "running" | "paused" | "stopped";

export interface ConsentState {
  interactionCollection: boolean;
  webcamGaze: boolean;
  aiAnalysis: boolean;
  grantedAt?: number;
  version: string;
}

export interface CalibrationRecord {
  status: CalibrationStatus;
  targetCount: number;
  completedTargets: number;
  holdoutMeanErrorPx?: number;
  holdoutCount?: number;
  lastCalibratedAt?: number;
  cursorAssisted: boolean;
  notes: string[];
}

export interface TrackingHealth {
  lastSampleAt?: number;
  expectedIntervalMs: number;
  recentMissingRate: number;
  qualityIndicator: QualityInfo["indicator"];
  camera: "unknown" | "available" | "denied" | "unavailable" | "unsupported";
  providerId: string;
  providerReady: boolean;
}

export const CONSENT_VERSION = "1.0.0";

export const DEFAULT_CONSENT: ConsentState = {
  interactionCollection: false,
  webcamGaze: false,
  aiAnalysis: false,
  version: CONSENT_VERSION
};

export const DEFAULT_CALIBRATION: CalibrationRecord = {
  status: "not_started",
  targetCount: 9,
  completedTargets: 0,
  cursorAssisted: true,
  notes: [
    "Completing calibration points does not imply accurate gaze estimation.",
    "If cursor-assisted calibration is used, the user may not be looking at the cursor."
  ]
};

export const DEFAULT_TRACKING: TrackingHealth = {
  expectedIntervalMs: 100,
  recentMissingRate: 0,
  qualityIndicator: "unknown",
  camera: "unknown",
  providerId: "webgazer",
  providerReady: false
};
