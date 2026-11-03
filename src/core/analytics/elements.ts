import type { ElementCategory, IntentEvent, Point } from "../schema/events.js";

export interface ElementGeometry {
  elementId: string;
  selector?: string;
  category: ElementCategory;
  /** Viewport-relative bounding box at sample time. */
  box: { x: number; y: number; width: number; height: number };
  visible: boolean;
  zIndex: number;
}

/**
 * Mapping rules:
 * 1. Ignore samples whose coordinates fall outside the viewport.
 * 2. Ignore elements with visible=false or zero area (off-screen / collapsed).
 * 3. Among remaining overlapping boxes that contain the point, pick the highest zIndex,
 *    then the smallest area (deepest typical target).
 * 4. Sticky elements are eligible if their recorded box contains the point.
 * 5. Unclassified samples remain unmapped (elementId undefined).
 */
export function mapPointToElement(
  point: Point,
  viewport: { width: number; height: number },
  elements: ElementGeometry[]
): ElementGeometry | undefined {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x > viewport.width ||
    point.y > viewport.height
  ) {
    return undefined;
  }

  const hits = elements.filter((el) => {
    if (!el.visible || el.box.width <= 0 || el.box.height <= 0) return false;
    return contains(el.box, point);
  });
  if (hits.length === 0) return undefined;

  hits.sort((a, b) => {
    if (a.zIndex !== b.zIndex) return b.zIndex - a.zIndex;
    return area(a.box) - area(b.box);
  });
  return hits[0];
}

export function contains(
  box: ElementGeometry["box"],
  point: Point
): boolean {
  return (
    point.x >= box.x &&
    point.y >= box.y &&
    point.x <= box.x + box.width &&
    point.y <= box.y + box.height
  );
}

function area(box: ElementGeometry["box"]): number {
  return box.width * box.height;
}

export function categorizeElement(tag: string, role?: string, type?: string): ElementCategory {
  const t = tag.toLowerCase();
  const r = (role ?? "").toLowerCase();
  if (t === "button" || r === "button") return "button";
  if (t === "a" || r === "link") return "link";
  if (t === "input" || t === "textarea" || t === "select") return "input";
  if (t === "img" || t === "video" || t === "canvas") return "media";
  if (/^h[1-6]$/.test(t)) return "heading";
  if (t === "nav" || r === "navigation") return "nav";
  if (r === "textbox") return "input";
  if (type === "submit") return "button";
  if (r === "menuitem" || t === "summary") return "interactive";
  if (t === "p" || t === "span" || t === "li" || t === "td") return "text";
  return "unknown";
}

export function mappedElementId(event: IntentEvent): string | undefined {
  if (event.elementId && event.elementId.length > 0) return event.elementId;
  return undefined;
}
