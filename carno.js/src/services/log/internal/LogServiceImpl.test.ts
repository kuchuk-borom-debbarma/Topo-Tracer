import { describe, expect, it } from "bun:test";
import { LogServiceImpl } from "./LogServiceImpl";
import { LogRepo } from "./LogRepo";
import type { TraceSpan, TraceEdge, ReadSpan, ReadEdge } from "../types";

class TestRepo extends LogRepo {
  spans: TraceSpan[] = [];
  edges: TraceEdge[] = [];

  readSpans: ReadSpan[] = [];
  readEdges: ReadEdge[] = [];
  traceMeta: { levelNames: Record<number, string>; layoutJson: string } | null = null;

  override async saveSpans(spans: TraceSpan[]): Promise<void> {
    this.spans.push(...spans);
  }

  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    this.edges.push(...edges);
  }

  override async fetchReadTraceMeta(traceId: string): Promise<{ levelNames: Record<number, string>; layoutJson: string } | null> {
    return this.traceMeta;
  }

  override async fetchReadSpans(traceId: string): Promise<ReadSpan[]> {
    return this.readSpans;
  }

  override async fetchReadEdges(traceId: string): Promise<ReadEdge[]> {
    return this.readEdges;
  }
}

describe("LogServiceImpl V4 Unified Spans", () => {
  it("enriches spans and edges with date timestamps", async () => {
    const repo = new TestRepo();
    const service = new LogServiceImpl(repo);

    await service.logSpans([
      {
        id: "span_1",
        traceId: "trace_a",
        parentId: null,
        name: "RootService",
        kind: "boundary",
        type: "service",
        tags: { env: "prod" },
        eventType: "started",
        timestamp: 1000,
        levelNames: { 0: "Root", 1: "API" },
      },
    ]);

    await service.logEdges([
      {
        id: "edge_1",
        traceId: "trace_a",
        fromSpanId: "span_1",
        toSpanId: "span_2",
        type: "http_request",
        timestamp: 2000,
      },
    ]);

    expect(repo.spans[0]?.timestamp).toEqual(new Date(1000));
    expect(repo.spans[0]?.levelNames).toEqual({ 0: "Root", 1: "API" });
    expect(repo.edges[0]?.timestamp).toEqual(new Date(2000));
  });

  it("handles dynamic view-level filtering, ancestry snapping, and Ghost Spans", async () => {
    const repo = new TestRepo();
    const service = new LogServiceImpl(repo);

    // Setup mock pre-calculated trace layout in repository
    const mockSpans: ReadSpan[] = [
      {
        id: "api",
        traceId: "t1",
        parentId: null,
        name: "OrderService",
        kind: "boundary",
        type: "service",
        tags: {},
        parentage: ["api"],
        viewLevel: 0,
        localSequence: 0,
        startTimeUs: 1000,
        durationUs: 5000,
      },
      {
        id: "checkout",
        traceId: "t1",
        parentId: "api",
        name: "checkout",
        kind: "execution",
        type: "function",
        tags: {},
        parentage: ["api", "checkout"],
        viewLevel: 1,
        localSequence: 0,
        startTimeUs: 1500,
        durationUs: 3000,
      },
      {
        id: "validate",
        traceId: "t1",
        parentId: "checkout",
        name: "validate_card",
        kind: "execution",
        type: "function",
        tags: {},
        parentage: ["api", "checkout", "validate"],
        viewLevel: 2,
        localSequence: 0,
        startTimeUs: 2000,
        durationUs: 1000,
      },
      {
        id: "kafka",
        traceId: "t1",
        parentId: "checkout",
        name: "Kafka",
        kind: "boundary",
        type: "queue",
        tags: {},
        parentage: ["api", "checkout", "kafka"],
        viewLevel: 0, // Hoisted to Level 0!
        localSequence: 1,
        startTimeUs: 3500,
        durationUs: 500,
      },
    ];

    const mockEdges: ReadEdge[] = [
      {
        id: "e1",
        traceId: "t1",
        fromSpanId: "validate", // Level 2
        toSpanId: "kafka",    // Level 0
        type: "kafka_message",
        distance: 2,
      },
    ];

    repo.traceMeta = {
      levelNames: { 0: "Service Map", 1: "Routes", 2: "Deep Logic" },
      layoutJson: JSON.stringify({ spans: mockSpans, edges: mockEdges }),
    };

    // Query trace layout with maxLevel = 1 (filters out 'validate' Level 2)
    const response = await service.getTraceLayout("t1", 1);

    expect(response).not.toBeNull();
    if (response) {
      // 1. Spans check
      expect(response.spans.length).toEqual(3); // api, checkout, kafka remain. validate is hidden.
      expect(response.spans.some(s => s.id === "validate")).toBe(false);

      // 2. Snapped Edges check
      expect(response.edges.length).toEqual(1);
      // 'validate' snapped up to 'checkout' (Level 1)
      expect(response.edges[0].fromSpanId).toEqual("checkout");
      expect(response.edges[0].toSpanId).toEqual("kafka");

      // 3. Ghost Spans check
      expect(response.ghostSpans.length).toEqual(1);
      const ghost = response.ghostSpans[0];
      expect(ghost.fromSpanId).toEqual("checkout");
      expect(ghost.toSpanId).toEqual("kafka");
      expect(ghost.hiddenCount).toEqual(1);
      expect(ghost.truncatedLineage).toEqual(["validate_card (L2)"]);
      expect(ghost.durationUs).toEqual(1000);
      expect(ghost.startTimeUs).toEqual(2000);
    }
  });
});
