const $ = (selector) => document.querySelector(selector);

const els = {
  apiBase: $("#apiBase"),
  sourceBadge: $("#sourceBadge"),
  refreshTraces: $("#refreshTraces"),
  jsonFile: $("#jsonFile"),
  clearOffline: $("#clearOffline"),
  traceList: $("#traceList"),
  traceCount: $("#traceCount"),
  prevPage: $("#prevPage"),
  nextPage: $("#nextPage"),
  traceKicker: $("#traceKicker"),
  traceTitle: $("#traceTitle"),
  exportPdf: $("#exportPdf"),
  depthSlider: $("#depthSlider"),
  depthValue: $("#depthValue"),
  depthMax: $("#depthMax"),
  statNodes: $("#statNodes"),
  statEdges: $("#statEdges"),
  statWires: $("#statWires"),
  statReady: $("#statReady"),
  emptyState: $("#emptyState"),
  errorState: $("#errorState"),
  views: {
    flow: $("#flowView"),
    containers: $("#containersView"),
    timeline: $("#timelineView"),
    json: $("#jsonView"),
  },
  jsonOutput: $("#jsonOutput"),
};

const state = {
  source: "api",
  baseUrl: localStorage.getItem("topoTracerApiBase") || "http://localhost:3000",
  traces: [],
  currentTraceId: null,
  rawTrace: null,
  visibleTrace: null,
  pagination: { afterTime: null, beforeTime: null, stack: [] },
  view: "flow",
  depthType: "global",
  depth: 0,
  maxDepthGlobal: 0,
  maxDepthLocal: 0,
};

