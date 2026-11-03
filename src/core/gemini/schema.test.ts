import { describe, expect, it } from "vitest";
import { parseGeminiInsight, analyzeRequestSchema } from "./schema.js";

const valid = {
  summary: "Coverage is incomplete.",
  facts: [{ statement: "4 mapped gaze samples", evidence: ["validGazeSamples"], kind: "computed" }],
  hypotheses: [
    {
      statement: "The CTA may be easy to skip",
      evidence: ["fnd_1"],
      limitations: ["low coverage"]
    }
  ],
  recommendations: [
    {
      statement: "Inspect CTA contrast",
      evidence: ["btn.dwellShare"],
      investigation: "Compare against peer buttons"
    }
  ],
  missingEvidence: ["holdout calibration error"],
  limitations: ["gaze is estimated"]
};

describe("gemini insight validation", () => {
  it("accepts schema-valid JSON", () => {
    expect(parseGeminiInsight(valid).summary).toContain("Coverage");
  });

  it("parses fenced JSON", () => {
    expect(parseGeminiInsight("```json\n" + JSON.stringify(valid) + "\n```").facts).toHaveLength(1);
  });

  it("rejects insights without evidence", () => {
    expect(() =>
      parseGeminiInsight({
        ...valid,
        facts: [{ statement: "x", evidence: [], kind: "observed" }]
      })
    ).toThrow();
  });

  it("validates analyze requests", () => {
    const parsed = analyzeRequestSchema.parse({
      sessionId: "ses_1",
      metrics: { dataCoverage: 0.2 },
      findings: []
    });
    expect(parsed.sessionId).toBe("ses_1");
  });
});
