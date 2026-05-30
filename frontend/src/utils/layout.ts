import type { ReadContainer, ReadNode, ReadEdge } from "../api/client";

// ============================================================
// Layout Constants
// ============================================================
export const LAYOUT = {
  COL_W: 320,           // container card width
  COL_GAP: 52,          // horizontal gap between columns (for arrows)
  NODE_H: 58,           // fixed node card height
  NODE_GAP: 5,          // gap between node cards
  CONTAINER_PAD_TOP: 10,// padding above first node inside container
  CONTAINER_PAD_BOT: 12,// padding below last node inside container
  HEADER_H: 68,         // container header height (2-row: title + meta)
  CANVAS_PAD: 48,       // outer canvas padding
} as const;

// ============================================================
// Depth color palette (decorative only — shown as left border)
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
  leftX: number;   // container left edge (wire entry)
  rightX: number;  // container right edge (wire exit)
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
// Layout computation — CHRONOLOGICAL column layout
//
// Key insight: sort all containers by startTimeUs (left = oldest).
// Children naturally appear after parents in time, so the flow
// reads left → right organically.  Depth is decorative (border color)
// rather than positional — no false "same depth = same column" grouping.
//
//  [container A] ──► [container B] ──► [container C] ...
//    [node 1]           [node 1]          [node 1]
//    [node 2]           [node 2]
//    [node 3]
// ============================================================

