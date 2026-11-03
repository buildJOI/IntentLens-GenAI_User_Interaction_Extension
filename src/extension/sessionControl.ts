import type { SessionRecord, SessionStatus } from "../core/index.js";
import { isUnsupportedUrl } from "./unsupported.js";

export interface SessionControlRequest {
  type: "session-control";
  requestId: string;
  status: SessionStatus;
  sessionId: string;
  webcamGaze: boolean;
}

export interface ContentScriptReadyRequest {
  type: "content-script-ready";
  requestId: string;
  sessionId: string;
  tabId: number;
}

export interface SessionControlAck {
  type: "session-control-ack";
  requestId: string;
  status: SessionStatus;
  sessionId: string;
  ok: boolean;
  error?: string;
}

export interface ContentScriptReadyAck {
  type: "content-script-ready-ack";
  requestId: string;
  tabId: number;
  sessionId: string;
  activeSessionId?: string;
  ok: boolean;
  hasCollectors: boolean;
  error?: string;
}

export function buildContentScriptReadyAck(
  request: Pick<ContentScriptReadyRequest, "type" | "requestId" | "sessionId" | "tabId">,
  activeSessionId: string | undefined,
  hasCollectors: boolean
): ContentScriptReadyAck {
  const requestedSessionId = request.sessionId || "";
  const currentSessionId = activeSessionId || "";

  return {
    type: "content-script-ready-ack",
    requestId: request.requestId,
    tabId: request.tabId,
    // Before collection starts there is no active content-side session yet.
    // Echo the requested id so the background can verify this acknowledgement.
    // Readiness only establishes that the receiver is alive. Session-control
    // performs the actual transition and replaces any previous collectors.
    sessionId: requestedSessionId || currentSessionId,
    activeSessionId: currentSessionId || undefined,
    ok: true,
    hasCollectors,
    error: undefined
  };
}

export interface SessionControlDeliveryOptions {
  tabId: number;
  tabUrl?: string;
  requestId: string;
  session: Pick<SessionRecord, "sessionId" | "status" | "consent">;
  status: SessionStatus;
  sendMessage: (payload: SessionControlRequest) => Promise<unknown>;
  inject?: () => Promise<void>;
}

export interface ContentScriptReadyOptions {
  tabId: number;
  sessionId: string;
  requestId: string;
  timeoutMs?: number;
  retries?: number;
  sendMessage: (payload: ContentScriptReadyRequest) => Promise<unknown>;
}

const MISSING_RECEIVER_PATTERNS = [
  /receiving end does not exist/i,
  /no matching message handler/i,
  /could not establish connection/i,
  /message handler is not defined/i,
  /does not exist/i
];

export function isMissingReceiverError(error: unknown): boolean {
  if (error instanceof Error) {
    return MISSING_RECEIVER_PATTERNS.some((pattern) => pattern.test(error.message));
  }
  return false;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function buildSessionControlRequest(
  session: Pick<SessionRecord, "sessionId" | "status" | "consent">,
  status: SessionStatus,
  requestId: string
): SessionControlRequest {
  return {
    type: "session-control",
    requestId,
    status,
    sessionId: session.sessionId,
    webcamGaze: Boolean(session.consent?.webcamGaze)
  };
}

export function isSessionControlAck(value: unknown): value is SessionControlAck {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).type === "session-control-ack";
}

export function isContentScriptReadyAck(value: unknown): value is ContentScriptReadyAck {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).type === "content-script-ready-ack";
}

export function assertContentScriptReadyAck(
  value: unknown,
  requestId?: string,
  tabId?: number,
  sessionId?: string
): ContentScriptReadyAck {
  if (!isContentScriptReadyAck(value)) {
    throw new Error("Invalid content-script-ready acknowledgement: missing content-script-ready-ack payload");
  }
  if (requestId && value.requestId !== requestId) {
    throw new Error(`Stale content-script-ready acknowledgement: expected ${requestId}, received ${value.requestId}`);
  }
  if (tabId !== undefined && value.tabId !== tabId) {
    throw new Error(`Content-script-ready acknowledgement mismatch: expected tab ${tabId}, received ${value.tabId}`);
  }
  if (sessionId && sessionId !== "" && value.sessionId !== sessionId) {
    throw new Error(`Content-script-ready acknowledgement mismatch: expected session ${sessionId}, received ${value.sessionId}`);
  }
  if (!value.ok) {
    throw new Error(value.error ?? "Content script reported a readiness failure");
  }
  return value;
}

