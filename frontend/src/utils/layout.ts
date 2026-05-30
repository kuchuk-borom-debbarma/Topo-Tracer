import type { ReadContainer, ReadNode, ReadEdge } from "../api/client";

// ============================================================
// Layout Constants
// ============================================================
export const LAYOUT = {
  NODE_H: 58,             // height of node row
  NODE_GAP: 5,            // gap between node rows
  CONTAINER_PAD_Y: 16,    // vertical padding inside container
  CONTAINER_PAD_X: 18,    // horizontal padding inside container
  HEADER_H: 68,           // container header height
  COL_W: 320,             // width of a node card/row
  INDENT: 36,             // nesting horizontal indent on X-axis
  CANVAS_PAD: 48,         // outer canvas padding
} as const;

// ============================================================
// Depth color palette
// ============================================================
const DEPTH_COLORS = [
  "hsl(217, 91%, 62%)",   // Depth 0: Electric Blue
  "hsl(258, 85%, 68%)",   // Depth 1: Violet
  "hsl(188, 85%, 55%)",   // Depth 2: Cyan
  "hsl(330, 80%, 65%)",   // Depth 3: Rose
  "hsl(38, 92%, 55%)",    // Depth 4: Amber
  "hsl(142, 71%, 48%)",   // Depth 5+: Emerald
] as const;

const DEPTH_COLORS_DIM = [
  "hsla(217, 91%, 62%, 0.10)",
  "hsla(258, 85%, 68%, 0.10)",
  "hsla(188, 85%, 55%, 0.10)",
  "hsla(330, 80%, 65%, 0.10)",
  "hsla(38, 92%, 55%, 0.10)",
  "hsla(142, 71%, 48%, 0.10)",
] as const;

export function getDepthColor(depth: number): string {
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
}

export function getDepthColorDim(depth: number): string {
  return DEPTH_COLORS_DIM[Math.min(depth, DEPTH_COLORS_DIM.length - 1)];
}

// ============================================================
// Computed types
// ============================================================

export type ContainerLayout = {
  containerId: string;
  name: string;
  type: string;
  tags: string[];
  depth: number;
  top: number;
  left: number;
  width: number;
  height: number;
  parentContainerId: string | null;
};

export type NodePosition = {
  node: ReadNode;
  top: number;
  left: number;
  width: number;
  height: number;
  centerY: number;
  leftX: number;
  rightX: number;
  centerX: number;
  bottomY: number;
};

export type ParentArrow = {
  fromContainerId: string;
  toContainerId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
};

export type EdgeWire = {
  edge: ReadEdge;
  fromNodeId: string;
  toNodeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isCrossContainer: boolean;
};

export type LayoutResult = {
  containerLayouts: ContainerLayout[];
  nodePositions: Map<string, NodePosition>;
  parentArrows: ParentArrow[];
  wires: EdgeWire[];
  canvasWidth: number;
  canvasHeight: number;
};

// ============================================================
// Layout computation — RECURSIVE NESTED DESIGN
// ============================================================

