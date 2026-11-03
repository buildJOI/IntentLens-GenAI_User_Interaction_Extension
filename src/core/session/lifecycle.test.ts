import { describe, expect, it } from "vitest";
import {
  createSession,
  grantConsent,
  pauseSession,
  recoverInterrupted,
  resumeSession,
  startSession,
  stopSession
} from "./lifecycle.js";

describe("session lifecycle", () => {
  it("refuses to start without consent", () => {
    expect(() => startSession(createSession())).toThrow(/consent/);
  });

  it("starts, pauses, resumes, and stops", () => {
    let session = grantConsent(createSession(), { interactionCollection: true });
    session = startSession(session);
    expect(session.status).toBe("running");
    session = pauseSession(session);
    expect(session.status).toBe("paused");
    session = resumeSession(session);
    expect(session.status).toBe("running");
    session = stopSession(session);
    expect(session.status).toBe("stopped");
  });

  it("tracks event count and state transitions through a live collection cycle", () => {
    let session = grantConsent(createSession(), { interactionCollection: true });
    session = startSession(session);
    expect(session.status).toBe("running");
    const started = { ...session, eventCount: 3, lastEventAt: Date.now() };
    expect(started.eventCount).toBe(3);
    const paused = pauseSession(started);
    expect(paused.status).toBe("paused");
    const resumed = resumeSession(paused);
    expect(resumed.status).toBe("running");
    const stopped = stopSession(resumed);
    expect(stopped.status).toBe("stopped");
  });

  it("recovers an interrupted running session", () => {
    let session = grantConsent(createSession(), { interactionCollection: true });
    session = startSession(session);
    session = { ...session, lastEventAt: Date.now() - 60_000 };
    const recovered = recoverInterrupted(session, Date.now());
    expect(recovered.status).toBe("paused");
  });

  it("resume returns to running state and keeps collection enabled", () => {
    let session = grantConsent(createSession(), { interactionCollection: true });
    session = startSession(session);
    session = pauseSession(session);
    expect(session.status).toBe("paused");
    const resumed = resumeSession(session);
    expect(resumed.status).toBe("running");
    expect(resumed.consent.interactionCollection).toBe(true);
  });
});
