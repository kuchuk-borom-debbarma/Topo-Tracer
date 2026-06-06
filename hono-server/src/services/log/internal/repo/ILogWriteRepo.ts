import {
  IngestEdgeEnd,
  IngestEdgeStart,
  IngestNodeEnd,
  IngestNodeStart,
} from "../../api/types";

export abstract class ILogWriteRepo {
  abstract ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void>;
}
