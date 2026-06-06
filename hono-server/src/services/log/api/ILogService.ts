import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
  ProjectedGraphResult,
} from "./types";

export abstract class ILogService {
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;

  abstract projectTraceGraph(data: {
    userId: string;
    traceId: string;
    threshold: number;
  }): Promise<ProjectedGraphResult>;
}
