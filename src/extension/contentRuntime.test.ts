import { JSDOM } from "jsdom";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as esbuild from "esbuild";

describe("built content-script runtime", () => {
  let dom: JSDOM | undefined;

  afterEach(() => dom?.window.close());

  it("starts, records interaction events, pauses, resumes, and stops", async () => {
    const result = await esbuild.build({
      entryPoints: [join(process.cwd(), "src/extension/content/index.ts")],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "chrome114"
    });
    dom = new JSDOM("<!doctype html><html><body><button id='target'>Target</button></body></html>", {
      url: "https://example.com/test",
      runScripts: "outside-only",
      pretendToBeVisual: true
    });

    const { window } = dom;
    const ingested: Array<Array<{ type: string; sessionId: string }>> = [];
    let contentListener: ((message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean) | undefined;

    class IntersectionObserverStub {
      observe(): void {}
      disconnect(): void {}
    }

    Object.defineProperty(window, "IntersectionObserver", { value: IntersectionObserverStub });
    Object.defineProperty(window.document, "elementFromPoint", {
      value: () => window.document.getElementById("target")
    });
    Object.defineProperty(window, "chrome", {
      value: {
        runtime: {
          getURL: (path: string) => `chrome-extension://test/${path}`,
          onMessage: {
            addListener: (listener: typeof contentListener) => {
              contentListener = listener;
            }
          },
          sendMessage: async (message: { type?: string; payload?: Array<{ type: string; sessionId: string }> }) => {
            if (message.type === "get-state") {
              return { ok: true, payload: { session: { status: "idle" } } };
            }
            if (message.type === "ingest-events" && Array.isArray(message.payload)) {
              ingested.push(message.payload);
            }
            return { ok: true };
          }
        }
      }
    });

    window.eval(result.outputFiles[0].text);
    expect(contentListener).toBeTypeOf("function");

    const send = (message: unknown) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const handled = contentListener?.(message, {}, (value) => resolve(value as Record<string, unknown>));
        if (!handled) reject(new Error("content script did not handle message"));
      });

    await expect(
      send({ type: "content-script-ready", requestId: "ready-1", tabId: 7, sessionId: "session-live" })
    ).resolves.toMatchObject({
      type: "content-script-ready-ack",
      requestId: "ready-1",
      sessionId: "session-live",
      ok: true,
      hasCollectors: false
    });

    await expect(
      send({ type: "session-control", requestId: "start-1", status: "running", sessionId: "session-live" })
    ).resolves.toMatchObject({ type: "session-control-ack", status: "running", ok: true });

    const target = window.document.getElementById("target")!;
    target.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 18 }));
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 12, clientY: 18 }));
    window.dispatchEvent(new window.Event("scroll"));

    await expect(
      send({ type: "session-control", requestId: "pause-1", status: "paused", sessionId: "session-live" })
    ).resolves.toMatchObject({ status: "paused", ok: true });
    expect(ingested.flat().map((event) => event.type)).toEqual(
      expect.arrayContaining(["navigation", "mouse_move", "click", "scroll_depth", "scroll_velocity"])
    );
    expect(ingested.flat().every((event) => event.sessionId === "session-live")).toBe(true);

    await expect(
      send({ type: "session-control", requestId: "resume-1", status: "running", sessionId: "session-live" })
    ).resolves.toMatchObject({ status: "running", ok: true });
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 20, clientY: 22 }));

    await expect(
      send({ type: "begin-calibration", requestId: "calibrate-1" })
    ).resolves.toMatchObject({ ok: true });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(
      window.document.getElementById("intentlens-overlay-root")?.shadowRoot?.querySelector(".cal-target")
    ).not.toBeNull();

    await expect(
      send({ type: "session-control", requestId: "stop-1", status: "stopped", sessionId: "session-live" })
    ).resolves.toMatchObject({ status: "stopped", ok: true });
    expect(ingested.flat().filter((event) => event.type === "click")).toHaveLength(2);
  });
});
