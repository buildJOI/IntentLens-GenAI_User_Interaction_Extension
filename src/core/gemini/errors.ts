export interface ProxyError {
  code:
    | "rate_limited"
    | "unauthorized"
    | "invalid_request"
    | "invalid_model_output"
    | "timeout"
    | "unavailable";
  message: string;
  retryable: boolean;
  pipelineContinues: true;
}

export function isRetryableGeminiError(status: number): boolean {
  return status === 429 || status === 503 || status === 408;
}

export function classifyProxyError(status: number, body: string): ProxyError {
  if (status === 401 || status === 403) {
    return {
      code: "unauthorized",
      message: body || "Unauthorized",
      retryable: false,
      pipelineContinues: true
    };
  }
  if (status === 429) {
    return {
      code: "rate_limited",
      message: body || "Rate limited",
      retryable: true,
      pipelineContinues: true
    };
  }
  if (status === 408) {
    return {
      code: "timeout",
      message: body || "Timeout",
      retryable: true,
      pipelineContinues: true
    };
  }
  if (status === 400) {
    return {
      code: "invalid_request",
      message: body || "Invalid request",
      retryable: false,
      pipelineContinues: true
    };
  }
  if (/invalid/i.test(body)) {
    return {
      code: "invalid_model_output",
      message: body,
      retryable: false,
      pipelineContinues: true
    };
  }
  return {
    code: "unavailable",
    message: body || "Gemini proxy unavailable",
    retryable: true,
    pipelineContinues: true
  };
}
