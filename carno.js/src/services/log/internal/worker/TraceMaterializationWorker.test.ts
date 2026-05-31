import { describe, expect, it } from "bun:test";
import { TraceMaterializationWorker } from "./TraceMaterializationWorker";
import { LogServiceImpl } from "../LogServiceImpl";
import { LogRepo } from "../LogRepo";
import type {
  TraceSpan,
  TraceEdge,
  ReadSpan,
  ReadEdge,
} from "../../types";

class MockRepo extends LogRepo {
  rawSpans: TraceSpan[] = [];
  rawEdges: TraceEdge[] = [];

  readSpans: ReadSpan[] = [];
  readEdges: ReadEdge[] = [];
  traceMetadata: { levelNames: Record<number, string>; layoutJson: string } | null = null;
  readTraces: any[] = [];

  override async saveSpans(spans: TraceSpan[]): Promise<void> {
    this.rawSpans.push(...spans);
  }
  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    this.rawEdges.push(...edges);
  }

  override async fetchSpans(traceId: string): Promise<TraceSpan[]> {
    return this.rawSpans.filter(s => s.traceId === traceId);
  }
  override async fetchRawEdges(traceId: string): Promise<TraceEdge[]> {
    return this.rawEdges.filter(e => e.traceId === traceId);
  }

  override async saveReadSpans(spans: ReadSpan[]): Promise<void> {
    this.readSpans.push(...spans);
  }
  override async saveReadEdges(edges: ReadEdge[]): Promise<void> {
    this.readEdges.push(...edges);
  }
  override async saveReadTrace(trace: any): Promise<void> {
    this.traceMetadata = { levelNames: trace.levelNames, layoutJson: trace.layoutJson };
    this.readTraces.push(trace);
  }

  override async fetchReadTraceMeta(traceId: string): Promise<{ levelNames: Record<number, string>; layoutJson: string } | null> {
    return this.traceMetadata;
  }
}

describe("V4 Telemetry compilation and read path integration", () => {
  it("compiles unified nested Spans and generates pre-calculated layout JSON strings", async () => {
    const repo = new MockRepo();
    const service = new LogServiceImpl(repo);
    const worker = new TraceMaterializationWorker(repo);

    const traceId = "t4";

    // 1. Ingest spans via service
    await service.logSpans([
      {
        id: "span_service",
        traceId,
        parentId: null,
        name: "OrderService",
        kind: "boundary",
        type: "service",
        tags: { env: "prod" },
        eventType: "started",
        timestamp: 1000,
        levelNames: { 0: "Service Column", 1: "Major Flows", 2: "Deep Code" },
      },
      {
        id: "span_checkout",
        traceId,
        parentId: "span_service",
        name: "ProcessCheckout",
        kind: "execution",
        type: "function",
        tags: { endpoint: "/checkout" },
        eventType: "started",
        timestamp: 1500,
      },
      {
        id: "span_checkout",
        traceId,
        parentId: "span_service",
        name: "ProcessCheckout",
        kind: "execution",
        type: "function",
        tags: {},
        eventType: "ended",
        timestamp: 4500,
      },
      {
        id: "span_service",
        traceId,
        parentId: null,
        name: "OrderService",
        kind: "boundary",
        type: "service",
        tags: {},
        eventType: "ended",
        timestamp: 5000,
      },
    ]);

    // 2. Ingest connection edge representing network crossing
    await service.logEdges([
      {
        id: "edge_flow",
        traceId,
        fromSpanId: "span_service",
        toSpanId: "span_checkout",
        type: "flow",
        timestamp: 1200,
      },
    ]);

    // 3. Run the V4 materializer compiler manually
    await worker.materialize(traceId);

    // Verify raw Spans mapping in repository storage
    expect(repo.readSpans.length).toBe(2);
    const readService = repo.readSpans.find(s => s.id === "span_service")!;
    const readCheckout = repo.readSpans.find(s => s.id === "span_checkout")!;

    expect(readService.name).toBe("OrderService");
    expect(readService.kind).toBe("boundary");
    expect(readService.startTimeUs).toBe(1000 * 1000);
    expect(readService.durationUs).toBe(4000 * 1000); // 5000 - 1000
    expect(readService.parentage).toEqual(["span_service"]);
    expect(readService.tags).toEqual({ env: "prod" });

    expect(readCheckout.name).toBe("ProcessCheckout");
    expect(readCheckout.kind).toBe("execution");
    expect(readCheckout.startTimeUs).toBe(1500 * 1000);
    expect(readCheckout.durationUs).toBe(3000 * 1000); // 4500 - 1500
    expect(readCheckout.parentage).toEqual(["span_service", "span_checkout"]);

    // Verify Compiled cached Layout JSON
    expect(repo.traceMetadata).not.toBeNull();
    if (repo.traceMetadata) {
      expect(repo.traceMetadata.levelNames).toEqual({ 0: "Service Column", 1: "Major Flows", 2: "Deep Code" });

      const parsedLayout = JSON.parse(repo.traceMetadata.layoutJson);
      expect(parsedLayout.spans.length).toBe(2);
      expect(parsedLayout.edges.length).toBe(1);
    }
  });
});
