/**
 * Internal diagnostics tracked during flowOrder sorting calculations.
 */
export type FlowOrderDiagnostics = {
  diagCycles: number;      // Count of detected cyclic loops in the trace
  diagOrphanEdges: number;  // Count of edges whose source or target node is missing
};

