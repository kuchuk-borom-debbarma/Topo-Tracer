import { Logger } from "tslog";
import { ILogReadRepo } from "./ILogReadRepo";
import { ILogWriteRepo } from "./ILogWriteRepo";
import { LogWriteRepoClickHouse } from "./impl/LogWriteRepoClickHouse";
import { ReadCheckpoint, ReadNode, ReadEdge, ReadTraceSummary } from "../../api/types";

class DevLogReadRepo extends ILogReadRepo {
  async loadCheckpoint(_params: {
    userId: string;
    traceId: string;
  }): Promise<ReadCheckpoint | null> {
    return null;
  }

  async loadLatestReadModel(_params: {
    userId: string;
    traceId: string;
  }): Promise<{
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary | null;
  }> {
    return { nodes: [], edges: [], summary: null };
  }

  async saveReadModel(_params: {
    userId: string;
    traceId: string;
    nodes: ReadNode[];
    edges: ReadEdge[];
    summary: ReadTraceSummary;
    materializedAt: number;
  }): Promise<void> {
    return;
  }

  async saveCheckpoint(_params: {
    checkpoint: ReadCheckpoint;
  }): Promise<void> {
    return;
  }
}

export const createLogWriteRepo = (
  parentLogger: Logger<unknown>,
): ILogWriteRepo => {
  return new LogWriteRepoClickHouse(parentLogger);
};

export const logReadRepo: ILogReadRepo = new DevLogReadRepo();
