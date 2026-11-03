import { describe, expect, it } from "vitest";
import {
  assertContentScriptReadyAck,
  assertSessionControlAck,
  deliverSessionControlToTab,
  isMissingReceiverError,
  sendSessionControlWithAck,
  waitForContentScriptReady
} from "./sessionControl.js";

describe("session control protocol", () => {
  const session = {
    sessionId: "sess-123",
    status: "running" as const,
    consent: {
      interactionCollection: true,
      webcamGaze: true,
      aiAnalysis: false,
      version: "1.0.0"
    }
  };

  it("accepts a successful content-script-ready acknowledgement", async () => {
    await expect(
      waitForContentScriptReady({
        tabId: 77,
        sessionId: "sess-123",
        requestId: "ready-ok",
        timeoutMs: 200,
        retries: 0,
        sendMessage: async () => ({
          type: "content-script-ready-ack",
          requestId: "ready-ok",
          tabId: 77,
          sessionId: "sess-123",
          ok: true,
          hasCollectors: true
        })
      })
    ).resolves.toMatchObject({ ok: true, sessionId: "sess-123", tabId: 77 });
  });

  it("rejects stale or mismatched content-script-ready acknowledgements", () => {
    expect(() =>
      assertContentScriptReadyAck(
        {
          type: "content-script-ready-ack",
          requestId: "ready-bad",
          tabId: 77,
          sessionId: "sess-999",
          ok: true,
          hasCollectors: false
        },
        "ready-match",
        77,
        "sess-123"
      )
    ).toThrow(/expected session sess-123|expected ready-match/);
  });

  it("times out when the content script does not respond", async () => {
    await expect(
      waitForContentScriptReady({
        tabId: 88,
        sessionId: "sess-123",
        requestId: "ready-timeout",
        timeoutMs: 25,
        retries: 0,
        sendMessage: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { type: "content-script-ready-ack", requestId: "ready-timeout", tabId: 88, sessionId: "sess-123", ok: true, hasCollectors: true };
        }
      })
    ).rejects.toThrow(/timed out/i);
  });

  it("retries transient missing receiver failures before failing", async () => {
    let attempts = 0;
    await expect(
      waitForContentScriptReady({
        tabId: 99,
        sessionId: "sess-123",
        requestId: "ready-retry",
        timeoutMs: 50,
        retries: 1,
        sendMessage: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("Could not establish connection. Receiving end does not exist.");
          }
          return {
            type: "content-script-ready-ack",
            requestId: "ready-retry",
            tabId: 99,
            sessionId: "sess-123",
            ok: true,
            hasCollectors: true
          };
        }
      })
    ).resolves.toMatchObject({ ok: true, sessionId: "sess-123" });
    expect(attempts).toBe(2);
  });

  it("acknowledges a successful start", async () => {
    await expect(
      deliverSessionControlToTab({
        tabId: 7,
        tabUrl: "https://example.com",
        requestId: "start-ack",
        session,
        status: "running",
        sendMessage: async () => ({
          type: "session-control-ack",
          requestId: "start-ack",
          status: "running",
          sessionId: "sess-123",
          ok: true
        })
      })
    ).resolves.toBeUndefined();
  });

  it("acknowledges a successful resume", async () => {
    await expect(
      deliverSessionControlToTab({
        tabId: 8,
        tabUrl: "https://example.com",
        requestId: "resume-ack",
        session,
        status: "running",
        sendMessage: async () => ({
          type: "session-control-ack",
          requestId: "resume-ack",
          status: "running",
          sessionId: "sess-123",
          ok: true
        })
      })
    ).resolves.toBeUndefined();
  });

  it("reports a missing content-script receiver", async () => {
    await expect(
      deliverSessionControlToTab({
        tabId: 9,
        tabUrl: "https://example.com",
        requestId: "receiver-missing",
        session,
        status: "running",
        sendMessage: async () => {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        }
      })
    ).rejects.toThrow(/No content script receiver/i);
    expect(
      isMissingReceiverError(new Error("Could not establish connection. Receiving end does not exist."))
    ).toBe(true);
  });

  it("reports injection failure clearly", async () => {
    await expect(
      deliverSessionControlToTab({
        tabId: 10,
        tabUrl: "https://example.com",
        requestId: "inject-fail",
        session,
        status: "running",
        sendMessage: async () => {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        },
        inject: async () => {
          throw new Error("content.js failed to load");
        }
      })
    ).rejects.toThrow(/Content script injection failed/i);
  });

  it("detects navigation race when a tab loses context mid-delivery", async () => {
    await expect(
      deliverSessionControlToTab({
        tabId: 11,
        requestId: "nav-race",
        session,
        status: "running",
        sendMessage: async () => {
          throw new Error("The page was navigated while this connection was being established.");
        }
      })
    ).rejects.toThrow(/Page navigation interrupted session-control delivery/i);
  });

  it("rejects invalid acknowledgements", () => {
    expect(() =>
      assertSessionControlAck({
        type: "session-control-ack",
        requestId: "wrong",
        status: "running",
        sessionId: "sess-123",
        ok: false,
        error: "Nope"
      }, "match", "running")
    ).toThrow(/Stale session-control acknowledgement|Content script rejected/);
  });

  it("sends an acknowledgement with the matching request id", async () => {
    const response = await sendSessionControlWithAck(
      async () => ({
        type: "session-control-ack",
        requestId: "match",
        status: "running",
        sessionId: "sess-123",
        ok: true
      }),
      "match",
      session,
      "running"
    );

    expect(response.ok).toBe(true);
  });
});
