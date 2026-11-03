import { throttle, type IntentEvent } from "../../core/index.js";
import { describeElement, elementAtPoint, regionId } from "./element.js";
import { makeEvent, type SessionContext } from "./factory.js";

export function attachCollectors(
  ctx: () => SessionContext | undefined,
  emit: (event: IntentEvent) => void,
  options: { mouseMoveThrottleMs: number }
): () => void {
  const cleanups: Array<() => void> = [];

  const mouseMove = throttle((event: MouseEvent) => {
    const session = ctx();
    if (!session) return;
    const el = elementAtPoint(event.clientX, event.clientY);
    emit(
      makeEvent(
        session,
        "mouse_move",
        {
          coordinates: { x: event.clientX, y: event.clientY },
          metadata: { buttons: event.buttons }
        },
        el
      )
    );
  }, options.mouseMoveThrottleMs);

  const onClick = (event: MouseEvent) => {
    const session = ctx();
    if (!session) return;
    const el = describeElement(event.target instanceof Element ? event.target : null);
    emit(
      makeEvent(
        session,
        "click",
        {
          coordinates: { x: event.clientX, y: event.clientY },
          metadata: { button: event.button }
        },
        el
      )
    );
  };

  let lastScrollY = window.scrollY;
  let lastScrollT = Date.now();
  const visited = new Set<string>();

  const onScroll = throttle(() => {
    const session = ctx();
    if (!session) return;
    const docH = Math.max(document.documentElement.scrollHeight, 1);
    const depth = Math.min(1, (window.scrollY + window.innerHeight) / docH);
    const now = Date.now();
    const dt = Math.max(1, now - lastScrollT);
    const velocity = ((window.scrollY - lastScrollY) / dt) * 1000;
    lastScrollY = window.scrollY;
    lastScrollT = now;
    emit(
      makeEvent(session, "scroll_depth", {
        metadata: { depthRatio: depth, scrollY: window.scrollY }
      })
    );
    emit(
      makeEvent(session, "scroll_velocity", {
        metadata: { velocityPxPerSec: velocity }
      })
    );
    const rid = regionId(window.scrollY, window.innerHeight);
    if (visited.has(rid)) {
      emit(makeEvent(session, "region_revisit", { metadata: { regionId: rid } }));
    } else {
      visited.add(rid);
    }
  }, 200);

  const hoverTimes = new WeakMap<Element, number>();
  const onOver = (event: MouseEvent) => {
    if (event.target instanceof Element) hoverTimes.set(event.target, Date.now());
  };
  const onOut = (event: MouseEvent) => {
    const session = ctx();
    if (!session || !(event.target instanceof Element)) return;
    const start = hoverTimes.get(event.target);
    if (!start) return;
    const duration = Date.now() - start;
    if (duration < 80) return;
    emit(
      makeEvent(
        session,
        "hover",
        { metadata: { durationMs: duration } },
        describeElement(event.target)
      )
    );
  };

  const onKey = (event: KeyboardEvent) => {
    const session = ctx();
    if (!session) return;
    emit(
      makeEvent(session, "keyboard", {
        metadata: {
          category: categorizeKey(event),
          repeat: event.repeat
        }
      })
    );
  };

  const onVis = () => {
    const session = ctx();
    if (!session) return;
    emit(
      makeEvent(session, "tab_visibility", {
        metadata: {
          documentHidden: document.hidden,
          visibilityState: document.visibilityState
        }
      })
    );
  };
  const onFocus = () => {
    const session = ctx();
    if (!session) return;
    emit(makeEvent(session, "tab_visibility", { metadata: { windowFocused: true } }));
  };
  const onBlur = () => {
    const session = ctx();
    if (!session) return;
    emit(makeEvent(session, "tab_visibility", { metadata: { windowFocused: false } }));
  };

  const onNav = () => {
    const session = ctx();
    if (!session) return;
    emit(
      makeEvent(session, "navigation", {
        metadata: { reason: "location", path: location.pathname }
      })
    );
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const session = ctx();
      if (!session) return;
      for (const entry of entries.slice(0, 8)) {
        if (!(entry.target instanceof Element)) continue;
        emit(
          makeEvent(
            session,
            "element_visibility",
            {
              metadata: {
                intersectionRatio: entry.intersectionRatio,
                visible: entry.isIntersecting
              }
            },
            describeElement(entry.target)
          )
        );
      }
    },
    { threshold: [0, 0.5, 1] }
  );

  const watchInteractive = () => {
    document
      .querySelectorAll("button, a, input, textarea, select, [role='button']")
      .forEach((el) => observer.observe(el));
  };
  watchInteractive();
  const mo = new MutationObserver(() => watchInteractive());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("mousemove", mouseMove, { passive: true });
  window.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("mouseover", onOver, true);
  window.addEventListener("mouseout", onOut, true);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  window.addEventListener("hashchange", onNav);
  window.addEventListener("popstate", onNav);

  cleanups.push(() => {
    window.removeEventListener("mousemove", mouseMove);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("mouseover", onOver, true);
    window.removeEventListener("mouseout", onOut, true);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("hashchange", onNav);
    window.removeEventListener("popstate", onNav);
    observer.disconnect();
    mo.disconnect();
  });

  return () => cleanups.forEach((fn) => fn());
}

function categorizeKey(event: KeyboardEvent): string {
  const name = event.key;
  if (name === "Enter") return "enter";
  if (name === "Tab") return "tab";
  if (name === "Escape") return "escape";
  if (["Shift", "Control", "Alt", "Meta"].includes(name)) return "modifier";
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(name)) {
    return "navigation";
  }
  if (["Backspace", "Delete"].includes(name)) return "edit";
  if (name.length === 1) return "printable";
  return "other";
}
