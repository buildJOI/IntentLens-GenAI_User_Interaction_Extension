import { describe, expect, it } from "vitest";
import { normalizeEvents } from "./normalize.js";
import { recoverInterrupted, createSession, grantConsent, startSession } from "../session/lifecycle.js";
import { createEvent } from "../testkit.js";

describe("interrupted sessions", () => {
  it("keeps already-accepted events and pauses a stale running session", () => {
    const seen = new Set<string>();
    const first = normalizeEvents([createEvent("click", { eventId: "keep" })], seen);
    expect(first.accepted).toHaveLength(1);
    let session = startSession(grantConsent(createSession(), { interactionCollection: true }));
    session = { ...session, lastEventAt: 1 };
    session = recoverInterrupted(session, 120_000);
    expect(session.status).toBe("paused");
    const again = normalizeEvents([createEvent("click", { eventId: "keep" })], seen);
    expect(again.duplicatesDropped).toBe(1);
  });
});