export function computeLayout(
  containers: ReadContainer[],
  nodes: ReadNode[],
  edges: ReadEdge[],
  activeTags: Set<string>
): LayoutResult {
  const {
    COL_W, COL_GAP,
    NODE_H, NODE_GAP,
    CONTAINER_PAD_TOP, CONTAINER_PAD_BOT,
    HEADER_H,
    CANVAS_PAD,
  } = LAYOUT;

  // ── 1. AND-logic visibility filter ────────────────────────
  const isNodeVisible = (n: ReadNode): boolean => {
    if (activeTags.size === 0) return true;
    return Array.from(activeTags).every((tag) => n.tags && n.tags.includes(tag));
  };

  const containerVisCache = new Map<string, boolean>();
  const isContainerVisible = (cid: string): boolean => {
    if (containerVisCache.has(cid)) return containerVisCache.get(cid)!;

    const tagMatched =
      activeTags.size === 0 ||
      (() => {
        const c = containers.find((x) => x.id === cid);
        return !!(c && Array.from(activeTags).every((tag) => c.tags && c.tags.includes(tag)));
      })();

    if (tagMatched) { containerVisCache.set(cid, true); return true; }

    const hasVisibleNode = nodes.some((n) => n.containerId === cid && isNodeVisible(n));
    if (hasVisibleNode) { containerVisCache.set(cid, true); return true; }

    const hasVisibleChild = containers.some(
      (c) => c.parentContainerId === cid && c.id !== cid && isContainerVisible(c.id)
    );
    if (hasVisibleChild) { containerVisCache.set(cid, true); return true; }

    containerVisCache.set(cid, false);
    return false;
  };

  const visibleContainers = containers.filter((c) => isContainerVisible(c.id));
  const visibleNodes = nodes.filter(
    (n) => isNodeVisible(n) && isContainerVisible(n.containerId)
  );
  const visibleContainerIds = new Set(visibleContainers.map((c) => c.id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // ── 2. Effective parent map ───────────────────────────────
  const effectiveParentMap = new Map<string, string | null>();
  for (const c of visibleContainers) {
    let pid = c.parentContainerId;
    while (pid && !visibleContainerIds.has(pid)) {
      const p = containers.find((x) => x.id === pid);
      pid = p ? p.parentContainerId : null;
    }
    effectiveParentMap.set(c.id, pid ?? null);
  }

  // ── 3. Assign depths (BFS from roots) ─────────────────────
  const depthMap = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  for (const c of visibleContainers) {
    const pid = effectiveParentMap.get(c.id);
    if (pid) {
      const list = childrenMap.get(pid) ?? [];
      list.push(c.id);
      childrenMap.set(pid, list);
    }
  }

  const rootIds = visibleContainers
    .filter((c) => !effectiveParentMap.get(c.id))
    .map((c) => c.id);

  const bfsQueue: Array<{ id: string; depth: number }> = rootIds.map((id) => ({ id, depth: 0 }));
  while (bfsQueue.length) {
    const { id, depth } = bfsQueue.shift()!;
    if (depthMap.has(id)) continue;
    depthMap.set(id, depth);
    for (const childId of (childrenMap.get(id) ?? [])) {
      bfsQueue.push({ id: childId, depth: depth + 1 });
    }
  }

  // ── 4. Group nodes by container ───────────────────────────
  const containerNodesMap = new Map<string, ReadNode[]>();
  for (const n of visibleNodes) {
    const list = containerNodesMap.get(n.containerId) ?? [];
    list.push(n);
    containerNodesMap.set(n.containerId, list);
  }

  const getCardHeight = (cid: string): number => {
    const n = (containerNodesMap.get(cid) ?? []).length;
    const nodesH = n > 0
      ? CONTAINER_PAD_TOP + n * NODE_H + (n - 1) * NODE_GAP + CONTAINER_PAD_BOT
      : CONTAINER_PAD_TOP + CONTAINER_PAD_BOT;
    return HEADER_H + nodesH;
  };

  // ── 5. Chronological column placement ─────────────────────
  // Sort ALL visible containers by startTimeUs → determines left-to-right order.
  // Children naturally follow parents because they start after being called.
  const sorted = [...visibleContainers].sort((a, b) => a.startTimeUs - b.startTimeUs);

  const containerPosMap = new Map<
    string,
    { top: number; left: number; width: number; height: number; depth: number }
  >();

  let currentX = 0;
  for (const c of sorted) {
    const height = getCardHeight(c.id);
    const depth = depthMap.get(c.id) ?? 0;
    containerPosMap.set(c.id, { top: 0, left: currentX, width: COL_W, height, depth });
    currentX += COL_W + COL_GAP;
  }

  // ── 6. Build containerLayouts ─────────────────────────────
  const containerLayouts: ContainerLayout[] = [];
  const containerLayoutsMap = new Map<string, ContainerLayout>();

  for (const c of visibleContainers) {
    const pos = containerPosMap.get(c.id);
    if (!pos) continue;
    const cl: ContainerLayout = {
      containerId: c.id,
      name: c.name,
      type: c.type,
      tags: c.tags || [],
      depth: pos.depth,
      top: pos.top,
      left: pos.left,
      width: pos.width,
      height: pos.height,
      parentContainerId: effectiveParentMap.get(c.id) ?? null,
    };
    containerLayouts.push(cl);
    containerLayoutsMap.set(c.id, cl);
  }

  // ── 7. Node positions ─────────────────────────────────────
  const nodePositions = new Map<string, NodePosition>();

  for (const cl of containerLayouts) {
    const ownNodes = (containerNodesMap.get(cl.containerId) ?? []).slice().sort(
      (a, b) => a.localSequence - b.localSequence || a.startTimeUs - b.startTimeUs
    );
    const INSET = 8;
    let nodeY = cl.top + HEADER_H + CONTAINER_PAD_TOP;

    for (const node of ownNodes) {
      nodePositions.set(node.id, {
        node,
        top: nodeY,
        left: cl.left + INSET,
        width: cl.width - INSET * 2,
        height: NODE_H,
        centerY: nodeY + NODE_H / 2,
        leftX: cl.left,
        rightX: cl.left + cl.width,
      });
      nodeY += NODE_H + NODE_GAP;
    }
  }

  // ── 8. Parent arrows (hierarchy) ─────────────────────────
  const parentArrows: ParentArrow[] = [];
  for (const cl of containerLayouts) {
    if (!cl.parentContainerId) continue;
    const parentCl = containerLayoutsMap.get(cl.parentContainerId);
    if (!parentCl) continue;
    parentArrows.push({
      fromContainerId: cl.parentContainerId,
      toContainerId: cl.containerId,
      fromX: parentCl.left + parentCl.width,
      fromY: parentCl.top + HEADER_H / 2,
      toX: cl.left,
      toY: cl.top + HEADER_H / 2,
      color: getDepthColor(cl.depth),
    });
  }

  // ── 9. Node edge wires ────────────────────────────────────
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
    const asContainer = containers.find((x) => x.id === nodeId);
    if (asContainer) {
      let pid = asContainer.parentContainerId;
      while (pid) {
        if (visibleContainerIds.has(pid)) {
          const cl = containerLayoutsMap.get(pid)!;
          return { x: isSource ? cl.left + cl.width : cl.left, y: cl.top + HEADER_H / 2 };
        }
        const p = containers.find((x) => x.id === pid);
        pid = p ? p.parentContainerId : null;
      }
      return null;
    }
    const asNode = nodes.find((x) => x.id === nodeId);
    if (!asNode) return null;
    for (const ancestorId of [...asNode.parentage].reverse()) {
      if (visibleNodeIds.has(ancestorId)) {
        const np = nodePositions.get(ancestorId)!;
        return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
      }
      if (visibleContainerIds.has(ancestorId)) {
        const cl = containerLayoutsMap.get(ancestorId)!;
        return { x: isSource ? cl.left + cl.width : cl.left, y: cl.top + HEADER_H / 2 };
      }
    }
    return null;
  };

  const wires: EdgeWire[] = [];
  for (const edge of edges) {
    const fromAnchor = resolveAnchor(edge.fromNodeId, true);
    const toAnchor = resolveAnchor(edge.toNodeId, false);
    if (!fromAnchor || !toAnchor) continue;
    if (Math.abs(fromAnchor.x - toAnchor.x) < 2 && Math.abs(fromAnchor.y - toAnchor.y) < 2) continue;

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

  // ── 10. Canvas dimensions ─────────────────────────────────
  let maxRight = 400;
  let maxBottom = 400;
  for (const cl of containerLayouts) {
    maxRight = Math.max(maxRight, cl.left + cl.width);
    maxBottom = Math.max(maxBottom, cl.top + cl.height);
  }

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
