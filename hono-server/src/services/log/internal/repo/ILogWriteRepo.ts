import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
  IngestTraceStart,
} from "../../api/types";

/**
 * Interface contract for the Log Write Repository.
 * Following code-base.md guidelines:
 * - Kept under internal/repo to prevent leaking persistence schemas.
 * - Handles staging/inserting raw incoming telemetry events.
 */
export abstract class ILogWriteRepo {
  /**
   * Appends raw trace, node and edge events to the append-only event log.
   */
  abstract ingestNodesNEdges(data: {
    userId: string;
    traceStarts: IngestTraceStart[];
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;
}
