import type { IntentEvent, SessionRecord } from "../schema/events.js";
import type { SessionMetrics } from "../analytics/metrics.js";
import type { UsabilityFinding } from "../mismatch/detector.js";
import type { GeminiInsight } from "../gemini/schema.js";

export interface SessionExport {
  exportedAt: number;
  formatVersion: "1.0.0";
  session: SessionRecord;
  events: IntentEvent[];
  metrics?: SessionMetrics;
  findings?: UsabilityFinding[];
  insights?: GeminiInsight[];
}

export function buildExport(parts: Omit<SessionExport, "exportedAt" | "formatVersion">): SessionExport {
  return {
    exportedAt: Date.now(),
    formatVersion: "1.0.0",
    ...parts
  };
}

export function serializeExport(data: SessionExport): string {
  return JSON.stringify(data, null, 2);
}

export function parseExport(raw: string): SessionExport {
  const parsed = JSON.parse(raw) as SessionExport;
  if (parsed.formatVersion !== "1.0.0" || !parsed.session || !Array.isArray(parsed.events)) {
    throw new Error("Invalid session export");
  }
  return parsed;
}
