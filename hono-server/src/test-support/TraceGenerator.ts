import type { ReadNode, ReadEdge } from "../services/log/api/types";
import type { NodeEventRow, EdgeEventRow } from "../services/log/internal/repo/types";

export class TraceGenerator {
  constructor(private userId: string, private traceId: string) {}

  private createDefaultData(): Record<string, string> {
    return {
      key1: "value1",
      key2: "value2",
      key3: "value3",
      key4: "value4",
      key5: "value5",
    };
  }

  generateRawChain(length: number, startTs: number): { nodeEvents: NodeEventRow[]; edgeEvents: EdgeEventRow[] } {
    const nodeEvents: NodeEventRow[] = [];
    const edgeEvents: EdgeEventRow[] = [];

    for (let i = 0; i < length; i++) {
      const nodeId = `node-${i}`;
      // Node Start
      nodeEvents.push({
        id: nodeId,
        user_id: this.userId,
        trace_id: this.traceId,
        event_type: 0,
        started_at_ms: startTs + i * 10,
        ended_at_ms: null,
        node_type: "step",
        data: this.createDefaultData(),
        message: `Start ${i}`,
        importance_level: 1,
      });
      // Node End
      nodeEvents.push({
        id: nodeId,
        user_id: this.userId,
        trace_id: this.traceId,
        event_type: 1,
        started_at_ms: null,
        ended_at_ms: startTs + i * 10 + 5,
        node_type: null,
        data: {},
        message: `End ${i}`,
        importance_level: null,
      });

      if (i > 0) {
        edgeEvents.push({
          id: `edge-${i - 1}-${i}`,
          user_id: this.userId,
          trace_id: this.traceId,
          event_type: 0,
          started_at_ms: startTs + i * 10,
          ended_at_ms: null,
          edge_type: "follows",
          from_node_id: `node-${i - 1}`,
          to_node_id: nodeId,
          data: {},
        });
      }
    }

    return { nodeEvents, edgeEvents };
  }

  generateRawFanOut(count: number, startTs: number): { nodeEvents: NodeEventRow[]; edgeEvents: EdgeEventRow[] } {
    const nodeEvents: NodeEventRow[] = [];
    const edgeEvents: EdgeEventRow[] = [];

    const parentId = "parent";
    // Parent Start
    nodeEvents.push({
      id: parentId,
      user_id: this.userId,
      trace_id: this.traceId,
      event_type: 0,
      started_at_ms: startTs,
      ended_at_ms: null,
      node_type: "parent",
      data: this.createDefaultData(),
      message: "Parent Start",
      importance_level: 1,
    });
    // Parent End
    nodeEvents.push({
      id: parentId,
      user_id: this.userId,
      trace_id: this.traceId,
      event_type: 1,
      started_at_ms: null,
      ended_at_ms: startTs + 1000,
      node_type: null,
      data: {},
      message: "Parent End",
      importance_level: null,
    });

    for (let i = 0; i < count; i++) {
      const childId = `child-${i}`;
      // Child Start
      nodeEvents.push({
        id: childId,
        user_id: this.userId,
        trace_id: this.traceId,
        event_type: 0,
        started_at_ms: startTs + 10 + i,
        ended_at_ms: null,
        node_type: "child",
        data: this.createDefaultData(),
        message: `Child Start ${i}`,
        importance_level: 1,
      });
      // Child End
      nodeEvents.push({
        id: childId,
        user_id: this.userId,
        trace_id: this.traceId,
        event_type: 1,
        started_at_ms: null,
        ended_at_ms: startTs + 20 + i,
        node_type: null,
        data: {},
        message: `Child End ${i}`,
        importance_level: null,
      });

      edgeEvents.push({
        id: `edge-p-${i}`,
        user_id: this.userId,
        trace_id: this.traceId,
        event_type: 0,
        started_at_ms: startTs + 10 + i,
        ended_at_ms: null,
        edge_type: "child",
        from_node_id: parentId,
        to_node_id: childId,
        data: {},
      });
    }

    return { nodeEvents, edgeEvents };
  }

  generateChain(length: number, startTs: number): { nodes: ReadNode[]; edges: ReadEdge[] } {
    const nodes: ReadNode[] = [];
    const edges: ReadEdge[] = [];

    for (let i = 0; i < length; i++) {
      const nodeId = `node-${i}`;
      nodes.push({
        id: nodeId,
        userId: this.userId,
        traceId: this.traceId,
        nodeType: "step",
        data: this.createDefaultData(),
        startedAt: startTs + i * 10,
        endedAt: startTs + i * 10 + 5,
        originalStartedAt: startTs + i * 10,
        clockSkewMs: 0,
        startMessage: `Start ${i}`,
        endMessage: `End ${i}`,
        importanceLevel: 1,
        flowOrder: 0,
        materializedAt: Date.now(),
      });

      if (i > 0) {
        edges.push({
          id: `edge-${i - 1}-${i}`,
          userId: this.userId,
          traceId: this.traceId,
          edgeType: "follows",
          fromNodeId: `node-${i - 1}`,
          toNodeId: nodeId,
          fromFlowOrder: 0,
          toFlowOrder: 0,
          data: {},
          startedAt: startTs + i * 10,
          endedAt: null,
          originalStartedAt: startTs + i * 10,
          clockSkewMs: 0,
          materializedAt: Date.now(),
        });
      }
    }

    return { nodes, edges };
  }

  generateFanOut(count: number, startTs: number): { nodes: ReadNode[]; edges: ReadEdge[] } {
    const nodes: ReadNode[] = [];
    const edges: ReadEdge[] = [];

    const parentId = "parent";
    nodes.push({
      id: parentId,
      userId: this.userId,
      traceId: this.traceId,
      nodeType: "parent",
      data: this.createDefaultData(),
      startedAt: startTs,
      endedAt: startTs + 1000,
      originalStartedAt: startTs,
      clockSkewMs: 0,
      startMessage: "Parent Start",
      endMessage: "Parent End",
      importanceLevel: 1,
      flowOrder: 0,
      materializedAt: Date.now(),
    });

    for (let i = 0; i < count; i++) {
      const childId = `child-${i}`;
      nodes.push({
        id: childId,
        userId: this.userId,
        traceId: this.traceId,
        nodeType: "child",
        data: this.createDefaultData(),
        startedAt: startTs + 10 + i,
        endedAt: startTs + 20 + i,
        originalStartedAt: startTs + 10 + i,
        clockSkewMs: 0,
        startMessage: `Child Start ${i}`,
        endMessage: `Child End ${i}`,
        importanceLevel: 1,
        flowOrder: 0,
        materializedAt: Date.now(),
      });

      edges.push({
        id: `edge-p-${i}`,
        userId: this.userId,
        traceId: this.traceId,
        edgeType: "child",
        fromNodeId: parentId,
        toNodeId: childId,
        fromFlowOrder: 0,
        toFlowOrder: 0,
        data: {},
        startedAt: startTs + 10 + i,
        endedAt: null,
        originalStartedAt: startTs + 10 + i,
        clockSkewMs: 0,
        materializedAt: Date.now(),
      });
    }

    return { nodes, edges };
  }

  injectSkew(nodes: ReadNode[], nodeIndex: number, driftMs: number) {
    if (nodes[nodeIndex]) {
      nodes[nodeIndex].startedAt += driftMs;
      nodes[nodeIndex].originalStartedAt = nodes[nodeIndex].startedAt;
      if (nodes[nodeIndex].endedAt !== null) {
        nodes[nodeIndex].endedAt += driftMs;
      }
    }
  }
}
