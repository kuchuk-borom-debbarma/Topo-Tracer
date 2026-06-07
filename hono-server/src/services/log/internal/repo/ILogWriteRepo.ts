import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "../../api/types";

/**
 * Interface contract for the Log Write Repository.
 * Following code-base.md guidelines:
 * - Kept under internal/repo to prevent leaking persistence schemas.
 * - Handles staging/inserting raw incoming telemetry events.
 */
export abstract class ILogWriteRepo {
  /**
   * Appends raw node and edge events to the append-only event log.
   */
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;
}

