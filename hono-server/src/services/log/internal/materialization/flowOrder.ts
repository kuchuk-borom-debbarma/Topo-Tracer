import type { ReadNode, ReadEdge } from "../../api/types";
import type { FlowOrderDiagnostics } from "./types";

/**
 * Computes a deterministic topological order ("flowOrder") for trace nodes and detects graph cycles.
 * Uses a modified Kahn's algorithm:
 * 1. Computes node in-degrees based on incoming edges (ignoring orphan edges).
 * 2. Initializes candidates with in-degree = 0, sorted by startedAt (then ID).
 * 3. Iteratively processes candidates, decrementing neighbors' degrees.
 * 4. Resolves cycles by forcing remaining unprocessed nodes into candidates if candidates becomes empty.
 */
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

  // 1. Build adjacency list and in-degrees
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

  // 2. Identify root candidate nodes (in-degree = 0)
  const candidates: ReadNode[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) || 0) === 0) {
      candidates.push(node);
    }
  }

  // Sorting function to guarantee stable order based on start time
  const sortNodes = (a: ReadNode, b: ReadNode) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt - b.startedAt;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  candidates.sort(sortNodes);

  let currentOrder = 0;
  const processed = new Set<string>();

  // 3. Process candidate nodes sequentially
  while (candidates.length > 0 || processed.size < nodes.length) {
    if (candidates.length === 0) {
      // Graph cycle detected (unprocessed nodes remain but all have in-degree > 0)
      diagnostics.diagCycles++;
      // Break the cycle by forcing all unprocessed nodes to candidates
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

    // Decrement neighbor degrees and append newly-freed roots
    const neighbors = adj.get(node.id) || [];
    for (const neighborId of neighbors) {
      const degree = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, degree);
      if (degree === 0) {
        const neighborNode = nodeMap.get(neighborId)!;
        // Insert into candidates list maintaining sort order
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

