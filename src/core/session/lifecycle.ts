import { createSessionId } from "../ids.js";
import {
  CONSENT_VERSION,
  DEFAULT_CALIBRATION,
  DEFAULT_CONSENT,
  DEFAULT_TRACKING,
  type CalibrationRecord,
  type ConsentState,
  type SessionRecord,
  type SessionStatus,
  type TrackingHealth
} from "../schema/events.js";

export function canCollect(consent: ConsentState, status: SessionStatus): boolean {
  return consent.interactionCollection && status === "running";
}

export function canTrackGaze(consent: ConsentState, status: SessionStatus): boolean {
  return canCollect(consent, status) && consent.webcamGaze;
}

export function createSession(partial?: Partial<SessionRecord>): SessionRecord {
  return {
    sessionId: partial?.sessionId ?? createSessionId(),
    status: "idle",
    createdAt: Date.now(),
    startedAt: partial?.startedAt,
    pausedAt: partial?.pausedAt,
    stoppedAt: partial?.stoppedAt,
    activeMs: partial?.activeMs ?? 0,
    consent: { ...DEFAULT_CONSENT, ...partial?.consent, version: CONSENT_VERSION },
    pageIds: [],
    eventCount: 0,
    calibration: { ...DEFAULT_CALIBRATION, ...partial?.calibration },
    tracking: { ...DEFAULT_TRACKING, ...partial?.tracking }
  };
}

export function getElapsedMs(session: SessionRecord, now = Date.now()): number {
  const accumulated = Math.max(0, session.activeMs ?? 0);
  if (!session.startedAt) return accumulated;
  if (session.status !== "running") return accumulated;
  return Math.max(0, accumulated + (now - session.startedAt));
}

export function startSession(session: SessionRecord, now = Date.now()): SessionRecord {
  if (!session.consent.interactionCollection) {
    throw new Error("Cannot start a session without interaction-collection consent");
  }
  if (session.status === "running") return session;
  return {
    ...session,
    status: "running",
    startedAt: now,
    // A stopped/idle session may retain the timestamp of its final event.
    // Keeping it makes recoverInterrupted() immediately pause a fresh restart
    // when that event is older than its 30-second health window.
    lastEventAt: undefined,
    pausedAt: undefined,
    stoppedAt: undefined,
    activeMs: session.status === "stopped" || session.status === "idle" ? 0 : session.activeMs ?? 0
  };
}

export function pauseSession(session: SessionRecord, now = Date.now()): SessionRecord {
  if (session.status !== "running") return session;
  return {
    ...session,
    status: "paused",
    pausedAt: now,
    startedAt: undefined,
    stoppedAt: undefined,
    activeMs: getElapsedMs(session, now)
  };
}

export function resumeSession(session: SessionRecord, now = Date.now()): SessionRecord {
  if (session.status !== "paused") return session;
  if (!session.consent.interactionCollection) {
    throw new Error("Cannot resume without consent");
  }
  return {
    ...session,
    status: "running",
    startedAt: now,
    pausedAt: undefined,
    stoppedAt: undefined
  };
}

export function stopSession(session: SessionRecord, now = Date.now()): SessionRecord {
  return {
    ...session,
    status: "stopped",
    stoppedAt: now,
    startedAt: undefined,
    pausedAt: undefined,
    activeMs: getElapsedMs(session, now)
  };
}

export function grantConsent(
  session: SessionRecord,
  flags: Partial<ConsentState>
): SessionRecord {
  return {
    ...session,
    consent: {
      ...session.consent,
      ...flags,
      version: CONSENT_VERSION,
      grantedAt: Date.now()
    }
  };
}

export function applyCalibration(session: SessionRecord, calibration: CalibrationRecord): SessionRecord {
  return { ...session, calibration };
}

export function applyTracking(session: SessionRecord, tracking: TrackingHealth): SessionRecord {
  return { ...session, tracking };
}

export function recoverInterrupted(session: SessionRecord, now = Date.now()): SessionRecord {
  if (session.status !== "running") return session;
  const last = session.lastEventAt ?? session.startedAt ?? session.createdAt;
  if (now - last < 30_000) return session;
  return pauseSession(session);
}
