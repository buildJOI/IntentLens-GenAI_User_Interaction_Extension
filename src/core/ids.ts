export function createId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function createSessionId(): string {
  return createId("ses");
}

export function createEventId(): string {
  return createId("evt");
}

export function createFindingId(): string {
  return createId("fnd");
}

export function createPageId(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "unknown";
  }
}