export function assertSessionControlAck(
  value: unknown,
  requestId?: string,
  status?: SessionStatus
): SessionControlAck {
  if (!isSessionControlAck(value)) {
    throw new Error("Invalid session-control acknowledgement: missing session-control-ack payload");
  }
  if (requestId && value.requestId !== requestId) {
    throw new Error(`Stale session-control acknowledgement: expected ${requestId}, received ${value.requestId}`);
  }
  if (status && value.status !== status) {
    throw new Error(`Session-control acknowledgement mismatch: expected ${status}, received ${value.status}`);
  }
  if (!value.ok) {
    throw new Error(value.error ?? `Content script rejected ${status ?? value.status} state`);
  }
  return value;
}

export async function waitForContentScriptReady({
  tabId,
  sessionId,
  requestId,
  timeoutMs = 2000,
  retries = 2,
  sendMessage
}: ContentScriptReadyOptions): Promise<ContentScriptReadyAck> {
  const payload: ContentScriptReadyRequest = {
    type: "content-script-ready",
    requestId,
    sessionId,
    tabId
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await withTimeout(sendMessage(payload), timeoutMs, "content-script-ready");
      return assertContentScriptReadyAck(response, requestId, tabId, sessionId);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < retries && isMissingReceiverError(error)) {
        continue;
      }
      throw new Error(`Content script readiness failed for tab ${tabId}: ${message}`);
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Content script readiness failed for tab ${tabId}: ${lastError.message}`
      : `Content script readiness failed for tab ${tabId}.`
  );
}

export async function deliverSessionControlToTab({
  tabId,
  tabUrl,
  requestId,
  session,
  status,
  sendMessage,
  inject
}: SessionControlDeliveryOptions): Promise<void> {
  const payload = buildSessionControlRequest(session, status, requestId);

  try {
    const response = await sendMessage(payload);
    assertSessionControlAck(response, requestId, status);
    return;
  } catch (error) {
    const original = error instanceof Error ? error.message : String(error);
    if (tabUrl && isUnsupportedUrl(tabUrl)) {
      throw new Error(`IntentLens cannot collect on unsupported page: ${tabUrl}`);
    }
    if (!tabUrl) {
      throw new Error(`Page navigation interrupted session-control delivery for ${status} on tab ${tabId}.`);
    }
    if (!isMissingReceiverError(error)) {
      throw new Error(`Content script did not acknowledge ${status} on tab ${tabId}: ${original}`);
    }
    if (inject) {
      try {
        await inject();
      } catch (injectError) {
        const injected = injectError instanceof Error ? injectError.message : String(injectError);
        throw new Error(`Content script injection failed for ${status} on tab ${tabId}: ${injected}`);
      }
    }

    try {
      const retry = await sendMessage(payload);
      assertSessionControlAck(retry, requestId, status);
      return;
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
      if (isMissingReceiverError(error) || isMissingReceiverError(retryError)) {
        throw new Error(`No content script receiver is available for ${status} on tab ${tabId}.`);
      }
      throw new Error(`Content script did not acknowledge ${status} on tab ${tabId}: ${retryMessage || original}`);
    }
  }
}

export async function sendSessionControlWithAck(
  sendMessage: (payload: SessionControlRequest) => Promise<unknown>,
  requestId: string,
  session: Pick<SessionRecord, "sessionId" | "status" | "consent">,
  status: SessionStatus
): Promise<SessionControlAck> {
  const payload = buildSessionControlRequest(session, status, requestId);
  const response = await sendMessage(payload);
  return assertSessionControlAck(response, requestId, status);
}
