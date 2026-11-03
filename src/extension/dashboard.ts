import { EVENT_TYPES, getElapsedMs, type IntentEvent } from "../core/index.js";

function send(type: string, payload?: unknown) {
  return chrome.runtime.sendMessage({ type, requestId: `${type}_${Date.now()}`, payload });
}

function showActionStatus(message: string, success = false): void {
  const status = document.getElementById("action-status")!;
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle("success", success);
}

async function requestHostPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.request({
      origins: ["http://*/*", "https://*/*"]
    });
  } catch (error) {
    showActionStatus(error instanceof Error ? error.message : "Unable to request page access.");
    return false;
  }
}

const panels = ["overview", "events", "attention", "insights", "manage"];
const titles: Record<string, string> = {
  overview: "Session overview",
  events: "Live event inspector",
  attention: "Attention visualization",
  insights: "AI insights",
  manage: "Session management"
};

for (const button of document.querySelectorAll("nav button")) {
  button.addEventListener("click", () => {
    const panel = (button as HTMLButtonElement).dataset.panel!;
    for (const id of panels) document.getElementById(id)!.classList.toggle("hidden", id !== panel);
    document.getElementById("panel-title")!.textContent = titles[panel];
    document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b === button));
  });
}

const filter = document.getElementById("event-filter") as HTMLSelectElement;
for (const type of EVENT_TYPES) {
  const opt = document.createElement("option");
  opt.value = type;
  opt.textContent = type;
  filter.appendChild(opt);
}

async function refresh(): Promise<void> {
  const res = await send("get-state");
  if (!res?.ok) return;
  const { session, metrics, findings, insights, events, settings, sessionsIndex } = res.payload;
  renderStats(session, metrics);
  renderEvents(events);
  renderAttention(events, metrics);
  renderFindings(findings);
  renderInsights(insights);
  renderManage(session, settings, sessionsIndex, metrics);
}

