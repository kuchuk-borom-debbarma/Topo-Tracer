import {
  ReadNode,
  ReadEdge,
  ProjectionReadCap,
  ProjectedFlowResult,
  ProjectedNormalNode,
  ProjectedGhostNode,
  ProjectedCollapsedGroupNode,
  ProjectedCollapsedLayerNode,
  ProjectedFlowNode,
  ProjectedFlowEdge
} from "../../api/types";


/**
 * Projects a raw materialized trace sub-flow by filtering nodes based on an importance threshold.
 * Nodes exceeding the threshold are collapsed ("ghosted") into aggregated placeholder nodes.
 * Edges are snapped and consolidated (aggregated) to reference the new projected nodes.
 */
export class LogFlowProjector {
  /**
   * Projects nodes and edges into normal/ghost groupings.
   * Steps:
   * 1. Sort nodes topologically by flowOrder.
   * 2. Loop over nodes. If node importance <= threshold, it remains a normal node.
   *    If node importance > threshold, it is staged into a run of hidden nodes.
   *    When a normal node is encountered (or loop ends), the run of hidden nodes is collapsed into a single ghost node.
   * 3. Loop over edges. Snap edge source/target IDs to the corresponding projected node IDs.
   *    If both source and target map to the same ghost node, it becomes a hidden edge count on that ghost node.
   *    Otherwise, edges are aggregated by from/to/type keys.
   */
  project(params: {
    userId: string;
    traceId: string;
    threshold: number;
    nodes: ReadNode[];
    edges: ReadEdge[];
    nodeCap: ProjectionReadCap;
    edgeCap: ProjectionReadCap;
    collapsedGroups?: string[];
    collapsedLayers?: string[];
  }): ProjectedFlowResult {
    const {
      traceId,
      threshold,
      nodes,
      edges,
      nodeCap,
      edgeCap,
      collapsedGroups = [],
      collapsedLayers = [],
    } = params;

    // 1. Sort nodes by flowOrder ASC, id ASC
    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.flowOrder !== b.flowOrder) return a.flowOrder - b.flowOrder;
      return a.id.localeCompare(b.id);
    });

    const projectedNodes: ProjectedFlowNode[] = [];
    const nodeProjectionById = new Map<string, string>(); // original id -> projected id (normal or ghost)
    const ghostNodesById = new Map<string, ProjectedGhostNode>();
    const groupNodesById = new Map<string, ProjectedCollapsedGroupNode>();
    const layerNodesById = new Map<string, ProjectedCollapsedLayerNode>();
    const nodeById = new Map(sortedNodes.map((node) => [node.id, node]));
    const childGroupCountById = this.buildChildGroupCounts(sortedNodes);
    const collapsedGroupSet = new Set(collapsedGroups);
    const collapsedLayerSet = new Set(collapsedLayers);

    let currentHiddenRun: ReadNode[] = [];

    // Helper to collapse consecutive hidden nodes into a single ghost node
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

    // Construct projected nodes (normals vs ghosts)
    for (const node of sortedNodes) {
      const collapsedLayerKey = node.layer && collapsedLayerSet.has(node.layer.key)
        ? node.layer.key
        : null;
      const collapsedGroupId = collapsedLayerKey
        ? null
        : this.findCollapsedGroupId(node, nodeById, collapsedGroupSet);

      if (collapsedLayerKey && node.layer) {
        finalizeHiddenRun();
        const layerId = `layer:${traceId}:${node.layer.key}`;
        nodeProjectionById.set(node.id, layerId);
        const projectedLayer = layerNodesById.get(layerId);
        if (projectedLayer) {
          this.addNodeToCollapsed(projectedLayer, node);
        } else {
          const nextLayer: ProjectedCollapsedLayerNode = {
            kind: "layer",
            id: layerId,
            layer: node.layer,
            hiddenNodeCount: 1,
            hiddenEdgeCount: 0,
            childGroupCount: childGroupCountById.get(node.id) ?? 0,
            startedAt: node.startedAt,
            endedAt: node.endedAt,
            flowOrderStart: node.flowOrder,
            flowOrderEnd: node.flowOrder,
          };
          projectedNodes.push(nextLayer);
          layerNodesById.set(layerId, nextLayer);
        }
        continue;
      }

      if (collapsedGroupId) {
        finalizeHiddenRun();
        const groupId = `group:${traceId}:${collapsedGroupId}`;
        nodeProjectionById.set(node.id, groupId);
        const projectedGroup = groupNodesById.get(groupId);
        if (projectedGroup) {
          this.addNodeToCollapsed(projectedGroup, node);
        } else {
          const groupNode = nodeById.get(collapsedGroupId) ?? node;
          const nextGroup: ProjectedCollapsedGroupNode = {
            kind: "group",
            id: groupId,
            groupId: collapsedGroupId,
            label: groupNode.name || groupNode.startMessage || groupNode.nodeType,
            layer: groupNode.layer ?? null,
            hiddenNodeCount: 1,
            hiddenEdgeCount: 0,
            childGroupCount: childGroupCountById.get(collapsedGroupId) ?? 0,
            startedAt: node.startedAt,
            endedAt: node.endedAt,
            flowOrderStart: node.flowOrder,
            flowOrderEnd: node.flowOrder,
          };
          projectedNodes.push(nextGroup);
          groupNodesById.set(groupId, nextGroup);
        }
        continue;
      }

      if (node.importanceLevel <= threshold) {
        finalizeHiddenRun();
        projectedNodes.push({
          kind: "normal",
          id: node.id,
          nodeType: node.nodeType,
          data: node.data,
          name: node.name,
          startedAt: node.startedAt,
          endedAt: node.endedAt,
          originalStartedAt: node.originalStartedAt,
          clockSkewMs: node.clockSkewMs,
          importanceLevel: node.importanceLevel,
          flowOrder: node.flowOrder,
          materializedAt: node.materializedAt,
          startMessage: node.startMessage,
          groupParentId: node.groupParentId ?? null,
          layer: node.layer ?? null,
          childGroupCount: childGroupCountById.get(node.id) ?? 0,
        });
        nodeProjectionById.set(node.id, node.id);
      } else {
        currentHiddenRun.push(node);
      }
    }
    finalizeHiddenRun();

    // 2. Edge snapping and aggregation
    let omittedEdgeCount = 0;
    const aggregateEdges = new Map<string, ProjectedFlowEdge>();

    for (const edge of edges) {
      const projectedFromId = nodeProjectionById.get(edge.fromNodeId);
      const projectedToId = nodeProjectionById.get(edge.toNodeId);

      // Edge has source or target outside the loaded scope (due to paging/caps)
      if (!projectedFromId || !projectedToId) {
        omittedEdgeCount++;
        continue;
      }

      // Edge is fully contained within one collapsed placeholder.
      if (projectedFromId === projectedToId) {
        const collapsed = ghostNodesById.get(projectedFromId)
          ?? groupNodesById.get(projectedFromId)
          ?? layerNodesById.get(projectedFromId);
        if (collapsed) {
          collapsed.hiddenEdgeCount++;
          continue;
        }
      }

      if (projectedFromId === projectedToId) {
        continue;
      }

      // Consolidate parallel edges mapping between the same node structures
      const aggregateKey = `${projectedFromId}|${projectedToId}|${edge.edgeType}`;
      const existing = aggregateEdges.get(aggregateKey);

      if (existing) {
        existing.edgeCount++;
        existing.startedAt = Math.min(existing.startedAt, edge.startedAt);
        existing.originalStartedAt = Math.min(existing.originalStartedAt, edge.originalStartedAt);
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
          originalStartedAt: edge.originalStartedAt,
          clockSkewMs: edge.clockSkewMs,
        });
      }
    }

    const projectedEdges = Array.from(aggregateEdges.values());

    // Calculate maximum materializedAt timestamp to return fresh cache hints
    let maxMaterializedAt = 0;
    for (const node of nodes) {
      maxMaterializedAt = Math.max(maxMaterializedAt, node.materializedAt);
    }
    for (const edge of edges) {
      maxMaterializedAt = Math.max(maxMaterializedAt, edge.materializedAt);
    }

    const visibleNodeCount = projectedNodes.filter(n => n.kind === "normal").length;
    const ghostNodeCount = projectedNodes.filter(n => n.kind === "ghost").length;
    const collapsedGroupCount = projectedNodes.filter(n => n.kind === "group").length;
    const collapsedLayerCount = projectedNodes.filter(n => n.kind === "layer").length;

    return {
      nodes: projectedNodes,
      edges: projectedEdges,
      metadata: {
        threshold,
        returnedNodeCount: projectedNodes.length,
        returnedEdgeCount: projectedEdges.length,
        visibleNodeCount,
        ghostNodeCount,
        collapsedGroupCount,
        collapsedLayerCount,
        materializedAt: maxMaterializedAt,
        nodeCap,
        edgeCap,
        omittedEdgeCount,
        paging: {
          nextCursor: null,
          previousCursor: null,
          hasAfter: false,
          hasBefore: false,
          totalNodeCount: 0,
          fromFlowOrder: 0,
          toFlowOrder: 0,
        },
      },
    };
  }

  private buildChildGroupCounts(nodes: ReadNode[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      if (!node.groupParentId) continue;
      counts.set(node.groupParentId, (counts.get(node.groupParentId) ?? 0) + 1);
    }
    return counts;
  }

  private findCollapsedGroupId(
    node: ReadNode,
    nodeById: Map<string, ReadNode>,
    collapsedGroupSet: Set<string>,
  ): string | null {
    let current: ReadNode | undefined = node;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (collapsedGroupSet.has(current.id)) return current.id;
      current = current.groupParentId ? nodeById.get(current.groupParentId) : undefined;
    }
    return null;
  }

  private addNodeToCollapsed(
    collapsed: ProjectedCollapsedGroupNode | ProjectedCollapsedLayerNode,
    node: ReadNode,
  ): void {
    collapsed.hiddenNodeCount++;
    collapsed.startedAt = Math.min(collapsed.startedAt, node.startedAt);
    collapsed.flowOrderStart = Math.min(collapsed.flowOrderStart, node.flowOrder);
    collapsed.flowOrderEnd = Math.max(collapsed.flowOrderEnd, node.flowOrder);
    if (node.endedAt !== null) {
      collapsed.endedAt = Math.max(collapsed.endedAt ?? -Infinity, node.endedAt);
    }
  }
}
