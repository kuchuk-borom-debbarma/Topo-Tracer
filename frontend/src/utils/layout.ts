import type { ReadContainer, ReadNode, ReadEdge } from "../api/client";

// ============================================================
// Layout Constants
// ============================================================
export const LAYOUT = {
  COL_W: 340,           // container card width
  COL_GAP: 160,         // horizontal gap between depth columns (for arrows)
  NODE_H: 68,           // fixed node card height
  NODE_GAP: 6,          // gap between node cards
  CONTAINER_PAD_TOP: 10,// padding above first node inside container
  CONTAINER_PAD_BOT: 12,// padding below last node inside container
  HEADER_H: 52,         // container header height
  CONTAINER_GAP: 24,    // vertical gap between containers in same column
  CANVAS_PAD: 60,       // outer canvas padding
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
  top: number;        // absolute top position on canvas
  left: number;       // left offset of the node card (inside the container)
  width: number;      // node card width
  height: number;     // node card height
  centerY: number;    // vertical center for wire connections
  leftX: number;      // container left edge (wire entry point)
  rightX: number;     // container right edge (wire exit point)
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
// Layout computation — column-based tree layout
// X axis = depth (each depth level is a vertical column)
// Y axis = same-depth containers stacked top-to-bottom
// Arrows flow left→right (parent→child) across column gaps
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
    CONTAINER_GAP,
    CANVAS_PAD,
  } = LAYOUT;

  // ── 1. Strict Visibility Filter (AND logic) ────────────────
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

    if (tagMatched) {
      containerVisCache.set(cid, true);
      return true;
    }

    const hasVisibleNode = nodes.some((n) => n.containerId === cid && isNodeVisible(n));
    if (hasVisibleNode) {
      containerVisCache.set(cid, true);
      return true;
    }

    const hasVisibleChild = containers.some(
      (c) => c.parentContainerId === cid && c.id !== cid && isContainerVisible(c.id)
    );
    if (hasVisibleChild) {
      containerVisCache.set(cid, true);
      return true;
    }

    containerVisCache.set(cid, false);
    return false;
  };

  const visibleContainers = containers.filter((c) => isContainerVisible(c.id));
  const visibleNodes = nodes.filter(
    (n) => isNodeVisible(n) && isContainerVisible(n.containerId)
  );

  const visibleContainerIds = new Set(visibleContainers.map((c) => c.id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // ── 2. Build effective parent map ──────────────────────────
  // For each visible container, find closest visible ancestor
  const effectiveParentMap = new Map<string, string | null>();
  const childrenMap = new Map<string, string[]>();

  for (const c of visibleContainers) {
    let parentId = c.parentContainerId;
    while (parentId && !visibleContainerIds.has(parentId)) {
      const p = containers.find((x) => x.id === parentId);
      parentId = p ? p.parentContainerId : null;
    }
    effectiveParentMap.set(c.id, parentId ?? null);
    if (parentId) {
      const list = childrenMap.get(parentId) ?? [];
      list.push(c.id);
      childrenMap.set(parentId, list);
    }
  }

  // Root containers (no visible ancestor)
  const rootIds = visibleContainers
    .filter((c) => !effectiveParentMap.get(c.id))
    .map((c) => c.id)
    .sort((a, b) => {
      const ca = visibleContainers.find((c) => c.id === a)!;
      const cb = visibleContainers.find((c) => c.id === b)!;
      return ca.startTimeUs - cb.startTimeUs;
    });

  // ── 3. Assign depths (BFS) ─────────────────────────────────
  const depthMap = new Map<string, number>();
  const bfsQueue: Array<{ id: string; depth: number }> = rootIds.map((id) => ({
    id,
    depth: 0,
  }));
  while (bfsQueue.length > 0) {
    const { id, depth } = bfsQueue.shift()!;
    if (depthMap.has(id)) continue;
    depthMap.set(id, depth);
    const children = childrenMap.get(id) ?? [];
    for (const childId of children) {
      bfsQueue.push({ id: childId, depth: depth + 1 });
    }
  }

  // ── 4. Compute container card heights ─────────────────────
  const containerNodesMap = new Map<string, ReadNode[]>();
  for (const n of visibleNodes) {
    const list = containerNodesMap.get(n.containerId) ?? [];
    list.push(n);
    containerNodesMap.set(n.containerId, list);
  }

  const getCardHeight = (cid: string): number => {
    const ownNodes = containerNodesMap.get(cid) ?? [];
    const n = ownNodes.length;
    const nodesH =
      n > 0
        ? CONTAINER_PAD_TOP + n * NODE_H + (n - 1) * NODE_GAP + CONTAINER_PAD_BOT
        : CONTAINER_PAD_TOP + CONTAINER_PAD_BOT;
    return HEADER_H + nodesH;
  };

  // ── 5. Column-based position assignment (DFS) ──────────────
  // col current Y tracks the next free Y for each depth column
  const colCurrentY = new Map<number, number>();

  const containerPosMap = new Map<
    string,
    { top: number; left: number; width: number; height: number; depth: number }
  >();

  const positionSubtree = (cid: string, depth: number, minY: number): void => {
    const left = depth * (COL_W + COL_GAP);
    const top = Math.max(colCurrentY.get(depth) ?? 0, minY);
    const height = getCardHeight(cid);

    containerPosMap.set(cid, { top, left, width: COL_W, height, depth });
    colCurrentY.set(depth, top + height + CONTAINER_GAP);

    // Position children: try to start at same Y as parent, but respect column advancement
    const children = (childrenMap.get(cid) ?? []).slice().sort((a, b) => {
      const ca = visibleContainers.find((c) => c.id === a)!;
      const cb = visibleContainers.find((c) => c.id === b)!;
      return ca.startTimeUs - cb.startTimeUs;
    });

    for (const childId of children) {
      positionSubtree(childId, depth + 1, top);
    }
  };

  for (const rootId of rootIds) {
    positionSubtree(rootId, 0, colCurrentY.get(0) ?? 0);
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

  // ── 7. Compute node positions ─────────────────────────────
  const nodePositions = new Map<string, NodePosition>();

  for (const cl of containerLayouts) {
    const ownNodes = (containerNodesMap.get(cl.containerId) ?? []).slice().sort(
      (a, b) => a.localSequence - b.localSequence || a.startTimeUs - b.startTimeUs
    );

    const NODE_CARD_INSET = 10; // horizontal inset inside container card
    let nodeY = cl.top + HEADER_H + CONTAINER_PAD_TOP;

    for (const node of ownNodes) {
      const nodeLeft = cl.left + NODE_CARD_INSET;
      const nodeWidth = cl.width - NODE_CARD_INSET * 2;
      nodePositions.set(node.id, {
        node,
        top: nodeY,
        left: nodeLeft,
        width: nodeWidth,
        height: NODE_H,
        centerY: nodeY + NODE_H / 2,
        leftX: cl.left,               // container card left edge (wire entry)
        rightX: cl.left + cl.width,   // container card right edge (wire exit)
      });
      nodeY += NODE_H + NODE_GAP;
    }
  }

  // ── 8. Compute parent arrows ──────────────────────────────
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

  // ── 9. Compute node edge wires ────────────────────────────
  const resolveAnchor = (
    nodeId: string,
    isSource: boolean
  ): { x: number; y: number } | null => {
    // 1. Visible node — snap to its container boundary at node's Y center
    if (visibleNodeIds.has(nodeId)) {
      const np = nodePositions.get(nodeId)!;
      return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
    }

    // 2. Visible container referenced as node ID
    if (visibleContainerIds.has(nodeId)) {
      const cl = containerLayoutsMap.get(nodeId)!;
      return {
        x: isSource ? cl.left + cl.width : cl.left,
        y: cl.top + HEADER_H / 2,
      };
    }

    // 3. Hidden container — walk ancestor chain
    const asContainer = containers.find((x) => x.id === nodeId);
    if (asContainer) {
      let pid = asContainer.parentContainerId;
      while (pid) {
        if (visibleContainerIds.has(pid)) {
          const cl = containerLayoutsMap.get(pid)!;
          return {
            x: isSource ? cl.left + cl.width : cl.left,
            y: cl.top + HEADER_H / 2,
          };
        }
        const p = containers.find((x) => x.id === pid);
        pid = p ? p.parentContainerId : null;
      }
      return null;
    }

    // 4. Hidden node — walk parentage
    const asNode = nodes.find((x) => x.id === nodeId);
    if (!asNode) return null;

    const path = [...asNode.parentage].reverse();
    for (const ancestorId of path) {
      if (visibleNodeIds.has(ancestorId)) {
        const np = nodePositions.get(ancestorId)!;
        return { x: isSource ? np.rightX : np.leftX, y: np.centerY };
      }
      if (visibleContainerIds.has(ancestorId)) {
        const cl = containerLayoutsMap.get(ancestorId)!;
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

    // Skip degenerate wires
    if (
      Math.abs(fromAnchor.x - toAnchor.x) < 2 &&
      Math.abs(fromAnchor.y - toAnchor.y) < 2
    )
      continue;

    const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
    const toNode = nodes.find((n) => n.id === edge.toNodeId);
    const isCrossContainer = !!(
      fromNode &&
      toNode &&
      fromNode.containerId !== toNode.containerId
    );

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
