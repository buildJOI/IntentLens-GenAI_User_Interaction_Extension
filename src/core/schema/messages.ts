import { z } from "zod";

export const MESSAGE_TYPES = [
  "ping",
  "get-state",
  "start-session",
  "pause-session",
  "resume-session",
  "stop-session",
  "set-consent",
  "ingest-events",
  "get-events",
  "get-analytics",
  "get-findings",
  "export-session",
  "delete-session",
  "delete-all",
  "open-dashboard",
  "begin-calibration",
  "calibration-progress",
  "ask-gemini",
  "compare-sessions",
  "update-settings"
] as const;

export const extensionMessageSchema = z.object({
  type: z.enum(MESSAGE_TYPES),
  requestId: z.string().min(1),
  payload: z.unknown().optional()
});

export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

export function parseExtensionMessage(input: unknown): ExtensionMessage {
  return extensionMessageSchema.parse(input);
}

export function isTrustedSender(sender: { id?: string }, extensionId: string): boolean {
  return sender.id === extensionId;
}
