export type JsonValue = unknown;

export type TraceContainer = {
  id: string;
  traceId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  createdAtLocal: Date;
  createdAtRemote: Date;
};

export type TraceBlock = {
  id: string;
  traceId: string;
  containerId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
};

export type TraceNode = {
  id: string;
  traceId: string;
  blockId: string;
  name: string;
  type: string;
  metadata?: JsonValue;
  eventType: "started" | "ended";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceEdge = {
  id: string;
  traceId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  metadata?: JsonValue;
  eventType: "requested" | "responded";
  eventAtLocal: Date;
  ingestedAtRemote: Date;
};

export type TraceContainerInput = Omit<TraceContainer, "createdAtRemote">;
export type TraceBlockInput = TraceBlock;
export type TraceNodeInput = Omit<TraceNode, "ingestedAtRemote">;
export type TraceEdgeInput = Omit<TraceEdge, "ingestedAtRemote">;

/**
 * Represents a pre-computed layout Block on the read path.
 * A Block represents a structural vertical boundary/function scope.
 */
export type ReadBlock = {
  /** Unique identifier of the block (maps to raw TraceBlock.id) */
  id: string;
  /** Globally unique trace identifier */
  traceId: string;
  /** Containing physical container or service ID */
  containerId: string;
  /** ID of the parent block calling this block (empty if root block) */
  parentBlockId: string;
  /** Specific calling Node ID inside the parent block that triggered this block */
  callingNodeId: string;
  /** Human-readable name of the function call scope (e.g. 'foo()') */
  name: string;
  /** Type of scope (e.g. 'function', 'method', 'rpc') */
  type: string;
  /** Horizontal coordinate offset (X-depth): 0 = root, 1 = nested child call, etc. */
  absoluteDepth: number;
  /** Earliest start timestamp derived from child nodes (in microseconds) */
  startTimeUs: number;
  /** Total execution duration of the block (in microseconds), null if never ended */
  durationUs: number | null;
  /** Custom JSON baggage/metadata properties */
  metadata?: JsonValue;
};

/**
 * Represents an operational step or log checkpoint inside a specific Block.
 * These flow vertically inside a Block card.
 */
export type ReadNode = {
  /** Unique identifier of the node (maps to raw TraceNode.id) */
  id: string;
  /** Globally unique trace identifier */
  traceId: string;
  /** Containing Block ID */
  blockId: string;
  /** Human-readable node name or log description */
  name: string;
  /** Type of checkpoint (e.g. 'db', 'http_client', 'step', 'log') */
  type: string;
  /** Verbosity/importance zoom level: 0 = critical, 1 = key, 2 = detailed logs */
  zoomLevel: number;
  /** Vertical sequence index (Y-coordinate flow) inside the containing block */
  localSequence: number;
  /** Time of started event (in microseconds) */
  startTimeUs: number;
  /** Elapsed execution time (in microseconds), null for simple point logs */
  durationUs: number | null;
  /** Custom JSON baggage/metadata properties */
  metadata?: JsonValue;
};

/**
 * Represents a horizontal connecting jump wire (edge) linking two Blocks on the UI.
 */
export type ReadEdge = {
  /** Unique row ID (composed of edgeId + zoomLevel) */
  id: string;
  /** Unique identifier of the edge (maps to raw TraceEdge.id) */
  edgeId: string;
  /** Globally unique trace identifier */
  traceId: string;
  /** Source block ID containing the calling node */
  fromBlockId: string;
  /** Exact calling Node ID that dispatched the call */
  fromNodeId: string;
  /** Destination block ID receiving the call */
  toBlockId: string;
  /** Exact entry Node ID that accepted the call */
  toNodeId: string;
};

/**
 * Metadata caching the zoom capabilities and completion status of a trace.
 */
export type TraceMetadata = {
  /** Globally unique trace identifier */
  traceId: string;
  /** Ingress materialization status: 1 = zoom layout is built and ready, 0 = processing */
  isZoomReady: boolean;
  /** Maximum structural call-depth resolved (used to size the UI zoom slider dynamically) */
  maxAvailableDepth: number;
  /** Tracks completed offset index in materialization broker queue */
  materializedOffset: number;
};


