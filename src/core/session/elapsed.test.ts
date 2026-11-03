import { describe, expect, it } from "vitest";
import { getElapsedMs, createSession, grantConsent, pauseSession, resumeSession, startSession, stopSession } from "./lifecycle.js";

describe("elapsed time tracking", () => {
  it("tracks active duration across pause and resume", () => {
    let session = grantConsent(createSession(), { interactionCollection: true });
    session = startSession(session, 0);
    const first = { ...session, startedAt: 1_000, activeMs: 0 };
    expect(getElapsedMs(first, 5_000)).toBe(4_000);

    const paused = pauseSession({ ...first, startedAt: 1_000, activeMs: 0 }, 5_000);
    expect(getElapsedMs(paused, 5_000)).toBe(4_000);

    const resumed = resumeSession({ ...paused, activeMs: 4_000, startedAt: 1_000 }, 5_000);
    expect(getElapsedMs(resumed, 7_000)).toBe(6_000);
  });

  it("resets elapsed time on a new started session and stops cleanly", () => {
    const session = grantConsent(createSession(), { interactionCollection: true });
    const started = startSession({ ...session, activeMs: 0 }, 1_000);
    expect(getElapsedMs(started, 5_000)).toBe(4_000);

    const stopped = stopSession(started, 5_000);
    expect(getElapsedMs(stopped, 5_000)).toBe(4_000);

    const restarted = startSession({ ...stopped, activeMs: 0, startedAt: undefined }, 5_000);
    expect(getElapsedMs(restarted, 9_000)).toBe(4_000);
  });
});
