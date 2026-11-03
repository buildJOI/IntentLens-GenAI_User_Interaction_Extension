import { describe, expect, it } from "vitest";
import { classifyProxyError, isRetryableGeminiError } from "./errors.js";

describe("gemini error handling", () => {
  it("classifies rate limits as retryable", () => {
    expect(isRetryableGeminiError(429)).toBe(true);
    expect(classifyProxyError(429, "quota")).toMatchObject({ code: "rate_limited" });
  });

  it("classifies invalid model JSON as non-retryable", () => {
    expect(isRetryableGeminiError(200)).toBe(false);
    expect(classifyProxyError(502, "invalid insight json")).toMatchObject({
      code: "invalid_model_output"
    });
  });

  it("keeps collection independent by returning a structured failure", () => {
    const error = classifyProxyError(0, "fetch failed");
    expect(error.pipelineContinues).toBe(true);
  });
});
