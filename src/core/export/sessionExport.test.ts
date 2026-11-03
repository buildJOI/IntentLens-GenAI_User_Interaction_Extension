import { describe, expect, it } from "vitest";
import { buildExport, parseExport, serializeExport } from "./sessionExport.js";
import { createSession } from "../session/lifecycle.js";
import { createEvent } from "../testkit.js";

describe("session export", () => {
  it("round-trips a session", () => {
    const data = buildExport({
      session: createSession({ sessionId: "ses_x" }),
      events: [createEvent("click", { sessionId: "ses_x" })]
    });
    const raw = serializeExport(data);
    const parsed = parseExport(raw);
    expect(parsed.session.sessionId).toBe("ses_x");
    expect(parsed.events).toHaveLength(1);
  });

  it("rejects malformed exports", () => {
    expect(() => parseExport("{}")).toThrow(/Invalid/);
  });
});
