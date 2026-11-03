import { describe, expect, it } from "vitest";
import { isTrustedSender, parseExtensionMessage } from "./messages.js";

describe("extension messages", () => {
  it("accepts known message types", () => {
    expect(parseExtensionMessage({ type: "ping", requestId: "1" }).type).toBe("ping");
  });

  it("rejects unknown types", () => {
    expect(() => parseExtensionMessage({ type: "drop-table", requestId: "1" })).toThrow();
  });

  it("requires the sender to match the extension id", () => {
    expect(isTrustedSender({ id: "abc" }, "abc")).toBe(true);
    expect(isTrustedSender({ id: "other" }, "abc")).toBe(false);
  });
});
