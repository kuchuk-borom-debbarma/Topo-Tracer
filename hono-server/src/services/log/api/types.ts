/**
 * Raw Node Start event shape for telemetry ingestion.
 */
export type IngestNodeStart = {
  id: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startMessage?: string;
  startedAt: number; // UTC Milliseconds
  importanceLevel: number; // Used for projection filtering
};

/**
 * Raw Node End event shape for telemetry ingestion.
 */
export type IngestNodeEnd = {
  id: string;
  traceId: string;
  endedAt: number; // UTC Milliseconds
  endMessage?: string;
};

/**
 * Raw Edge Start event shape for telemetry ingestion.
 * Edges model the direct causal relationships in the trace flow.
 */
export type IngestEdgeStart = {
  id: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  data: Record<string, string>;
  startedAt: number; // UTC Milliseconds
};

/**
 * Raw Edge End event shape for telemetry ingestion.
 */
export type IngestEdgeEnd = {
  id: string;
  traceId: string;
  endedAt: number; // UTC Milliseconds
};

/**
 * Materialized Read-Optimized Node.
 * Reconstructed from NodeStart and NodeEnd events during trace materialization.
 */
export type ReadNode = {
  id: string;
  userId: string;
  traceId: string;
  nodeType: string;
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  startMessage: string | null;
  endMessage: string | null;
  importanceLevel: number;
  flowOrder: number; // Topological ordering index computed by materializer
  materializedAt: number; // Epoch timestamp of last reconstruction
};

/**
 * Materialized Read-Optimized Edge.
 * Reconstructed from EdgeStart and EdgeEnd events during trace materialization.
 */
export type ReadEdge = {
  id: string;
  userId: string;
  traceId: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  fromFlowOrder: number; // Cached source node topological order (for fast sorting)
  toFlowOrder: number;   // Cached target node topological order (for fast sorting)
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  materializedAt: number;
};

/**
 * Materialized Trace Summary metadata.
 * Aggregates statistics and structural/timing diagnostics for rapid index listing.
 */
export type ReadTraceSummary = {
  userId: string;
  traceId: string;
  nodeCount: number;
  edgeCount: number;
  minImportanceLevel: number;
  maxImportanceLevel: number;
  startedAt: number;
  endedAt: number | null;
  materializedAt: number;

  // Structural & telemetry sanity diagnostics
  diagMissingStarts: number;
  diagMissingEnds: number;
  diagNegativeDurations: number;
  diagCycles: number;
  diagOrphanEdges: number;
  diagInvalidImportance: number;
  diagClockSkew: number;
  diagLimitExceeded: number;
};

/**
 * Bounded trace index response for the authenticated user.
 */
export type TraceListResult = {
  traces: ReadTraceSummary[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

/**
 * Tracks the raw event offset processed for a given trace.
 * Enables incremental, resumeable materialization runs.
 */
export type ReadCheckpoint = {
  userId: string;
  traceId: string;

  // Exact raw node progress
  lastNodeEventTime: number;
  lastNodeEventId: string;
  lastNodeEventType: number;

  // Exact raw edge progress
  lastEdgeEventTime: number;
  lastEdgeEventId: string;
  lastEdgeEventType: number;

  checkpointedAt: number;
};

/**
 * Guard details to track database read limitations.
 * Ensures the server does not fetch excessive rows when projecting large traces.
 */
export type ProjectionReadCap = {
  cap: number;
  returnedCount: number;
  capHit: boolean; // Indicates if rows were truncated due to the safety ceiling
};

/**
 * Safe wrapper for querying visible nodes.
 */
export type BoundedVisibleNodesResult = {
  nodes: ReadNode[];
  cap: ProjectionReadCap;
};

/**
 * Safe wrapper for querying visible edges.
 */
export type BoundedVisibleEdgesResult = {
  edges: ReadEdge[];
  cap: ProjectionReadCap;
};

// --- Projected Flow structures ---

/**
 * A normal trace node included in the projected visualization window.
 */
export type ProjectedNormalNode = {
  kind: "normal";
  id: string;
  nodeType: string;
  data: Record<string, string>;
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
  importanceLevel: number;
  flowOrder: number;
  materializedAt: number;
};

/**
 * An aggregated pseudo-node ("Ghost") representing a subflow of hidden nodes
 * that did not meet the active importance threshold filter.
 */
export type ProjectedGhostNode = {
  kind: "ghost";
  id: string; // Deterministic ghost node ID
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
  nodeTypeCounts: Record<string, number>;
  minImportanceLevel: number;
  maxImportanceLevel: number;
  startedAt: number;
  endedAt: number | null;
  flowOrderStart: number; // Topological start bound of the collapsed group
  flowOrderEnd: number;   // Topological end bound of the collapsed group
};

/**
 * Union type representing visual nodes in the UI workspace.
 */
export type ProjectedFlowNode = ProjectedNormalNode | ProjectedGhostNode;

/**
 * Projected connection between nodes (either normal or ghosted).
 */
export type ProjectedFlowEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  edgeCount: number; // Aggregated edge count if connecting to/from ghost nodes
  startedAt: number;
  endedAt: number | null;
  originalStartedAt: number;
  clockSkewMs: number;
};

/**
 * Diagnostic and paging metadata regarding the flow projection.
 */
export type ProjectedFlowMetadata = {
  threshold: number;
  returnedNodeCount: number;
  returnedEdgeCount: number;
  visibleNodeCount: number;
  ghostNodeCount: number;
  materializedAt: number;
  nodeCap: ProjectionReadCap;
  edgeCap: ProjectionReadCap;
  omittedEdgeCount: number;
  paging: {
    nextCursor: string | null;
    previousCursor: string | null;
    hasAfter: boolean;
    hasBefore: boolean;
    totalNodeCount: number;
    fromFlowOrder: number;
    toFlowOrder: number;
  };
};

/**
 * Complete response structure representing the visible trace flow window.
 */
export type ProjectedFlowResult = {
  nodes: ProjectedFlowNode[];
  edges: ProjectedFlowEdge[];
  metadata: ProjectedFlowMetadata;
};

/**
 * Paging parameters for sliding-window exploration.
 */
export type PagingParams = {
  offset: number;
  limit: number;
};

/**
 * Generic wrapper for paged repository results.
 */
export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  hasMore: boolean;
};

/**
 * Helper container for projected raw node fetch.
 */
export type BoundedProjectionNodesResult = {
  nodes: ReadNode[];
  cap: ProjectionReadCap;
};
