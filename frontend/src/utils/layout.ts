import type { ReadBlock, ReadNode, ReadEdge } from "../api/client";

// ============================================================
// Layout Constants
// ============================================================
export const LAYOUT = {
  NODE_H: 48,             // height of each node row (px)
  NODE_GAP: 4,            // vertical gap between nodes (px)
  BLOCK_PAD: 8,          // block internal padding top/bottom (px)
  BLOCK_HEADER_H: 42,     // block header height (px)
  COL_W: 280,             // block card width (px)
  COL_GAP: 100,            // gap between depth columns (for arrows)
  CANVAS_PAD: 48,         // canvas outer padding (px)
  BLOCK_GAP: 12,          // gap between stacked blocks in same depth column
  CONTAINER_PAD: 20,      // padding inside container band (left/right/bottom)
  CONTAINER_HEADER_H: 34, // container band header height
  CONTAINER_GAP: 48,      // vertical gap between container bands
} as const;

// ============================================================
// Computed types
// ============================================================

export type ContainerLayout = {
  containerId: string;
  label: string;
  top: number;     // px from canvas origin (without CANVAS_PAD)
  left: number;    // px from canvas origin (without CANVAS_PAD)
  width: number;
  height: number;
};

export type BlockPosition = {
  block: ReadBlock;
  top: number;   // px from canvas origin (without CANVAS_PAD)
  left: number;  // px from canvas origin (without CANVAS_PAD)
  height: number;
};

export type NodePosition = {
  node: ReadNode;
  centerY: number;
  blockLeft: number;
  blockRight: number;
};

export type EdgeWire = {
  edge: ReadEdge;
  fromBlockId: string;
  toBlockId: string;
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
  blockPositions: Map<string, BlockPosition>;
  nodePositions: Map<string, NodePosition>;
  wires: EdgeWire[];
  canvasWidth: number;
  canvasHeight: number;
};

// ============================================================
// Helpers
// ============================================================