function renderStats(session: Record<string, unknown>, metrics: Record<string, unknown>): void {
  const calibration = session.calibration as { status?: string; notes?: string[] } | undefined;
  const elapsedSeconds = Math.round(getElapsedMs(session as any) / 1000);
  const coverage = Math.max(0, Math.min(100, Math.round(Number(metrics.dataCoverage ?? 0) * 100)));
  const isRunning = session.status === "running";
  const hasGaze = Number(metrics.validGazeSamples ?? 0) > 0;
  const trackingLabel = hasGaze ? "Active" : isRunning ? "Starting" : "Idle";
  document.getElementById("hero-tracking")!.textContent = trackingLabel;
  document.getElementById("hero-events")!.textContent = String(metrics.eventCount ?? 0);
  document.getElementById("hero-duration")!.textContent = formatDuration(elapsedSeconds);
  document.getElementById("attention-score")!.textContent = `${coverage}%`;
  document.getElementById("score-caption")!.textContent = hasGaze
    ? "Valid mapped gaze coverage"
    : isRunning ? "Collecting session signals" : "Waiting for a session";
  document.getElementById("attention-ring")!.style.setProperty("--score", String(coverage));
  const pill = document.getElementById("session-pill")!;
  pill.classList.toggle("live", isRunning);
  pill.querySelector("span")!.textContent = isRunning ? "Active session" : `Session ${String(session.status ?? "idle")}`;
  drawOverviewTimeline((metrics.timeline as Array<{ t: number; type: string }> | undefined) ?? []);
  const items = [
    ["Status", session.status],
    ["Elapsed", `${elapsedSeconds}s`],
    ["Collection", session.status === "running" ? "active" : "inactive"],
    ["Calibration", calibration?.status ?? "not_started"],
    ["Tracking quality", metrics.trackingQuality],
    ["Events", metrics.eventCount],
    ["Valid gaze samples", metrics.validGazeSamples],
    ["Unmapped gaze", metrics.unmappedGazeSamples],
    ["Missing gaze", metrics.missingGazeSamples],
    ["Data coverage", `${Math.round(Number(metrics.dataCoverage ?? 0) * 100)}% of expected samples`],
    ["Max scroll depth", `${Math.round(Number(metrics.maxScrollDepth ?? 0) * 100)}%`]
  ];
  if (calibration?.status === "failed" && calibration.notes?.length) {
    items.push(["Calibration error", calibration.notes.join(" ")]);
  }
  document.getElementById("stat-grid")!.innerHTML = items
    .map(([k, v]) => `<article class="stat"><span>${k}</span><b>${String(v)}</b></article>`)
    .join("");
  document.getElementById("coverage-note")!.textContent = Array.isArray(metrics.notes)
    ? metrics.notes.join(" ")
    : "";
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function drawOverviewTimeline(timeline: Array<{ t: number; type: string }>): void {
  const canvas = document.getElementById("overview-timeline") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#ff8a3d");
  gradient.addColorStop(.52, "#b968ff");
  gradient.addColorStop(1, "#ff8a3d");
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 1;
  for (let y = 40; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  const points = timeline.filter((item) => item.type !== "gaze_sample").slice(-14);
  if (!points.length) {
    ctx.strokeStyle = "rgba(255,138,61,.35)";
    ctx.beginPath(); ctx.moveTo(0, height * .68); ctx.lineTo(width, height * .68); ctx.stroke();
    return;
  }
  const minT = points[0].t;
  const range = Math.max(1, points[points.length - 1].t - minT);
  ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((point, index) => {
    const x = ((point.t - minT) / range) * (width - 40) + 20;
    const y = height * (.68 - ((index * 37) % 5) * .07);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  points.forEach((point, index) => {
    const x = ((point.t - minT) / range) * (width - 40) + 20;
    const y = height * (.68 - ((index * 37) % 5) * .07);
    ctx.fillStyle = index % 3 === 1 ? "#b968ff" : "#ff8a3d";
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  });
}

function renderEvents(events: IntentEvent[]): void {
  const query = (document.getElementById("event-search") as HTMLInputElement).value.toLowerCase();
  const type = filter.value;
  const rows = events
    .filter((e) => (!type || e.type === type) && (!query || `${e.eventId} ${e.elementId} ${e.type}`.toLowerCase().includes(query)))
    .slice(-200)
    .reverse();
  document.getElementById("event-rows")!.innerHTML = rows
    .map(
      (e) => `<tr>
        <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
        <td>${e.type}</td>
        <td>${e.elementId ?? "—"}</td>
        <td>${e.quality?.indicator ?? "—"}</td>
        <td>${e.eventId}</td>
      </tr>`
    )
    .join("");
}

function renderAttention(events: IntentEvent[], metrics: { elements: Array<Record<string, unknown>>; categoryDistribution: Record<string, { share: number }>; timeline: Array<{ t: number; type: string }> }): void {
  const canvas = document.getElementById("gaze-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#10141c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gazes = events.filter((e) => e.type === "gaze_sample" && e.coordinates && !e.quality?.missingSample);
  ctx.fillStyle = "#3ee0c6aa";
  for (const g of gazes.slice(-800)) {
    const vw = g.viewport?.width || window.innerWidth;
    const vh = g.viewport?.height || window.innerHeight;
    ctx.beginPath();
    ctx.arc((g.coordinates!.x / vw) * canvas.width, (g.coordinates!.y / vh) * canvas.height, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  document.getElementById("rank")!.innerHTML = metrics.elements
    .slice(0, 12)
    .map(
      (el) =>
        `<li><code>${el.elementId}</code> · ${el.category} · dwell ${el.estimatedDwellMs}ms · share ${Math.round(Number(el.sampleShare) * 100)}% of mapped samples</li>`
    )
    .join("");

  document.getElementById("cats")!.innerHTML = Object.entries(metrics.categoryDistribution)
    .map(
      ([k, v]) =>
        `<div class="bar-row"><span>${k}</span><i style="width:${Math.max(2, v.share * 100)}%"></i><span>${Math.round(v.share * 100)}%</span></div>`
    )
    .join("");

  const time = document.getElementById("time-canvas") as HTMLCanvasElement;
  const tctx = time.getContext("2d")!;
  tctx.clearRect(0, 0, time.width, time.height);
  tctx.fillStyle = "#10141c";
  tctx.fillRect(0, 0, time.width, time.height);
  const tl = metrics.timeline;
  const maxT = tl.reduce((m, x) => Math.max(m, x.t), 1);
  const colors: Record<string, string> = {
    click: "#8b7cff",
    scroll_depth: "#3ee0c6",
    gaze_sample: "#3ee0c644",
    hover: "#e8edf5"
  };
  for (const item of tl) {
    tctx.fillStyle = colors[item.type] ?? "#2a3142";
    tctx.fillRect((item.t / maxT) * time.width, 20, 2, 80);
  }
}

function renderFindings(findings: Array<Record<string, unknown>>): void {
  document.getElementById("findings")!.innerHTML =
    findings.length === 0
      ? `<p class="muted">No findings yet. Findings require real session events.</p>`
      : findings
          .map(
            (f) => `<article class="finding">
              <strong>${f.category}</strong>
              <p>${f.interpretation}</p>
              <p>Investigate: ${f.suggestedInvestigation}</p>
              <p>Calculation: ${f.calculation}</p>
              <p>Sufficient data: ${f.sufficientData ? "yes (heuristic)" : "no"} · ${f.confidenceNote}</p>
              <p>Events: ${(f.supportingEventIds as string[]).slice(0, 6).join(", ") || "—"}</p>
            </article>`
          )
          .join("");
}

function renderInsights(insights: Array<Record<string, unknown>>): void {
  document.getElementById("insights-list")!.innerHTML =
    insights.length === 0
      ? `<p class="muted">No model insights. Collection continues if Gemini is unavailable.</p>`
      : insights
          .map(
            (i) => `<article class="insight">
              <p>${i.summary}</p>
              <pre>${JSON.stringify(i, null, 2)}</pre>
            </article>`
          )
          .join("");
}

function renderManage(
  session: Record<string, unknown>,
  settings: Record<string, string>,
  index: Array<{ sessionId: string; status: string }>,
  metrics: Record<string, unknown>
): void {
  const consent = session.consent as { interactionCollection: boolean; webcamGaze: boolean; aiAnalysis: boolean };
  (document.getElementById("c-int") as HTMLInputElement).checked = consent.interactionCollection;
  (document.getElementById("c-gaze") as HTMLInputElement).checked = consent.webcamGaze;
  (document.getElementById("c-ai") as HTMLInputElement).checked = consent.aiAnalysis;
  (document.getElementById("proxy-url") as HTMLInputElement).value = settings.proxyUrl ?? "";
  (document.getElementById("proxy-token") as HTMLInputElement).value = settings.proxyToken ?? "";
  document.getElementById("compare")!.innerHTML =
    index.length === 0
      ? `<p class="muted">Stop a session to archive it for comparison. Current coverage ${Math.round(Number(metrics.dataCoverage ?? 0) * 100)}%.</p>`
      : index
          .map((s) => `<button class="ghost compare-btn" data-id="${s.sessionId}">${s.sessionId} (${s.status})</button>`)
          .join("") + `<pre id="compare-out"></pre>`;
  document.querySelectorAll(".compare-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await send("compare-sessions", {
        sessionIds: [session.sessionId, (btn as HTMLElement).dataset.id]
      });
      document.getElementById("compare-out")!.textContent = JSON.stringify(
        (res.payload as Array<{ metrics: { dataCoverage: number; eventCount: number } }>).map((row) => ({
          events: row.metrics.eventCount,
          coverage: row.metrics.dataCoverage
        })),
        null,
        2
      );
    });
  });
}

document.getElementById("event-search")!.addEventListener("input", () => void refresh());
filter.addEventListener("change", () => void refresh());

document.getElementById("start")!.addEventListener("click", async () => {
  showActionStatus("");
  // Keep the permission request as the first awaited operation so Chrome still
  // associates it with this button click's user gesture.
  const granted = await requestHostPermission();
  if (!granted) {
    showActionStatus("Page access permission is required. Click Start and choose Allow.");
    return;
  }
  const consent = await send("set-consent", {
    interactionCollection: (document.getElementById("c-int") as HTMLInputElement).checked,
    webcamGaze: (document.getElementById("c-gaze") as HTMLInputElement).checked,
    aiAnalysis: (document.getElementById("c-ai") as HTMLInputElement).checked
  });
  if (!consent?.ok) {
    showActionStatus(consent?.error ?? "Unable to save consent.");
    return;
  }
  const result = await send("start-session");
  if (!result?.ok) {
    showActionStatus(result?.error ?? "Unable to start the session.");
    return;
  }
  showActionStatus("Collection started on the active webpage.", true);
  await refresh();
});
document.getElementById("pause")!.addEventListener("click", async () => {
  await send("pause-session");
  await refresh();
});
document.getElementById("resume")!.addEventListener("click", async () => {
  await send("resume-session");
  await refresh();
});
document.getElementById("stop")!.addEventListener("click", async () => {
  await send("stop-session");
  await refresh();
});
document.getElementById("save-settings")!.addEventListener("click", async () => {
  await send("set-consent", {
    interactionCollection: (document.getElementById("c-int") as HTMLInputElement).checked,
    webcamGaze: (document.getElementById("c-gaze") as HTMLInputElement).checked,
    aiAnalysis: (document.getElementById("c-ai") as HTMLInputElement).checked
  });
  await send("update-settings", {
    proxyUrl: (document.getElementById("proxy-url") as HTMLInputElement).value,
    proxyToken: (document.getElementById("proxy-token") as HTMLInputElement).value
  });
});
document.getElementById("export")!.addEventListener("click", async () => {
  const res = await send("export-session");
  const blob = new Blob([JSON.stringify(res.payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intentlens-session.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("delete")!.addEventListener("click", async () => {
  await send("delete-session");
  await refresh();
});
document.getElementById("delete-all")!.addEventListener("click", async () => {
  if (confirm("Delete all IntentLens data on this browser profile?")) {
    await send("delete-all");
    await refresh();
  }
});
document.getElementById("ask")!.addEventListener("click", async () => {
  const status = document.getElementById("ai-status")!;
  status.textContent = "Requesting interpretation…";
  const res = await send("ask-gemini", {
    question: (document.getElementById("question") as HTMLInputElement).value
  });
  status.textContent = res?.ok
    ? "Insight stored from structured model output."
    : `Gemini unavailable: ${res?.error ?? "unknown"}. Collection still runs.`;
  await refresh();
});

void refresh();
setInterval(() => void refresh(), 2000);
