import { mock } from "bun:test";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { ReadCheckpoint } from "../../api/types";
import { Logger } from "tslog";

export class FakeReadRepo extends ILogReadRepo {
  loadCheckpoint = mock(async () => null as ReadCheckpoint | null) as any;
  loadLatestReadModel = mock(async () => ({ nodes: [], edges: [], summary: null })) as any;
  loadRawEventsAfterCheckpoint = mock(async () => ({ nodeEvents: [], edgeEvents: [] })) as any;
  loadTraceEventsAfterCheckpoint = mock(async () => []) as any;
  saveReadModel = mock(async () => {}) as any;
  saveCheckpoint = mock(async () => {}) as any;
  loadBoundedVisibleNodes = mock(async () => ({ items: [], totalCount: 0, hasMore: false })) as any;
  loadBoundedVisibleEdges = mock(async () => ({ edges: [], cap: { cap: 0, returnedCount: 0, capHit: false } })) as any;
  loadBoundedProjectionNodes = mock(async () => ({ items: [], totalCount: 0, hasMore: false })) as any;
  loadTraceSummary = mock(async () => null) as any;
  loadTraceSummaries = mock(async () => ({ items: [], totalCount: 0, hasMore: false })) as any;
}

export const mockLogger = {
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
  trace: mock(() => {}),
  getSubLogger: mock(() => mockLogger),
} as unknown as Logger<unknown>;

export const createCapturedLogger = (): {
  logger: Logger<unknown>;
  capturedLogs: { level: string; args: any[] }[];
} => {
  const capturedLogs: { level: string; args: any[] }[] = [];
  const logger = new Logger({ name: "TraceReadModelMaterializerTest", type: "hidden" });
  logger.attachTransport((logObj: any) => {
    const args: any[] = [];
    for (let i = 0; logObj[i] !== undefined; i++) {
      args.push(logObj[i]);
    }
    capturedLogs.push({
      level: logObj._meta.logLevelName,
      args,
    });
  });

  return { logger, capturedLogs };
};
