import { z } from "zod";

export const geminiInsightSchema = z.object({
  summary: z.string().min(1),
  facts: z.array(
    z.object({
      statement: z.string(),
      evidence: z.array(z.string()).min(1),
      kind: z.enum(["observed", "computed"])
    })
  ),
  hypotheses: z.array(
    z.object({
      statement: z.string(),
      evidence: z.array(z.string()).min(1),
      limitations: z.array(z.string())
    })
  ),
  recommendations: z.array(
    z.object({
      statement: z.string(),
      evidence: z.array(z.string()).min(1),
      investigation: z.string()
    })
  ),
  missingEvidence: z.array(z.string()),
  limitations: z.array(z.string()).min(1)
});

export type GeminiInsight = z.infer<typeof geminiInsightSchema>;

export const analyzeRequestSchema = z.object({
  question: z.string().max(2000).optional(),
  sessionId: z.string().min(1),
  metrics: z.unknown(),
  findings: z.unknown(),
  eventRefs: z.array(z.string()).max(200).optional(),
  comparable: z.unknown().optional(),
  pageMeta: z
    .object({
      pageId: z.string(),
      title: z.string().max(200).optional(),
      headings: z.array(z.string().max(120)).max(20).optional()
    })
    .optional()
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export function parseGeminiInsight(input: unknown): GeminiInsight {
  return geminiInsightSchema.parse(extractJson(input));
}

export function extractJson(input: unknown): unknown {
  if (typeof input === "object" && input !== null) return input;
  if (typeof input !== "string") throw new Error("Gemini response is not JSON");
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw);
}
