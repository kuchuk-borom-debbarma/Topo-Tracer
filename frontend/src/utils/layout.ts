import type { ReadContainer, ReadNode, ReadEdge } from "../api/client";

// ============================================================
// Layout Constants
// ============================================================
export const LAYOUT = {
  NODE_H: 42,             // height of node row
  NODE_GAP: 6,            // gap between node rows
  CONTAINER_PAD_Y: 16,    // vertical padding inside container
  CONTAINER_PAD_X: 18,    // horizontal padding inside container
  CONTAINER_HEADER_H: 38, // container header height
  COL_W: 320,             // width of a node card/row
  INDENT: 36,             // nesting horizontal indent on X-axis
  CANVAS_PAD: 48,         // outer canvas padding
} as const;

// ============================================================
// Computed types
// ============================================================

export type ContainerLayout = {
  containerId: string;
  name: string;
  type: string;
  tags: string[];
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
  wires: EdgeWire[];
  canvasWidth: number;
  canvasHeight: number;
};

// ============================================================
// Layout computation
// ============================================================

export function computeLayout(
  containers: ReadContainer[],
  nodes: ReadNode[],
  edges: ReadEdge[],
  activeTags: Set<string>
): LayoutResult {
  const {
    NODE_H, NODE_GAP, CONTAINER_PAD_Y, CONTAINER_PAD_X,
    CONTAINER_HEADER_H, COL_W, INDENT, CANVAS_PAD
  } = LAYOUT;

  // ── 1. Strict Visibility Filter (AND logic) ────────────────
  const isNodeVisible = (n: ReadNode): boolean => {
    if (activeTags.size === 0) return true;
    return Array.from(activeTags).every(tag => n.tags && n.tags.includes(tag));
  };

  const containerVisCache = new Map<string, boolean>();
  const isContainerVisible = (cid: string): boolean => {
    if (containerVisCache.has(cid)) return containerVisCache.get(cid)!;

    // A container is visible if it matches tags OR has any visible children/nodes inside it
    const tagMatched = activeTags.size === 0 || (() => {
      const c = containers.find(x => x.id === cid);
      return !!(c && Array.from(activeTags).every(tag => c.tags && c.tags.includes(tag)));
    })();

    if (tagMatched) {
      containerVisCache.set(cid, true);
      return true;
    }

    const hasVisibleNode = nodes.some(n => n.containerId === cid && isNodeVisible(n));
    if (hasVisibleNode) {
      containerVisCache.set(cid, true);
      return true;
    }

    const hasVisibleChild = containers.some(c => c.parentContainerId === cid && c.id !== cid && isContainerVisible(c.id));
    if (hasVisibleChild) {
      containerVisCache.set(cid, true);
      return true;
    }

    containerVisCache.set(cid, false);
    return false;
  };

  const visibleContainers = containers.filter(c => isContainerVisible(c.id));
  const visibleNodes = nodes.filter(n => isNodeVisible(n) && isContainerVisible(n.containerId));

  const visibleContainerIds = new Set(visibleContainers.map(c => c.id));
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  // ── 2. Group items by container for chronological sequence ──
  const containerChildren = new Map<string, ReadContainer[]>();
  for (const c of visibleContainers) {
    if (!c.parentContainerId) continue;
    // Walk parent hierarchy to find closest visible ancestor
    let parentId: string | null = c.parentContainerId;
    while (parentId && !visibleContainerIds.has(parentId)) {
      const p = containers.find(x => x.id === parentId);
      parentId = p ? p.parentContainerId : null;
    }
    if (parentId) {
      const list = containerChildren.get(parentId) || [];
      list.push(c);
      containerChildren.set(parentId, list);
    }
  }

  const containerNodes = new Map<string, ReadNode[]>();
  for (const n of visibleNodes) {
    const list = containerNodes.get(n.containerId) || [];
    list.push(n);
    containerNodes.set(n.containerId, list);
  }

  // Find root containers (no visible parent)
  const rootContainers = visibleContainers.filter(c => {
    let parentId = c.parentContainerId;
    while (parentId) {
      if (visibleContainerIds.has(parentId)) return false;
      const p = containers.find(x => x.id === parentId);
      parentId = p ? p.parentContainerId : null;
    }
    return true;
  });

  // Sort roots by start time
  rootContainers.sort((a, b) => a.startTimeUs - b.startTimeUs);

  // ── 3. Recursive coordinate calculation ──────────────────
  const containerLayouts: ContainerLayout[] = [];
  const nodePositions = new Map<string, NodePosition>();

  const layoutContainer = (
    c: ReadContainer, 
    left: number, 
    top: number
  ): { width: number; height: number } => {
    const cid = c.id;

    // Gather and sort all direct visible items in this container chronologically
    const cNodes = containerNodes.get(cid) || [];
    const cChildren = containerChildren.get(cid) || [];

    type FlowItem = { type: "node"; item: ReadNode; start: number } | { type: "container"; item: ReadContainer; start: number };
    const flowItems: FlowItem[] = [
      ...cNodes.map(n => ({ type: "node" as const, item: n, start: n.startTimeUs })),
      ...cChildren.map(cc => ({ type: "container" as const, item: cc, start: cc.startTimeUs }))
    ];
    flowItems.sort((a, b) => a.start - b.start);

    let currentY = top + CONTAINER_HEADER_H + CONTAINER_PAD_Y;
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
          rightX: x + COL_W
        });

        currentY += NODE_H + NODE_GAP;
      } else {
        const childContainer = item.item;
        const x = left + INDENT;
        
        const { width: childW, height: childH } = layoutContainer(childContainer, x, currentY);
        maxChildWidth = Math.max(maxChildWidth, childW + (INDENT - CONTAINER_PAD_X));
        
        currentY += childH + NODE_GAP;
      }
    }

    // Clean trailing gap
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
      top,
      left,
      width: finalWidth,
      height: finalHeight,
      parentContainerId: c.parentContainerId
    });

    return { width: finalWidth, height: finalHeight };
  };

  // Stack root containers vertically
  let currentY = 0;
  for (const rc of rootContainers) {
    const { height } = layoutContainer(rc, 0, currentY);
    currentY += height + 40; // gap between trace trees
  }

  const containerLayoutsMap = new Map<string, ContainerLayout>();
  for (const cl of containerLayouts) {
    containerLayoutsMap.set(cl.containerId, cl);
  }

  // ── 4. Dynamic Snap Re-linking & Border Snapping ─────────
  const resolveNodeAnchor = (nodeId: string, isSource: boolean): { x: number; y: number } | null => {
    // 1. If it's a visible node, return its anchor
    if (visibleNodeIds.has(nodeId)) {
      const np = nodePositions.get(nodeId)!;
      return {
        x: isSource ? np.rightX : np.leftX,
        y: np.centerY
      };
    }

    // 2. If it's a visible container, return its container card anchor
    if (visibleContainerIds.has(nodeId)) {
      const cl = containerLayoutsMap.get(nodeId)!;
      return {
        x: isSource ? cl.left + cl.width : cl.left,
        y: cl.top + CONTAINER_HEADER_H / 2
      };
    }

    // 3. Maybe it is a container ID that is hidden. Let's walk its container parent hierarchy
    const container = containers.find(x => x.id === nodeId);
    if (container) {
      let parentId = container.parentContainerId;
      while (parentId) {
        if (visibleContainerIds.has(parentId)) {
          const cl = containerLayoutsMap.get(parentId)!;
          return {
            x: isSource ? cl.left + cl.width : cl.left,
            y: cl.top + CONTAINER_HEADER_H / 2
          };
        }
        const p = containers.find(x => x.id === parentId);
        parentId = p ? p.parentContainerId : null;
      }
      return null;
    }

    // 4. Otherwise, it is a hidden node. Let's traverse its parentage path
    const node = nodes.find(x => x.id === nodeId);
    if (!node) return null;

    const path = [...node.parentage].reverse();
    for (const ancestorId of path) {
      if (visibleNodeIds.has(ancestorId)) {
        const np = nodePositions.get(ancestorId)!;
        return {
          x: isSource ? np.rightX : np.leftX,
          y: np.centerY
        };
      }
      if (visibleContainerIds.has(ancestorId)) {
        // Snap directly to the container boundary card
        const cl = containerLayoutsMap.get(ancestorId)!;
        return {
          // Anchors to Left Edge Center (for targets) or Right Edge Center (for sources) of container card header
          x: isSource ? cl.left + cl.width : cl.left,
          y: cl.top + CONTAINER_HEADER_H / 2
        };
      }
    }

    return null;
  };

  const wires: EdgeWire[] = [];
  for (const edge of edges) {
    const fromAnchor = resolveNodeAnchor(edge.fromNodeId, true);
    const toAnchor = resolveNodeAnchor(edge.toNodeId, false);

    if (!fromAnchor || !toAnchor) continue;

    // Eliminate loops or zero-length wires
    if (Math.abs(fromAnchor.x - toAnchor.x) < 2 && Math.abs(fromAnchor.y - toAnchor.y) < 2) continue;

    // Detect cross-container boundary
    const fromNode = nodes.find(n => n.id === edge.fromNodeId);
    const toNode = nodes.find(n => n.id === edge.toNodeId);
    const isCrossContainer = !!(fromNode && toNode && fromNode.containerId !== toNode.containerId);

    wires.push({
      edge,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromX: fromAnchor.x,
      fromY: fromAnchor.y,
      toX: toAnchor.x,
      toY: toAnchor.y,
      isCrossContainer
    });
  }

  // ── 5. Canvas Dimensions ──────────────────────────────────
  let maxRight = 400;
  let maxBottom = 400;

  for (const cl of containerLayouts) {
    maxRight = Math.max(maxRight, cl.left + cl.width);
    maxBottom = Math.max(maxBottom, cl.top + cl.height);
  }

  return {
    containerLayouts,
    nodePositions,
    wires,
    canvasWidth: maxRight + CANVAS_PAD * 2,
    canvasHeight: maxBottom + CANVAS_PAD * 2
  };
}

// ============================================================
// Utility styling & formatting helper exports
// ============================================================

export function getNodeColor(type: string): string {
  const t = type.toLowerCase();
  if (t === "http_server" || t === "express_api") return "var(--node-http-server)";
  if (t === "http_client")                         return "var(--node-http-client)";
  if (t === "rpc_server" || t === "rpc" || t === "grpc_service") return "var(--node-rpc)";
  if (t === "function"   || t === "class_method")  return "var(--node-function)";
  if (t === "db"         || t === "database")      return "var(--node-db)";
  if (t === "step")                                return "var(--node-step)";
  if (t === "log")                                 return "var(--node-log)";
  if (t === "message_producer" || t === "message_consumer") return "var(--node-message)";
  return "var(--node-default)";
}

export function formatDuration(us: number | null): string {
  if (us === null || us === undefined) return "";
  if (us < 1000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}
