import {
  ReadCheckpoint,
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
  BoundedVisibleNodesResult,
  BoundedVisibleEdgesResult,
} from "../../api/types";
import { NodeEventRow, EdgeEventRow } from "./types";

export const DEFAULT_PROJECTION_NODE_CAP = 500;
export const DEFAULT_PROJECTION_EDGE_CAP = 2000;

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

  abstract loadBoundedVisibleNodes(params: {
    userId: string;
    traceId: string;
    threshold: number;
  }): Promise<BoundedVisibleNodesResult>;

  abstract loadBoundedVisibleEdges(params: {
    userId: string;
    traceId: string;
    nodeIds: string[];
  }): Promise<BoundedVisibleEdgesResult>;
}