els.apiBase.value = state.baseUrl;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function toMs(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTrace(input) {
  const trace = Array.isArray(input) ? { nodes: input, edges: [] } : input || {};
  return {
    nodes: Array.isArray(trace.nodes) ? trace.nodes : [],
    edges: Array.isArray(trace.edges) ? trace.edges : [],
    visualWires: Array.isArray(trace.visualWires) ? trace.visualWires : [],
    isZoomReady: Boolean(trace.isZoomReady ?? trace.is_zoom_ready),
    maxAvailableDepth: Number(trace.maxAvailableDepth ?? trace.max_available_depth ?? 0),
    maxAvailableLocalDepth: Number(trace.maxAvailableLocalDepth ?? trace.max_available_local_depth ?? 0),
    pagination: trace.pagination || null,
    sourceJson: input,
  };
}

function traceIdOf(trace) {
  return trace?.nodes?.[0]?.traceId || trace?.nodes?.[0]?.trace_id || trace?.traceId || "offline-trace";
}

function nodeDepth(node, depthType = state.depthType) {
  return Number(depthType === "local" ? node.localDepthIndex ?? 0 : node.depthIndex ?? 0);
}

function nodeTime(node) {
  return toMs(node.initiatedAtLocal ?? node.initiated_at_local) || 0;
}

function nodeEndTime(node) {
  return toMs(node.completedAtLocal ?? node.processedAtLocal ?? node.initiatedAtLocal) || nodeTime(node);
}

function currentMaxDepth() {
  return state.depthType === "local" ? state.maxDepthLocal : state.maxDepthGlobal;
}

function setError(message) {
  if (!message) {
    els.errorState.classList.add("hidden");
    els.errorState.textContent = "";
    return;
  }
  els.errorState.textContent = message;
  els.errorState.classList.remove("hidden");
}

function setLoading(message) {
  els.traceTitle.textContent = message;
}

async function requestJson(path) {
  const base = state.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadTraceList(direction = "initial") {
  if (state.source !== "api") return;
  setError("");
  state.baseUrl = els.apiBase.value.trim() || "http://localhost:3000";
  localStorage.setItem("topoTracerApiBase", state.baseUrl);

  const params = new URLSearchParams({ limit: "20" });
  if (direction === "next" && state.pagination.afterTime) {
    params.set("afterTime", String(state.pagination.afterTime));
  }
  if (direction === "prev" && state.pagination.beforeTime) {
    params.set("beforeTime", String(state.pagination.beforeTime));
  }

  try {
    const result = await requestJson(`/telemetry/traces?${params.toString()}`);
    state.traces = result.data || [];
    state.pagination = {
      ...state.pagination,
      afterTime: result.pagination?.nextTimeCursor ?? null,
      beforeTime: result.pagination?.prevTimeCursor ?? null,
      hasNext: Boolean(result.pagination?.hasNext),
      hasPrev: Boolean(result.pagination?.hasPrev),
    };
    renderTraceList();
    if (!state.currentTraceId && state.traces[0]) {
      await selectTrace(state.traces[0].traceId);
    }
  } catch (error) {
    setError(`Could not load traces from ${state.baseUrl}: ${error.message}`);
    renderTraceList();
  }
}

async function selectTrace(traceId) {
  state.currentTraceId = traceId;
  setLoading("Loading trace...");
  setError("");
  renderTraceList();

  if (state.source === "offline") {
    state.visibleTrace = filterTrace(state.rawTrace);
    renderAll();
    return;
  }

  try {
    const trace = normalizeTrace(await requestJson(`/telemetry/trace/${encodeURIComponent(traceId)}/full`));
    state.rawTrace = trace;
    state.maxDepthGlobal = Math.max(trace.maxAvailableDepth || 0, ...trace.nodes.map((n) => Number(n.depthIndex || 0)));
    state.maxDepthLocal = Math.max(trace.maxAvailableLocalDepth || 0, ...trace.nodes.map((n) => Number(n.localDepthIndex || 0)));
    state.depth = currentMaxDepth();
    state.visibleTrace = trace;
    updateDepthControl();
    renderAll();
  } catch (error) {
    setError(`Could not load trace ${traceId}: ${error.message}`);
  }
}

async function reloadForDepth() {
  if (!state.rawTrace) return;
  if (state.source === "offline") {
    state.visibleTrace = filterTrace(state.rawTrace);
    renderAll();
    return;
  }

  const traceId = state.currentTraceId;
  const params = new URLSearchParams({
    depth: String(state.depth),
    depthType: state.depthType,
  });

  try {
    state.visibleTrace = normalizeTrace(await requestJson(`/telemetry/trace/${encodeURIComponent(traceId)}/full?${params}`));
    renderAll();
  } catch (error) {
    setError(`Could not reload depth ${state.depth}: ${error.message}`);
  }
}

function filterTrace(trace) {
  const normalized = normalizeTrace(trace);
  const visibleNodes = normalized.nodes.filter((node) => nodeDepth(node) <= state.depth);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const coherentEdges = normalized.edges.filter((edge) => visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId));
  return {
    ...normalized,
    nodes: visibleNodes,
    edges: coherentEdges,
    visualWires: normalized.visualWires.length ? normalized.visualWires : buildVisualWires(normalized, visibleIds),
  };
}

function buildVisualWires(trace, visibleIds) {
  const nodeMap = new Map(trace.nodes.map((node) => [node.id, node]));

  function resolve(nodeId, containerId, role) {
    if (state.depthType === "global" && state.depth === 0) {
      return { id: containerId, type: "container" };
    }

    let cursor = nodeMap.get(nodeId);
    let best = null;
    let guard = 0;
    while (cursor && guard < 100) {
      if (nodeDepth(cursor) <= state.depth && visibleIds.has(cursor.id)) {
        best = cursor;
        break;
      }
      cursor = nodeMap.get(cursor.parentNodeId);
      guard += 1;
    }

    return best ? { id: best.id, type: "node" } : { id: containerId, type: "container", role };
  }

  return trace.edges.map((edge) => ({
    id: `${edge.id}_${state.depthType}_${state.depth}`,
    fromTarget: resolve(edge.fromNodeId, edge.fromContainerId, "from"),
    toTarget: resolve(edge.toNodeId, edge.toContainerId, "to"),
    edgeId: edge.id,
  }));
}

function renderTraceList() {
  els.sourceBadge.textContent = state.source === "api" ? "API" : "JSON";
  els.traceCount.textContent = String(state.traces.length);
  els.prevPage.disabled = state.source !== "api" || !state.pagination.hasPrev;
  els.nextPage.disabled = state.source !== "api" || !state.pagination.hasNext;

  if (state.traces.length === 0) {
    els.traceList.innerHTML = `<p class="muted">No traces loaded.</p>`;
    return;
  }

  els.traceList.innerHTML = state.traces
    .map((trace) => {
      const id = trace.traceId || trace.id;
      const active = id === state.currentTraceId ? " active" : "";
      return `
        <button class="trace-item${active}" type="button" data-trace-id="${escapeHtml(id)}">
          <span class="trace-name">${escapeHtml(trace.rootNodeName || id)}</span>
          <span class="trace-meta">
            <span>${escapeHtml(id)}</span>
            <span>${Number(trace.nodeCount || 0)} nodes</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function updateDepthControl() {
  const max = currentMaxDepth();
  state.depth = Math.max(0, Math.min(Number(state.depth), max));
  els.depthSlider.max = String(max);
  els.depthSlider.value = String(state.depth);
  els.depthValue.textContent = String(state.depth);
  els.depthMax.textContent = String(max);
}

function renderAll() {
  updateDepthControl();
  renderHeader();
  renderStats();
  renderViews();
}

function renderHeader() {
  const trace = state.visibleTrace || state.rawTrace;
  const id = state.currentTraceId || traceIdOf(trace);
  const root = trace?.nodes?.sort((a, b) => nodeTime(a) - nodeTime(b))[0];
  els.emptyState.classList.toggle("hidden", Boolean(trace));
  els.traceKicker.textContent = trace ? `${state.source.toUpperCase()} trace` : "No trace selected";
  els.traceTitle.textContent = trace ? `${root?.name || id}` : "Load live traces or import JSON";
}

function renderStats() {
  const trace = state.visibleTrace;
  els.statNodes.textContent = String(trace?.nodes.length || 0);
  els.statEdges.textContent = String(trace?.edges.length || 0);
  els.statWires.textContent = String(trace?.visualWires?.length || 0);
  els.statReady.textContent = trace?.isZoomReady ? "Ready" : trace ? "Pending" : "Unknown";
}

function renderViews() {
  Object.entries(els.views).forEach(([name, el]) => {
    el.classList.toggle("hidden", name !== state.view || !state.visibleTrace);
  });
  if (!state.visibleTrace) return;
  renderFlow();
  renderContainers();
  renderTimeline();
  els.jsonOutput.textContent = JSON.stringify(state.visibleTrace.sourceJson || state.visibleTrace, null, 2);
}

function nodeTargetLabel(target) {
  if (!target) return null;
  return target.id;
}

function renderFlow() {
  const trace = state.visibleTrace;
  const nodesByContainer = new Map();
  for (const node of [...trace.nodes].sort((a, b) => nodeTime(a) - nodeTime(b))) {
    const id = node.containerId || "unknown-container";
    if (!nodesByContainer.has(id)) nodesByContainer.set(id, []);
    nodesByContainer.get(id).push(node);
  }

  const lanes = [...nodesByContainer.entries()]
    .map(([containerId, nodes]) => {
      const rows = nodes
        .map((node) => {
          const depth = nodeDepth(node);
          const duration = Math.max(0, nodeEndTime(node) - nodeTime(node));
          const indent = Math.min(depth * 18, 96);
          return `
            <article class="node-row" data-node-id="${escapeHtml(node.id)}" data-depth="${depth}" style="margin-left:${indent}px">
              <div class="node-name">${escapeHtml(node.name || node.id)}</div>
              <div class="node-sub">
                <span class="node-kind">${escapeHtml(node.nodeType || "node")}</span>
                <span>d${depth}</span>
                <span>${duration}ms</span>
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <section class="lane" data-container-id="${escapeHtml(containerId)}">
          <div class="lane-head">
            <span class="lane-title">${escapeHtml(containerId)}</span>
            <span class="lane-count">${nodes.length}</span>
          </div>
          ${rows || `<p class="muted">No visible nodes at this depth.</p>`}
        </section>
      `;
    })
    .join("");

  els.views.flow.innerHTML = `
    <div class="flow-board" id="flowBoard">
      <svg class="edge-svg" id="edgeSvg" aria-hidden="true"></svg>
      <div class="flow-grid">${lanes || `<p class="muted">No visible nodes.</p>`}</div>
    </div>
  `;

  requestAnimationFrame(drawEdges);
}

function drawEdges() {
  const board = $("#flowBoard");
  const svg = $("#edgeSvg");
  if (!board || !svg || !state.visibleTrace) return;

  const boardBox = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${board.scrollWidth} ${board.scrollHeight}`);
  svg.setAttribute("width", board.scrollWidth);
  svg.setAttribute("height", board.scrollHeight);

  function boxForTarget(target) {
    if (!target) return null;
    const id = nodeTargetLabel(target);
    const selector = target.type === "container" ? `[data-container-id="${CSS.escape(id)}"]` : `[data-node-id="${CSS.escape(id)}"]`;
    const el = board.querySelector(selector);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {
      x: box.left - boardBox.left + board.scrollLeft,
      y: box.top - boardBox.top + board.scrollTop,
      w: box.width,
      h: box.height,
    };
  }

  const wires = state.visibleTrace.visualWires || [];
  svg.innerHTML = wires
    .map((wire) => {
      const from = boxForTarget(wire.fromTarget || wire.from_target);
      const to = boxForTarget(wire.toTarget || wire.to_target);
      if (!from || !to) return "";
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      const mid = Math.max(32, Math.abs(x2 - x1) / 2);
      const path = `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
      return `<path d="${path}"></path><circle cx="${x1}" cy="${y1}" r="3"></circle><circle cx="${x2}" cy="${y2}" r="3"></circle>`;
    })
    .join("");
}

function renderContainers() {
  const trace = state.visibleTrace;
  const containers = new Map();

  for (const node of trace.nodes) {
    const id = node.containerId || "unknown-container";
    if (!containers.has(id)) containers.set(id, { nodes: 0, in: 0, out: 0, maxDepth: 0 });
    const item = containers.get(id);
    item.nodes += 1;
    item.maxDepth = Math.max(item.maxDepth, nodeDepth(node));
  }

  for (const edge of trace.edges) {
    if (containers.has(edge.fromContainerId)) containers.get(edge.fromContainerId).out += 1;
    if (containers.has(edge.toContainerId)) containers.get(edge.toContainerId).in += 1;
  }

  els.views.containers.innerHTML = `
    <div class="container-map">
      ${[...containers.entries()]
        .map(
          ([id, item]) => `
            <article class="container-node">
              <h3>${escapeHtml(id)}</h3>
              <dl>
                <dt>Nodes</dt><dd>${item.nodes}</dd>
                <dt>Incoming</dt><dd>${item.in}</dd>
                <dt>Outgoing</dt><dd>${item.out}</dd>
                <dt>Max depth</dt><dd>${item.maxDepth}</dd>
              </dl>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTimeline() {
  const trace = state.visibleTrace;
  const times = trace.nodes.flatMap((node) => [nodeTime(node), nodeEndTime(node)]).filter(Boolean);
  const min = Math.min(...times, Date.now());
  const max = Math.max(...times, min + 1);
  const span = Math.max(1, max - min);

  els.views.timeline.innerHTML = `
    <div class="timeline">
      ${[...trace.nodes]
        .sort((a, b) => nodeTime(a) - nodeTime(b))
        .map((node) => {
          const start = ((nodeTime(node) - min) / span) * 100;
          const width = Math.max(0.6, ((nodeEndTime(node) - nodeTime(node)) / span) * 100);
          return `
            <div class="timeline-row">
              <div class="timeline-name">${escapeHtml(node.name || node.id)}</div>
              <div class="timeline-track">
                <span class="timeline-bar" style="left:${start}%;width:${width}%"></span>
              </div>
              <span class="muted">${Math.max(0, nodeEndTime(node) - nodeTime(node))}ms</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const traceButton = event.target.closest("[data-trace-id]");
  if (traceButton) {
    await selectTrace(traceButton.dataset.traceId);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button === viewButton));
    renderViews();
    return;
  }

  const depthButton = event.target.closest("[data-depth-type]");
  if (depthButton) {
    state.depthType = depthButton.dataset.depthType;
    document.querySelectorAll("[data-depth-type]").forEach((button) => button.classList.toggle("active", button === depthButton));
    state.depth = currentMaxDepth();
    updateDepthControl();
    await reloadForDepth();
  }
});

els.refreshTraces.addEventListener("click", () => {
  state.source = "api";
  state.currentTraceId = null;
  state.rawTrace = null;
  state.visibleTrace = null;
  loadTraceList();
  renderAll();
});

els.prevPage.addEventListener("click", () => loadTraceList("prev"));
els.nextPage.addEventListener("click", () => loadTraceList("next"));

els.clearOffline.addEventListener("click", () => {
  state.source = "api";
  state.currentTraceId = null;
  state.rawTrace = null;
  state.visibleTrace = null;
  loadTraceList();
  renderAll();
});

els.depthSlider.addEventListener("input", async () => {
  state.depth = Number(els.depthSlider.value);
  els.depthValue.textContent = String(state.depth);
  await reloadForDepth();
});

els.jsonFile.addEventListener("change", async () => {
  const file = els.jsonFile.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const trace = normalizeTrace(parsed);
    state.source = "offline";
    state.rawTrace = trace;
    state.currentTraceId = traceIdOf(trace);
    state.traces = [
      {
        traceId: state.currentTraceId,
        rootNodeName: trace.nodes[0]?.name || file.name,
        nodeCount: trace.nodes.length,
        startTime: trace.nodes[0]?.initiatedAtLocal,
      },
    ];
    state.maxDepthGlobal = Math.max(trace.maxAvailableDepth || 0, ...trace.nodes.map((n) => Number(n.depthIndex || 0)));
    state.maxDepthLocal = Math.max(trace.maxAvailableLocalDepth || 0, ...trace.nodes.map((n) => Number(n.localDepthIndex || 0)));
    state.depth = currentMaxDepth();
    state.visibleTrace = filterTrace(trace);
    renderTraceList();
    renderAll();
    setError("");
  } catch (error) {
    setError(`Invalid JSON: ${error.message}`);
  } finally {
    els.jsonFile.value = "";
  }
});

els.exportPdf.addEventListener("click", () => window.print());
window.addEventListener("resize", () => requestAnimationFrame(drawEdges));

renderTraceList();
renderAll();
loadTraceList();
