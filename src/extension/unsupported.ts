const BLOCKED = /^(chrome|chrome-extension|edge|about|devtools|view-source|https:\/\/chrome\.google\.com\/webstore)/i;

export function isUnsupportedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return BLOCKED.test(url);
}
