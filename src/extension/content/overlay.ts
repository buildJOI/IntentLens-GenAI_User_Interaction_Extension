const ROOT_ID = "intentlens-overlay-root";

export function ensureOverlay(showIndicator: boolean): HTMLDivElement {
  let root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.attachShadow({ mode: "open" });
    document.documentElement.appendChild(root);
  }
  const shadow = root.shadowRoot!;
  if (!shadow.querySelector("style")) {
    const style = document.createElement("style");
    style.textContent = overlayCss();
    shadow.appendChild(style);
    const indicator = document.createElement("div");
    indicator.className = "indicator";
    indicator.textContent = "IntentLens";
    const cal = document.createElement("div");
    cal.className = "cal-layer";
    cal.hidden = true;
    shadow.appendChild(indicator);
    shadow.appendChild(cal);
  }
  const indicator = shadow.querySelector(".indicator") as HTMLDivElement;
  indicator.hidden = !showIndicator;
  return root;
}

export function setIndicator(mode: "idle" | "running" | "paused" | "calibrating"): void {
  const root = document.getElementById(ROOT_ID);
  const indicator = root?.shadowRoot?.querySelector(".indicator") as HTMLDivElement | null;
  if (!indicator) return;
  indicator.dataset.mode = mode;
  indicator.textContent =
    mode === "running"
      ? "IntentLens recording"
      : mode === "paused"
        ? "IntentLens paused"
        : mode === "calibrating"
          ? "IntentLens calibrating"
          : "IntentLens";
}

export interface CalibrationUi {
  showProgress(done: number, total: number, message: string): HTMLButtonElement;
  hide(): void;
}

export function calibrationUi(): CalibrationUi {
  const root = ensureOverlay(true);
  const layer = root.shadowRoot!.querySelector(".cal-layer") as HTMLDivElement;
  return {
    showProgress(done, total, message) {
      layer.hidden = false;
      layer.innerHTML = "";
      const card = document.createElement("div");
      card.className = "cal-card";
      card.innerHTML = `<h1>Calibrate gaze estimate</h1>
        <p>${message}</p>
        <p class="progress">Target ${done + 1} of ${total}</p>
        <p class="hint">Look at the glowing target, then click it. Cursor-assisted calibration does not prove you were looking at the cursor.</p>
        <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>`;
      const target = document.createElement("button");
      target.className = "cal-target";
      const positions = [
        [8, 8],
        [50, 8],
        [92, 8],
        [8, 50],
        [50, 50],
        [92, 50],
        [8, 92],
        [50, 92],
        [92, 92],
        [25, 25],
        [75, 75]
      ];
      const [x, y] = positions[done % positions.length];
      target.style.left = `${x}%`;
      target.style.top = `${y}%`;
      layer.appendChild(card);
      layer.appendChild(target);
      return target;
    },
    hide() {
      layer.hidden = true;
      layer.innerHTML = "";
    }
  };
}

function overlayCss(): string {
  return `
    :host { all: initial; }
    .indicator {
      position: fixed; z-index: 2147483646; right: 12px; bottom: 12px;
      font: 11px/1.3 ui-sans-serif, system-ui; letter-spacing: .08em; text-transform: uppercase;
      color: #d7fbf4; background: #161920ee; border: 1px solid #3ee0c688; padding: 6px 10px;
      border-radius: 999px; pointer-events: none;
    }
    .indicator[data-mode="running"] { border-color: #c45c5c; color: #ffd4d4; }
    .cal-layer { position: fixed; inset: 0; z-index: 2147483647; background: #0d1018cc; }
    .cal-card {
      position: absolute; left: 50%; top: 24px; transform: translateX(-50%);
      width: min(480px, 92vw); background: #1a1e28; color: #e8edf5; padding: 16px 18px;
      border-radius: 12px; font: 14px/1.45 ui-sans-serif, system-ui; border: 1px solid #2a3142;
    }
    .cal-card h1 { font-size: 16px; margin: 0 0 8px; }
    .progress { color: #3ee0c6; }
    .hint { color: #8b93a7; font-size: 12px; }
    .bar { height: 4px; background: #2a3142; border-radius: 4px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: #8b7cff; }
    .cal-target {
      position: absolute; width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid #3ee0c6; background: #3ee0c655; transform: translate(-50%, -50%);
      box-shadow: 0 0 0 8px #3ee0c622, 0 0 24px #8b7cff88; cursor: pointer;
    }
  `;
}