export function computeLayout(
  containers: ReadContainer[],
  nodes: ReadNode[],
  edges: ReadEdge[],
  activeTags: Set<string>,
  layoutMode: "nested" | "dag" | "graph" = "graph"
): LayoutResult {
  const {
    NODE_H, NODE_GAP, CONTAINER_PAD_Y, CONTAINER_PAD_X,
    HEADER_H, COL_W, INDENT, CANVAS_PAD
  } = LAYOUT;

  // ── 1. Visibility filter (AND logic on tags) ───────────────
  const isNodeVisible = (n: ReadNode): boolean => {
    if (activeTags.size === 0) return true;
    return Array.from(activeTags).every((tag) => n.tags && n.tags.includes(tag));
  };

  const containerVisCache = new Map<string, boolean>();
  const isContainerVisible = (cid: string): boolean => {
    if (containerVisCache.has(cid)) return containerVisCache.get(cid)!;

    // Filter out completely empty containers (no nodes and no child sub-containers in telemetry)
    const hasContent =
      nodes.some((n) => n.containerId === cid) ||
      containers.some((c) => c.parentContainerId === cid && c.id !== cid);

    if (!hasContent) {
      containerVisCache.set(cid, false);
      return false;
    }

    const tagMatched =
      activeTags.size === 0 ||
      (() => {
        const c = containers.find((x) => x.id === cid);
        return !!(c && Array.from(activeTags).every((tag) => c.tags && c.tags.includes(tag)));
      })();

    if (tagMatched) { containerVisCache.set(cid, true); return true; }

    if (nodes.some((n) => n.containerId === cid && isNodeVisible(n))) {
      containerVisCache.set(cid, true); return true;
    }

    if (containers.some((c) => c.parentContainerId === cid && c.id !== cid && isContainerVisible(c.id))) {
      containerVisCache.set(cid, true); return true;
    }

    containerVisCache.set(cid, false);
    return false;
  };

  // ── 1A. Clustered 2D Graph layout algorithm ──
  if (layoutMode === "graph") {
    const ROW_GAP = 40;
    const COLUMN_GAP = 140;
    const CONTAINER_W = COL_W + CONTAINER_PAD_X * 2;
    const PAD_X = 48;
    const PAD_Y = 48;

    const visibleContainers = containers.filter((c) => isContainerVisible(c.id));
    const visibleNodes = nodes.filter((n) => isNodeVisible(n) && isContainerVisible(n.containerId));
    const visibleContainerIds = new Set(visibleContainers.map((c) => c.id));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    // Resolve parent container hierarchy skips (Skip invisible containers + resolve Node IDs in parentContainerId)
    const effectiveParentMap = new Map<string, string | null>();
    for (const c of visibleContainers) {
      let pid = c.parentContainerId;
      if (pid && !visibleContainerIds.has(pid)) {
        const parentNode = nodes.find((n) => n.id === pid);
        if (parentNode) {
          pid = parentNode.containerId;
        }
      }
      while (pid && !visibleContainerIds.has(pid)) {
        const p = containers.find((x) => x.id === pid);
        pid = p ? p.parentContainerId : null;
      }
      effectiveParentMap.set(c.id, pid ?? null);
    }

    // Identify Service Host Containers (e.g. Order API Gateway, Payment Processing Service, etc.)
    // Service hosts are containers with NO parent container, OR containers with an explicit service type.
    const serviceContainers = visibleContainers.filter((c) => {
      const isRoot = !effectiveParentMap.get(c.id);
      const typeLower = c.type.toLowerCase();
      const isServiceType =
        typeLower === "express_api" ||
        typeLower === "grpc_service" ||
        typeLower === "background_worker" ||
        typeLower === "cron_job" ||
        typeLower === "service";
      return isRoot || isServiceType;
    });



    // Fallback: If no service containers were identified (e.g. all are logical modules),
    // treat all visible containers as separate service hosts (reverts to normal graph mode).
    const hosts = serviceContainers.length > 0 ? serviceContainers : visibleContainers;
    const hostIds = new Set(hosts.map((c) => c.id));

    // Map every visible node to its top-level Service Host Container
    const nodeServiceMap = new Map<string, string>(); // nodeId -> serviceContainerId
    for (const n of visibleNodes) {
      let cid = n.containerId;
      while (cid && !hostIds.has(cid)) {
        const parentCid = effectiveParentMap.get(cid);
        cid = parentCid ?? "";
      }
      if (cid) {
        nodeServiceMap.set(n.id, cid);
      } else {
        // Fallback to the first service host or its direct container
        const fallbackId = hosts[0]?.id || n.containerId;
        nodeServiceMap.set(n.id, fallbackId);
      }
    }

    // Group nodes by their Service Host, sorted chronologically
    const serviceNodes = new Map<string, ReadNode[]>();
    for (const n of visibleNodes) {
      const scid = nodeServiceMap.get(n.id)!;
      const list = serviceNodes.get(scid) || [];
      list.push(n);
      serviceNodes.set(scid, list);
    }

    // Sort container nodes chronologically for vertical tie-breaking
    const containerEarliestTime = new Map<string, number>();
    for (const c of hosts) {
      const sNodes = serviceNodes.get(c.id) || [];
      const minTime = sNodes.length > 0 ? Math.min(...sNodes.map((n) => n.startTimeUs)) : c.startTimeUs;
      containerEarliestTime.set(c.id, minTime);
    }

    // Calculate height of each Service Container in Graph mode
    const containerHeights = new Map<string, number>();
    for (const c of hosts) {
      const sNodes = serviceNodes.get(c.id) || [];
      sNodes.sort((a, b) => a.startTimeUs - b.startTimeUs);
      const numNodes = sNodes.length;
      const height =
        HEADER_H +
        CONTAINER_PAD_Y * 2 +
        (numNodes > 0 ? numNodes * NODE_H + (numNodes - 1) * NODE_GAP : 0);
      containerHeights.set(c.id, height);
    }

    // Group containers by rank
    const containerRanks = new Map<string, number>();
    for (const c of hosts) {
      containerRanks.set(c.id, 0); // Initially rank 0
    }

    // Helper to resolve any Node ID or Container ID to its top-level Service Host Container ID
    const resolveServiceId = (id: string): string | null => {
      let cid = id;
      if (visibleNodeIds.has(id)) {
        const node = nodes.find(n => n.id === id);
        cid = node ? node.containerId : "";
      }
      while (cid && !hostIds.has(cid)) {
        const parentCid = effectiveParentMap.get(cid);
        cid = parentCid ?? "";
      }
      return cid && hostIds.has(cid) ? cid : null;
    };

    // Extract unique service-to-service dependency edges based on node call edges
    const containerEdges: Array<{ from: string; to: string }> = [];
    const containerEdgeSet = new Set<string>();
    for (const edge of edges) {
      const fromServiceId = resolveServiceId(edge.fromNodeId);
      const toServiceId = resolveServiceId(edge.toNodeId);
      if (fromServiceId && toServiceId && fromServiceId !== toServiceId) {
        const key = `${fromServiceId}->${toServiceId}`;
        if (!containerEdgeSet.has(key)) {
          containerEdgeSet.add(key);
          containerEdges.push({ from: fromServiceId, to: toServiceId });
        }
      }
    }

    // Relaxation loop for topological ranking of service containers
    for (let iter = 0; iter < hosts.length; iter++) {
      let changed = false;
      for (const edge of containerEdges) {
        const fromRank = containerRanks.get(edge.from) ?? 0;
        const toRank = containerRanks.get(edge.to) ?? 0;
        if (toRank < fromRank + 1) {
          containerRanks.set(edge.to, fromRank + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Group service containers by rank
    const containersByRank = new Map<number, ReadContainer[]>();
    let maxRank = 0;
    for (const c of hosts) {
      const rank = containerRanks.get(c.id) ?? 0;
      maxRank = Math.max(maxRank, rank);
      const list = containersByRank.get(rank) || [];
      list.push(c);
      containersByRank.set(rank, list);
    }

    // Calculate column heights to vertically center them
    const colTotalHeights = new Map<number, number>();
    let maxColHeight = 0;
    for (let r = 0; r <= maxRank; r++) {
      const rContainers = containersByRank.get(r) || [];
      rContainers.sort((a, b) => (containerEarliestTime.get(a.id) ?? 0) - (containerEarliestTime.get(b.id) ?? 0));
      let heightSum = 0;
      rContainers.forEach((c, idx) => {
        heightSum += (containerHeights.get(c.id) ?? 100);
        if (idx < rContainers.length - 1) heightSum += ROW_GAP;
      });
      colTotalHeights.set(r, heightSum);
      maxColHeight = Math.max(maxColHeight, heightSum);
    }

    // Position containers dynamically
    const containerLayouts: ContainerLayout[] = [];
    const containerLayoutsMap = new Map<string, ContainerLayout>();
    const nodePositions = new Map<string, NodePosition>();

    for (let r = 0; r <= maxRank; r++) {
      const rContainers = containersByRank.get(r) || [];
      rContainers.sort((a, b) => (containerEarliestTime.get(a.id) ?? 0) - (containerEarliestTime.get(b.id) ?? 0));
      const colH = colTotalHeights.get(r) ?? 0;
      const startTop = PAD_Y + Math.max(0, (maxColHeight - colH) / 2);
      const x = PAD_X + r * (CONTAINER_W + COLUMN_GAP);

      let currentY = startTop;
      rContainers.forEach((c) => {
        const height = containerHeights.get(c.id) ?? 100;
        const layout: ContainerLayout = {
          containerId: c.id,
          name: c.name,
          type: c.type,
          tags: c.tags || [],
          depth: r,
          top: currentY,
          left: x,
          width: CONTAINER_W,
          height,
          parentContainerId: null, // Flat service layout
        };
        containerLayouts.push(layout);
        containerLayoutsMap.set(c.id, layout);

        // Position nodes inside this container
        const sNodes = serviceNodes.get(c.id) || [];
        sNodes.sort((a, b) => a.startTimeUs - b.startTimeUs);
        sNodes.forEach((node, nodeIdx) => {
          const nx = x + CONTAINER_PAD_X;
          const ny = currentY + HEADER_H + CONTAINER_PAD_Y + nodeIdx * (NODE_H + NODE_GAP);
          nodePositions.set(node.id, {
            node,
            top: ny,
            left: nx,
            width: COL_W,
            height: NODE_H,
            centerY: ny + NODE_H / 2,
            leftX: nx,
            rightX: nx + COL_W,
            centerX: nx + COL_W / 2,
            bottomY: ny + NODE_H,
          });
        });

        currentY += height + ROW_GAP;
      });
    }

    // Connect edges
    const resolveAnchor = (
      nodeId: string,
      isSource: boolean
    ): { x: number; y: number } | null => {
      if (visibleNodeIds.has(nodeId)) {
        const np = nodePositions.get(nodeId)!;
        return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
      }
      if (visibleContainerIds.has(nodeId)) {
        // Resolve to the parent service container layout
        let scid = nodeId;
        while (scid && !hostIds.has(scid)) {
          const parentCid = effectiveParentMap.get(scid);
          scid = parentCid ?? "";
        }
        const cl = containerLayoutsMap.get(scid || hosts[0]?.id);
        if (cl) {
          return {
            x: isSource ? cl.left + cl.width : cl.left,
            y: cl.top + HEADER_H / 2,
          };
        }
      }
      return null;
    };

    const wires: EdgeWire[] = [];
    for (const edge of edges) {
      const fromAnchor = resolveAnchor(edge.fromNodeId, true);
      const toAnchor = resolveAnchor(edge.toNodeId, false);
      if (!fromAnchor || !toAnchor) continue;

      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      const isCrossContainer = !!(fromNode && toNode && fromNode.containerId !== toNode.containerId);

      wires.push({
        edge,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        fromX: fromAnchor.x,
        fromY: fromAnchor.y,
        toX: toAnchor.x,
        toY: toAnchor.y,
        isCrossContainer,
      });
    }

    const parentArrows: ParentArrow[] = [];
    for (const cl of containerLayouts) {
      const parentId = effectiveParentMap.get(cl.containerId);
      if (parentId && containerLayoutsMap.has(parentId)) {
        const parentLayout = containerLayoutsMap.get(parentId)!;
        parentArrows.push({
          fromContainerId: parentId,
          toContainerId: cl.containerId,
          fromX: parentLayout.left + parentLayout.width,
          fromY: parentLayout.top + HEADER_H / 2,
          toX: cl.left,
          toY: cl.top + HEADER_H / 2,
          color: getDepthColor(parentLayout.depth),
        });
      }
    }

    const canvasWidth = maxRank * (CONTAINER_W + COLUMN_GAP) + CONTAINER_W + PAD_X * 2;
    const canvasHeight = maxColHeight + PAD_Y * 2;

    return {
      containerLayouts,
      nodePositions,
      parentArrows,
      wires,
      canvasWidth,
      canvasHeight,
    };
  }

  // ── 1B. Flowchart DAG layout algorithm ──
  if (layoutMode === "dag") {
    const LANE_H = 110;
    const LANE_GAP = 28;
    const DAG_COL_W = 340;
    const DAG_NODE_W = 280;
    const DAG_NODE_H = 58;
    const PAD_X = 36;
    const PAD_Y = 24;

    const visibleContainers = containers.filter((c) => isContainerVisible(c.id));
    const visibleNodes = nodes.filter((n) => isNodeVisible(n) && isContainerVisible(n.containerId));
    const visibleContainerIds = new Set(visibleContainers.map((c) => c.id));
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    // Sort containers by their earliest node's start time to assign horizontal lanes
    const containerEarliestTime = new Map<string, number>();
    for (const c of visibleContainers) {
      const cNodes = visibleNodes.filter((n) => n.containerId === c.id);
      const minTime = cNodes.length > 0 ? Math.min(...cNodes.map((n) => n.startTimeUs)) : c.startTimeUs;
      containerEarliestTime.set(c.id, minTime);
    }
    
    const sortedContainers = [...visibleContainers].sort((a, b) => {
      return (containerEarliestTime.get(a.id) ?? 0) - (containerEarliestTime.get(b.id) ?? 0);
    });

    const laneMap = new Map<string, number>();
    sortedContainers.forEach((c, idx) => {
      laneMap.set(c.id, idx);
    });

    // Dependency-ranked columns (DAG Ranks using longest path)
    const nodeRanks = new Map<string, number>();
    for (const n of visibleNodes) {
      nodeRanks.set(n.id, 0);
    }

    const visibleEdges = edges.filter((e) => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId));
    
    // Relaxation loop to compute longest-path columns for parallel flows
    for (let iter = 0; iter < visibleNodes.length; iter++) {
      let changed = false;
      for (const edge of visibleEdges) {
        const fromRank = nodeRanks.get(edge.fromNodeId) ?? 0;
        const toRank = nodeRanks.get(edge.toNodeId) ?? 0;
        if (toRank < fromRank + 1) {
          nodeRanks.set(edge.toNodeId, fromRank + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }

    let maxRank = 0;
    for (const r of nodeRanks.values()) {
      maxRank = Math.max(maxRank, r);
    }

    const canvasWidth = maxRank * DAG_COL_W + DAG_NODE_W + PAD_X * 2;
    const canvasHeight = sortedContainers.length * (LANE_H + LANE_GAP) - LANE_GAP + PAD_Y * 2;

    // Position containers as horizontal service lanes
    const containerLayouts: ContainerLayout[] = sortedContainers.map((c, idx) => {
      const top = PAD_Y + idx * (LANE_H + LANE_GAP);
      return {
        containerId: c.id,
        name: c.name,
        type: c.type,
        tags: c.tags || [],
        depth: idx,
        top,
        left: PAD_X,
        width: maxRank * DAG_COL_W + DAG_NODE_W,
        height: LANE_H,
        parentContainerId: null,
      };
    });

    const containerLayoutsMap = new Map<string, ContainerLayout>();
    for (const cl of containerLayouts) {
      containerLayoutsMap.set(cl.containerId, cl);
    }

    // Position nodes inside service lanes chronologically
    const nodePositions = new Map<string, NodePosition>();
    for (const n of visibleNodes) {
      const lane = laneMap.get(n.containerId) ?? 0;
      const rank = nodeRanks.get(n.id) ?? 0;

      const x = PAD_X + rank * DAG_COL_W;
      const y = PAD_Y + lane * (LANE_H + LANE_GAP) + (LANE_H - DAG_NODE_H) / 2 + 10;

      nodePositions.set(n.id, {
        node: n,
        top: y,
        left: x,
        width: DAG_NODE_W,
        height: DAG_NODE_H,
        centerY: y + DAG_NODE_H / 2,
        leftX: x,
        rightX: x + DAG_NODE_W,
        centerX: x + DAG_NODE_W / 2,
        bottomY: y + DAG_NODE_H,
      });
    }

    // Connect edges
    const resolveAnchor = (
      nodeId: string,
      isSource: boolean
    ): { x: number; y: number } | null => {
      if (visibleNodeIds.has(nodeId)) {
        const np = nodePositions.get(nodeId)!;
        return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
      }
      if (visibleContainerIds.has(nodeId)) {
        const cl = containerLayoutsMap.get(nodeId)!;
        return {
          x: isSource ? cl.left + cl.width : cl.left,
          y: cl.top + 34 / 2,
        };
      }
      return null;
    };

    const wires: EdgeWire[] = [];
    for (const edge of edges) {
      const fromAnchor = resolveAnchor(edge.fromNodeId, true);
      const toAnchor = resolveAnchor(edge.toNodeId, false);
      if (!fromAnchor || !toAnchor) continue;

      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      const isCrossContainer = !!(fromNode && toNode && fromNode.containerId !== toNode.containerId);

      wires.push({
        edge,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        fromX: fromAnchor.x,
        fromY: fromAnchor.y,
        toX: toAnchor.x,
        toY: toAnchor.y,
        isCrossContainer,
      });
    }

    return {
      containerLayouts,
      nodePositions,
      parentArrows: [],
      wires,
      canvasWidth,
      canvasHeight,
    };
  }

  // ── 1C. Nesting Swimlane layout code (Default fallback) ──

  const visibleContainers = containers.filter((c) => isContainerVisible(c.id));
  const visibleNodes = nodes.filter((n) => isNodeVisible(n) && isContainerVisible(n.containerId));
  const visibleContainerIds = new Set(visibleContainers.map((c) => c.id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // ── 2. Effective parent map (skip invisible containers + resolve Node IDs) ──
  const effectiveParentMap = new Map<string, string | null>();
  for (const c of visibleContainers) {
    let pid = c.parentContainerId;
    // If the parent ID is a Node ID, resolve its Container ID!
    if (pid && !visibleContainerIds.has(pid)) {
      const parentNode = nodes.find((n) => n.id === pid);
      if (parentNode) {
        pid = parentNode.containerId;
      }
    }
    while (pid && !visibleContainerIds.has(pid)) {
      const p = containers.find((x) => x.id === pid);
      pid = p ? p.parentContainerId : null;
    }
    effectiveParentMap.set(c.id, pid ?? null);
  }

  // ── 3. Group child containers & nodes ──────────────────────
  const childrenMap = new Map<string, ReadContainer[]>();
  for (const c of visibleContainers) {
    const pid = effectiveParentMap.get(c.id);
    if (pid) {
      const list = childrenMap.get(pid) ?? [];
      list.push(c);
      childrenMap.set(pid, list);
    }
  }

  const containerNodesMap = new Map<string, ReadNode[]>();
  for (const n of visibleNodes) {
    const list = containerNodesMap.get(n.containerId) ?? [];
    list.push(n);
    containerNodesMap.set(n.containerId, list);
  }

  // Find root containers (no visible parent)
  const rootContainers = visibleContainers.filter((c) => !effectiveParentMap.get(c.id));
  rootContainers.sort((a, b) => a.startTimeUs - b.startTimeUs);

  // Compute depth index via BFS for color palette
  const depthMap = new Map<string, number>();
  const bfsQueue: Array<{ id: string; depth: number }> = rootContainers.map((c) => ({ id: c.id, depth: 0 }));
  while (bfsQueue.length) {
    const { id, depth } = bfsQueue.shift()!;
    if (depthMap.has(id)) continue;
    depthMap.set(id, depth);
    for (const child of (childrenMap.get(id) ?? [])) {
      bfsQueue.push({ id: child.id, depth: depth + 1 });
    }
  }

  // ── 4. Recursive nested layout coordinate calculations ─────
  const containerLayouts: ContainerLayout[] = [];
  const nodePositions = new Map<string, NodePosition>();

  const layoutContainer = (
    c: ReadContainer,
    left: number,
    top: number
  ): { width: number; height: number } => {
    const cid = c.id;
    const depth = depthMap.get(cid) ?? 0;

    const cNodes = containerNodesMap.get(cid) ?? [];
    const cChildren = childrenMap.get(cid) ?? [];

    // Combine and sort nodes and sub-containers chronologically
    type FlowItem =
      | { type: "node"; item: ReadNode; start: number }
      | { type: "container"; item: ReadContainer; start: number };

    const flowItems: FlowItem[] = [
      ...cNodes.map((n) => ({ type: "node" as const, item: n, start: n.startTimeUs })),
      ...cChildren.map((cc) => ({ type: "container" as const, item: cc, start: cc.startTimeUs })),
    ];
    flowItems.sort((a, b) => a.start - b.start);

    let currentY = top + HEADER_H + CONTAINER_PAD_Y;
    let maxChildWidth: number = COL_W;

    for (const item of flowItems) {
      if (item.type === "node") {
        const node = item.item;
        const x = left + CONTAINER_PAD_X;
        const y = currentY;

        nodePositions.set(node.id, {
          node,
          top: y,
          left: x,
          width: COL_W,
          height: NODE_H,
          centerY: y + NODE_H / 2,
          leftX: x,
          rightX: x + COL_W,
          centerX: x + COL_W / 2,
          bottomY: y + NODE_H,
        });

        currentY += NODE_H + NODE_GAP;
      } else {
        const childContainer = item.item;
        const x = left + INDENT;

        const { width: childW, height: childH } = layoutContainer(childContainer, x, currentY);
        // Calculate nested width bounds correctly
        maxChildWidth = Math.max(maxChildWidth, childW + (INDENT - CONTAINER_PAD_X));

        currentY += childH + NODE_GAP;
      }
    }

    if (flowItems.length > 0) {
      currentY -= NODE_GAP;
    }

    const finalWidth = maxChildWidth + CONTAINER_PAD_X * 2;
    const finalHeight = currentY - top + CONTAINER_PAD_Y;

    containerLayouts.push({
      containerId: cid,
      name: c.name,
      type: c.type,
      tags: c.tags || [],
      depth,
      top,
      left,
      width: finalWidth,
      height: finalHeight,
      parentContainerId: effectiveParentMap.get(cid) ?? null,
    });

    return { width: finalWidth, height: finalHeight };
  };

  // Stack root trees vertically
  let currentY = 0;
  for (const rc of rootContainers) {
    const { height } = layoutContainer(rc, 0, currentY);
    currentY += height + 48; // vertical gap between independent root spans
  }

  // Sort container layouts by depth to ensure child cards stack on top of parents in DOM order
  containerLayouts.sort((a, b) => a.depth - b.depth);

  const containerLayoutsMap = new Map<string, ContainerLayout>();
  for (const cl of containerLayouts) {
    containerLayoutsMap.set(cl.containerId, cl);
  }

  // ── 5. Edge Wires Snapping ──────────────────────────────────
  const resolveAnchor = (
    nodeId: string,
    isSource: boolean
  ): { x: number; y: number } | null => {
    if (visibleNodeIds.has(nodeId)) {
      const np = nodePositions.get(nodeId)!;
      return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
    }
    if (visibleContainerIds.has(nodeId)) {
      const cl = containerLayoutsMap.get(nodeId)!;
      return {
        x: isSource ? cl.left + cl.width : cl.left,
        y: cl.top + HEADER_H / 2,
      };
    }
    return null;
  };

  const wires: EdgeWire[] = [];
  for (const edge of edges) {
    const fromAnchor = resolveAnchor(edge.fromNodeId, true);
    const toAnchor = resolveAnchor(edge.toNodeId, false);
    if (!fromAnchor || !toAnchor) continue;
    if (
      Math.abs(fromAnchor.x - toAnchor.x) < 2 &&
      Math.abs(fromAnchor.y - toAnchor.y) < 2
    ) continue;

    const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
    const toNode = nodes.find((n) => n.id === edge.toNodeId);
    const isCrossContainer = !!(fromNode && toNode && fromNode.containerId !== toNode.containerId);

    wires.push({
      edge,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromX: fromAnchor.x,
      fromY: fromAnchor.y,
      toX: toAnchor.x,
      toY: toAnchor.y,
      isCrossContainer,
    });
  }

  // ── 6. Canvas dimensions ──────────────────────────────────
  let maxRight = 400;
  let maxBottom = 400;
  for (const cl of containerLayouts) {
    maxRight = Math.max(maxRight, cl.left + cl.width);
    maxBottom = Math.max(maxBottom, cl.top + cl.height);
  }

  // Containment is shown by physical nesting, so no parent arrows needed!
  const parentArrows: ParentArrow[] = [];

  return {
    containerLayouts,
    nodePositions,
    parentArrows,
    wires,
    canvasWidth: maxRight + CANVAS_PAD * 2,
    canvasHeight: maxBottom + CANVAS_PAD * 2,
  };
}

// ============================================================
// Utility helpers
// ============================================================

export function getNodeColor(type: string): string {
  const t = type.toLowerCase();
  if (t === "http_server" || t === "express_api") return "var(--node-http-server)";
  if (t === "http_client") return "var(--node-http-client)";
  if (t === "rpc_server" || t === "rpc" || t === "grpc_service") return "var(--node-rpc)";
  if (t === "function" || t === "class_method") return "var(--node-function)";
  if (t === "db" || t === "database") return "var(--node-db)";
  if (t === "step") return "var(--node-step)";
  if (t === "log") return "var(--node-log)";
  if (t === "message_producer" || t === "message_consumer") return "var(--node-message)";
  return "var(--node-default)";
}

export function getNodeTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "http_server" || t === "express_api") return "HTTP";
  if (t === "http_client") return "CLI";
  if (t === "rpc_server" || t === "rpc" || t === "grpc_service") return "RPC";
  if (t === "function" || t === "class_method") return "FN";
  if (t === "db" || t === "database") return "DB";
  if (t === "step") return "STP";
  if (t === "log") return "LOG";
  if (t === "message_producer") return "PUB";
  if (t === "message_consumer") return "SUB";
  return "SVC";
}

export function formatDuration(us: number | null): string {
  if (us === null || us === undefined) return "";
  if (us < 1000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}
