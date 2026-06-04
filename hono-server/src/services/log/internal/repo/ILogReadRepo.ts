import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";
import { NodeEventRow, EdgeEventRow } from "./types";

export abstract class ILogReadRepo {
  abstract loadCheckpoint(params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null>;

  abstract loadLatestReadModel(params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }>;

  abstract loadRawEventsAfterCheckpoint(params: {
    userId: string;
    traceId: string;
    checkpoint: ReadCheckpoint | null;
  }): Promise<{
    nodeEvents: NodeEventRow[];
    edgeEvents: EdgeEventRow[];
  }>;

  abstract saveReadModel(params: {
    userId: string;
    traceId: string;
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
    materializedAt: number;
  }): Promise<void>;

  abstract saveCheckpoint(params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void>;
}