/** "container-order-api" → "Order API" */
function containerLabel(containerId: string): string {
  return containerId
    .replace(/^container-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ============================================================
// Layout computation
// ============================================================

export function computeLayout(
  blocks: ReadBlock[],
  nodes: ReadNode[],
  edges: ReadEdge[],
  colGap: number = LAYOUT.COL_GAP,
  activeZoom: number = 9999
): LayoutResult {
  const {
    NODE_H, NODE_GAP, BLOCK_PAD, BLOCK_HEADER_H,
    COL_W, BLOCK_GAP,
    CONTAINER_PAD, CONTAINER_HEADER_H, CONTAINER_GAP,
  } = LAYOUT;

  /** Global canvas X for a block at absoluteDepth d (no CANVAS_PAD) */
  const colX = (depth: number): number => {
    return depth * (COL_W + colGap);
  };

  // ── 0. Filter blocks dynamically by absolute depth ────────
  const visibleBlocks = blocks.filter((b) => b.absoluteDepth <= activeZoom);
  const visibleBlockIds = new Set(visibleBlocks.map((b) => b.id));

  // ── 1. Map all nodes for O(1) ancestry path snapping lookups ──
  const allNodesMap = new Map<string, ReadNode>();
  for (const node of nodes) {
    allNodesMap.set(node.id, node);
  }

  // ── 2. Filter visible nodes by importance zoom level & block visibility ──
  const visibleNodes = nodes.filter(
    (n) => n.zoomLevel <= activeZoom && visibleBlockIds.has(n.blockId)
  );

  // Deduplicate visible nodes by ID
  const dedupedNodeMap = new Map<string, ReadNode>();
  for (const node of visibleNodes) {
    const existing = dedupedNodeMap.get(node.id);
    if (!existing) {
      dedupedNodeMap.set(node.id, node);
    } else {
      const hasDur = node.durationUs !== null && node.durationUs !== undefined;
      const exHasDur = existing.durationUs !== null && existing.durationUs !== undefined;
      if (hasDur && !exHasDur) dedupedNodeMap.set(node.id, node);
    }
  }
  const dedupedNodes = Array.from(dedupedNodeMap.values());

  // ── 3. Group nodes by blockId ────────────────────────────
  const nodesByBlock = new Map<string, ReadNode[]>();
  for (const node of dedupedNodes) {
    if (!nodesByBlock.has(node.blockId)) nodesByBlock.set(node.blockId, []);
    nodesByBlock.get(node.blockId)!.push(node);
  }
  for (const arr of nodesByBlock.values()) {
    arr.sort((a, b) => a.localSequence - b.localSequence);
  }

  // ── 4. Block height helper ───────────────────────────────
  function blockHeight(blockId: string): number {
    const bNodes = nodesByBlock.get(blockId) ?? [];
    const nodesH =
      bNodes.length > 0
        ? bNodes.length * NODE_H + (bNodes.length - 1) * NODE_GAP
        : NODE_H;
    return BLOCK_HEADER_H + BLOCK_PAD * 2 + nodesH;
  }

  // ── 5. Group visible blocks by containerId ────────────────
  const blocksByContainer = new Map<string, ReadBlock[]>();
  for (const block of visibleBlocks) {
    const cid = block.containerId || "default";
    if (!blocksByContainer.has(cid)) blocksByContainer.set(cid, []);
    blocksByContainer.get(cid)!.push(block);
  }

  // Sort containers: by their minimum absoluteDepth, then earliest start
  const containerIds = Array.from(blocksByContainer.keys()).sort((a, b) => {
    const aBlocks = blocksByContainer.get(a)!;
    const bBlocks = blocksByContainer.get(b)!;
    const aMin = Math.min(...aBlocks.map((bl) => bl.absoluteDepth));
    const bMin = Math.min(...bBlocks.map((bl) => bl.absoluteDepth));
    if (aMin !== bMin) return aMin - bMin;
    const aStart = Math.min(...aBlocks.map((bl) => bl.startTimeUs));
    const bStart = Math.min(...bBlocks.map((bl) => bl.startTimeUs));
    return aStart - bStart;
  });

  // Block → containerId lookup (for edge cross-container detection)
  const blockContainerMap = new Map<string, string>();
  for (const [cid, cBlocks] of blocksByContainer.entries()) {
    for (const b of cBlocks) blockContainerMap.set(b.id, cid);
  }

  // ── 6. Compute positions ─────────────────────────────────
  const containerLayouts: ContainerLayout[] = [];
  const blockPositions = new Map<string, BlockPosition>();
  let currentTop = 0; // running Y cursor (without CANVAS_PAD)

  for (const cid of containerIds) {
    const cBlocks = blocksByContainer.get(cid)!;

    // Group by absoluteDepth column
    const byDepth = new Map<number, ReadBlock[]>();
    for (const b of cBlocks) {
      if (!byDepth.has(b.absoluteDepth)) byDepth.set(b.absoluteDepth, []);
      byDepth.get(b.absoluteDepth)!.push(b);
    }
    for (const arr of byDepth.values()) {
      arr.sort((a, b) => a.startTimeUs - b.startTimeUs);
    }

    const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
    const minDepth = depths[0];
    const maxDepth = depths[depths.length - 1];

    // Column heights (blocks stacked vertically with BLOCK_GAP)
    let maxColHeight = 0;
    for (const [, dBlocks] of byDepth.entries()) {
      const h =
        dBlocks.reduce((sum, b) => sum + blockHeight(b.id) + BLOCK_GAP, 0) -
        BLOCK_GAP;
      maxColHeight = Math.max(maxColHeight, h);
    }

    // Container box dimensions (no CANVAS_PAD — renderer adds it)
    const cLeft  = colX(minDepth) - CONTAINER_PAD;
    const cWidth  = colX(maxDepth) + COL_W - colX(minDepth) + CONTAINER_PAD * 2;
    const cHeight = CONTAINER_HEADER_H + CONTAINER_PAD + maxColHeight + CONTAINER_PAD;

    containerLayouts.push({
      containerId: cid,
      label: containerLabel(cid),
      top: currentTop,
      left: cLeft,
      width: cWidth,
      height: cHeight,
    });

    // Position blocks within the container
    const innerTop = currentTop + CONTAINER_HEADER_H + CONTAINER_PAD;
    for (const [depth, dBlocks] of byDepth.entries()) {
      let blockY = innerTop;
      for (const block of dBlocks) {
        const h = blockHeight(block.id);
        blockPositions.set(block.id, {
          block,
          top: blockY,
          left: colX(depth),
          height: h,
        });
        blockY += h + BLOCK_GAP;
      }
    }

    currentTop += cHeight + CONTAINER_GAP;
  }

  // ── 7. Node center Y positions ────────────────────────────
  const nodePositions = new Map<string, NodePosition>();
  for (const [blockId, bNodes] of nodesByBlock.entries()) {
    const bp = blockPositions.get(blockId);
    if (!bp) continue;
    for (const node of bNodes) {
      const nodeTopInBlock =
        BLOCK_HEADER_H + BLOCK_PAD + node.localSequence * (NODE_H + NODE_GAP);
      const centerY = bp.top + nodeTopInBlock + NODE_H / 2;
      nodePositions.set(node.id, {
        node,
        centerY,
        blockLeft: bp.left,
        blockRight: bp.left + COL_W,
      });
    }
  }

  // ── 8. Edge wires & ancestry snapping ──────────────────────
  const visibleNodeIds = new Set(dedupedNodes.map((n) => n.id));

  function resolveNodeId(nodeId: string): string | null {
    if (visibleNodeIds.has(nodeId)) return nodeId;
    // Strip _caller suffix and try bare UUID
    if (nodeId.endsWith("_caller")) {
      const bare = nodeId.slice(0, -"_caller".length);
      if (visibleNodeIds.has(bare)) return bare;
    }
    // Snap to visible ancestor via ancestryPath (using allNodesMap containing hidden nodes)
    const node = allNodesMap.get(nodeId);
    if (node) {
      const path = [...node.ancestryPath].reverse();
      for (const aid of path) {
        if (visibleNodeIds.has(aid)) return aid;
      }
      const bNodes = nodesByBlock.get(node.blockId);
      if (bNodes && bNodes.length > 0) {
        const first = bNodes.find((n) => visibleNodeIds.has(n.id));
        if (first) return first.id;
      }
    }
    return null;
  }

  const wires: EdgeWire[] = [];
  for (const edge of edges) {
    let fromId = resolveNodeId(edge.fromNodeId);
    let toId   = resolveNodeId(edge.toNodeId);
    if (!fromId || !toId || fromId === toId) continue;

    const fromNP = nodePositions.get(fromId);
    const toNP   = nodePositions.get(toId);
    if (!fromNP || !toNP) continue;

    // Skip if both nodes are in the exact same block column (intra-block)
    if (fromNP.blockLeft === toNP.blockLeft && fromNP.centerY === toNP.centerY) continue;

    // Detect cross-container: does the edge cross a container boundary?
    const fromBlockId = dedupedNodes.find((n) => n.id === fromId)?.blockId;
    const toBlockId   = dedupedNodes.find((n) => n.id === toId)?.blockId;
    if (!fromBlockId || !toBlockId) continue;

    const fromCid = blockContainerMap.get(fromBlockId);
    const toCid   = blockContainerMap.get(toBlockId);
    const isCrossContainer = !!(fromCid && toCid && fromCid !== toCid);

    wires.push({
      edge,
      fromBlockId,
      toBlockId,
      fromNodeId: fromId,
      toNodeId: toId,
      fromX: fromNP.blockRight,
      fromY: fromNP.centerY,
      toX:   toNP.blockLeft,
      toY:   toNP.centerY,
      isCrossContainer,
    });
  }

  // ── 9. Canvas dimensions ──────────────────────────────────
  let maxRight  = 0;
  let maxBottom = 0;
  for (const bp of blockPositions.values()) {
    maxRight  = Math.max(maxRight,  bp.left + COL_W);
    maxBottom = Math.max(maxBottom, bp.top  + bp.height);
  }
  // Also account for container boxes
  for (const cl of containerLayouts) {
    maxRight  = Math.max(maxRight,  cl.left + cl.width);
    maxBottom = Math.max(maxBottom, cl.top  + cl.height);
  }

  return {
    containerLayouts,
    blockPositions,
    nodePositions,
    wires,
    canvasWidth:  maxRight  + LAYOUT.CANVAS_PAD * 2,
    canvasHeight: maxBottom + LAYOUT.CANVAS_PAD * 2,
  };
}

// ============================================================
// Node type → color mapping
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

// Zoom level descriptions
export function getZoomLevelDesc(level: number): string {
  if (level === 0) return "Critical only (entry points)";
  if (level === 1) return "Key operations";
  return `Detailed (level ${level})`;
}

// Format microseconds
export function formatDuration(us: number | null): string {
  if (us === null || us === undefined) return "";
  if (us < 1000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}
