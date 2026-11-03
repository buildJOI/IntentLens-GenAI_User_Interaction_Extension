import { describe, expect, it } from "vitest";
import { EVENT_SCHEMA_VERSION } from "./events.js";
import { isValidEvent, parseEvent } from "./validate.js";
import { createEvent } from "../testkit.js";

describe("event schema", () => {
  it("accepts a well-formed event", () => {
    const event = createEvent("click");
    expect(parseEvent(event).eventId).toBe(event.eventId);
    expect(isValidEvent(event)).toBe(true);
  });

  it("rejects wrong schema version", () => {
    expect(isValidEvent(createEvent("click", { schemaVersion: "0.0.1" as typeof EVENT_SCHEMA_VERSION }))).toBe(
      false
    );
  });

  it("rejects sensitive metadata", () => {
    expect(() => parseEvent(createEvent("keyboard", { metadata: { typed: "secret" } }))).toThrow(
      /Sensitive/
    );
  });

  it("rejects missing session id", () => {
    expect(isValidEvent(createEvent("click", { sessionId: "" }))).toBe(false);
  });
});
