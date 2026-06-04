import type { ReadNode, ReadEdge } from "../../api/types";
import type { FlowOrderDiagnostics } from "./types";

export function computeFlowOrder(params: {
  nodes: ReadNode[];
  edges: ReadEdge[];
}): {
  flowOrderByNodeId: Map<string, number>;
  diagnostics: FlowOrderDiagnostics;
} {
  return {
    flowOrderByNodeId: new Map(),
    diagnostics: {
      diagCycles: 0,
      diagOrphanEdges: 0,
    },
  };
}
