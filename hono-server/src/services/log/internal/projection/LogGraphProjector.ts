import {
  ReadNode,
  ReadEdge,
  ProjectionReadCap,
  ProjectedGraphResult,
  ProjectedNormalNode,
  ProjectedGhostNode,
  ProjectedGraphNode,
  ProjectedGraphEdge
} from "../../api/types";

export class LogGraphProjector {
  project(params: {
    userId: string;
    traceId: string;
    threshold: number;
    nodes: ReadNode[];
    edges: ReadEdge[];
    nodeCap: ProjectionReadCap;
    edgeCap: ProjectionReadCap;
  }): ProjectedGraphResult {
    const { traceId, threshold, nodes, edges, nodeCap, edgeCap } = params;

    // 1. Sort nodes by flowOrder ASC, id ASC
    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.flowOrder !== b.flowOrder) return a.flowOrder - b.flowOrder;
      return a.id.localeCompare(b.id);
    });

    const projectedNodes: ProjectedGraphNode[] = [];
    const nodeProjectionById = new Map<string, string>(); // original id -> projected id (normal or ghost)
    const ghostNodesById = new Map<string, ProjectedGhostNode>();

    let currentHiddenRun: ReadNode[] = [];

    const finalizeHiddenRun = () => {
      if (currentHiddenRun.length === 0) return;

      const flowOrderStart = currentHiddenRun[0].flowOrder;
      const flowOrderEnd = currentHiddenRun[currentHiddenRun.length - 1].flowOrder;
      const ghostId = `ghost:${traceId}:${threshold}:${flowOrderStart}:${flowOrderEnd}`;

      const nodeTypeCounts: Record<string, number> = {};
      let minImportanceLevel = Infinity;
      let maxImportanceLevel = -Infinity;
      let startedAt = Infinity;
      let endedAt: number | null = -Infinity;

      for (const node of currentHiddenRun) {
        nodeProjectionById.set(node.id, ghostId);
        
        nodeTypeCounts[node.nodeType] = (nodeTypeCounts[node.nodeType] || 0) + 1;
        minImportanceLevel = Math.min(minImportanceLevel, node.importanceLevel);
        maxImportanceLevel = Math.max(maxImportanceLevel, node.importanceLevel);
        startedAt = Math.min(startedAt, node.startedAt);
        if (node.endedAt !== null) {
          endedAt = Math.max(endedAt || -Infinity, node.endedAt);
        }
      }

      if (endedAt === -Infinity) endedAt = null;

      const ghost: ProjectedGhostNode = {
        kind: "ghost",
        id: ghostId,
        hiddenNodeCount: currentHiddenRun.length,
        hiddenEdgeCount: 0,
        nodeTypeCounts,
        minImportanceLevel,
        maxImportanceLevel,
        startedAt,
        endedAt,
        flowOrderStart,
        flowOrderEnd,
      };

      projectedNodes.push(ghost);
      ghostNodesById.set(ghostId, ghost);
      currentHiddenRun = [];
    };

    for (const node of sortedNodes) {
      if (node.importanceLevel <= threshold) {
        finalizeHiddenRun();
        projectedNodes.push({
          kind: "normal",
          id: node.id,
          nodeType: node.nodeType,
          data: node.data,
          startedAt: node.startedAt,
          endedAt: node.endedAt,
          importanceLevel: node.importanceLevel,
          flowOrder: node.flowOrder,
          materializedAt: node.materializedAt,
        });
        nodeProjectionById.set(node.id, node.id);
      } else {
        currentHiddenRun.push(node);
      }
    }
    finalizeHiddenRun();

    // 2. Edge snapping and aggregation
    let omittedEdgeCount = 0;
    const aggregateEdges = new Map<string, ProjectedGraphEdge>();

    for (const edge of edges) {
      const projectedFromId = nodeProjectionById.get(edge.fromNodeId);
      const projectedToId = nodeProjectionById.get(edge.toNodeId);

      if (!projectedFromId || !projectedToId) {
        omittedEdgeCount++;
        continue;
      }

      if (projectedFromId === projectedToId && ghostNodesById.has(projectedFromId)) {
        const ghost = ghostNodesById.get(projectedFromId)!;
        ghost.hiddenEdgeCount++;
        continue;
      }

      const aggregateKey = `${projectedFromId}|${projectedToId}|${edge.edgeType}`;
      const existing = aggregateEdges.get(aggregateKey);

      if (existing) {
        existing.edgeCount++;
        existing.startedAt = Math.min(existing.startedAt, edge.startedAt);
        if (edge.endedAt !== null) {
          existing.endedAt = Math.max(existing.endedAt || -Infinity, edge.endedAt);
        }
      } else {
        aggregateEdges.set(aggregateKey, {
          id: `edge:${projectedFromId}:${projectedToId}:${edge.edgeType}`,
          fromNodeId: projectedFromId,
          toNodeId: projectedToId,
          edgeType: edge.edgeType,
          edgeCount: 1,
          startedAt: edge.startedAt,
          endedAt: edge.endedAt,
        });
      }
    }

    const projectedEdges = Array.from(aggregateEdges.values());

    // Max materialized timestamp
    let maxMaterializedAt = 0;
    for (const node of nodes) {
      maxMaterializedAt = Math.max(maxMaterializedAt, node.materializedAt);
    }
    for (const edge of edges) {
      maxMaterializedAt = Math.max(maxMaterializedAt, edge.materializedAt);
    }

    const visibleNodeCount = projectedNodes.filter(n => n.kind === "normal").length;
    const ghostNodeCount = projectedNodes.filter(n => n.kind === "ghost").length;

    return {
      nodes: projectedNodes,
      edges: projectedEdges,
      metadata: {
        threshold,
        returnedNodeCount: projectedNodes.length,
        returnedEdgeCount: projectedEdges.length,
        visibleNodeCount,
        ghostNodeCount,
        materializedAt: maxMaterializedAt,
        nodeCap,
        edgeCap,
        omittedEdgeCount,
      },
    };
  }
}
