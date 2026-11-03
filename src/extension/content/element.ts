import { categorizeElement, type ElementCategory } from "../../core/index.js";

export interface ElementInfo {
  elementId: string;
  selector: string;
  category: ElementCategory;
  tag: string;
}

const cache = new WeakMap<Element, ElementInfo>();
let serial = 0;

export function describeElement(el: Element | null): ElementInfo | undefined {
  if (!el || el === document.documentElement || el === document.body) return undefined;
  const cached = cache.get(el);
  if (cached) return cached;
  if (!el.getAttribute("data-intentlens-id")) {
    serial += 1;
    el.setAttribute("data-intentlens-id", `il_${serial}`);
  }
  const elementId = el.getAttribute("data-intentlens-id")!;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") ?? undefined;
  const type = el.getAttribute("type") ?? undefined;
  const info: ElementInfo = {
    elementId,
    selector: cssPath(el),
    category: categorizeElement(tag, role, type),
    tag
  };
  cache.set(el, info);
  return info;
}

export function elementAtPoint(x: number, y: number): ElementInfo | undefined {
  const node = document.elementFromPoint(x, y);
  return describeElement(node);
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && parts.length < 4 && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const cls = current.classList[0] ? `.${current.classList[0]}` : "";
    parts.unshift(`${tag}${id}${cls}`);
    current = current.parentElement;
  }
  return parts.join(" > ").slice(0, 280);
}

export function regionId(scrollY: number, viewportH: number): string {
  const band = Math.max(1, Math.floor(viewportH / 2));
  return `band_${Math.floor(scrollY / band)}`;
}
