import type { ReadNode, ReadEdge } from "../../api/types";
import type { FlowOrderDiagnostics } from "./types";

export function computeFlowOrder(params: {
  nodes: ReadNode[];
  edges: ReadEdge[];
}): {
  flowOrderByNodeId: Map<string, number>;
  diagnostics: FlowOrderDiagnostics;
} {
  const { nodes, edges } = params;
  const flowOrderByNodeId = new Map<string, number>();
  const diagnostics: FlowOrderDiagnostics = {
    diagCycles: 0,
    diagOrphanEdges: 0,
  };

  if (nodes.length === 0) {
    return { flowOrderByNodeId, diagnostics };
  }

  const nodeMap = new Map<string, ReadNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);

    if (!fromNode || !toNode) {
      diagnostics.diagOrphanEdges++;
      continue;
    }

    // Self-edges count as cycles
    if (edge.fromNodeId === edge.toNodeId) {
      diagnostics.diagCycles++;
    }

    adj.get(edge.fromNodeId)!.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) || 0) + 1);
  }

  const candidates: ReadNode[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) || 0) === 0) {
      candidates.push(node);
    }
  }

  // Sort candidates by startedAt, then id
  const sortNodes = (a: ReadNode, b: ReadNode) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt - b.startedAt;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  candidates.sort(sortNodes);

  let currentOrder = 0;
  const processed = new Set<string>();

  while (candidates.length > 0 || processed.size < nodes.length) {
    if (candidates.length === 0) {
      // Cycle detected
      diagnostics.diagCycles++;
      // Add all unprocessed nodes to candidates to continue
      for (const node of nodes) {
        if (!processed.has(node.id)) {
          candidates.push(node);
        }
      }
      candidates.sort(sortNodes);
    }

    const node = candidates.shift()!;
    if (processed.has(node.id)) continue;

    flowOrderByNodeId.set(node.id, currentOrder++);
    processed.add(node.id);

    const neighbors = adj.get(node.id) || [];
    for (const neighborId of neighbors) {
      const degree = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, degree);
      if (degree === 0) {
        const neighborNode = nodeMap.get(neighborId)!;
        // Insert into candidates while maintaining sort order
        let inserted = false;
        for (let i = 0; i < candidates.length; i++) {
          if (sortNodes(neighborNode, candidates[i]) < 0) {
            candidates.splice(i, 0, neighborNode);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          candidates.push(neighborNode);
        }
      }
    }
  }

  return { flowOrderByNodeId, diagnostics };
}
