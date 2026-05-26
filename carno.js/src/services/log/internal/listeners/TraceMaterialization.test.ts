import { describe, expect, it } from "bun:test";
import { TraceNodeResolver } from "./operators/TraceNodeResolver";
import { TraceEdgeResolver } from "./operators/TraceEdgeResolver";
import { TraceClosureBuilder } from "./operators/TraceClosureBuilder";
import type { LogRepo } from "../LogRepo";
import type { MessageBroker } from "../../../../infra/message/MessageBroker";
import type { NodeMaterializationDTO, NodeAncestryRecord, EdgeMaterializationDTO, EdgeEgressAncestryRecord, TraceMetadataUpdate, TraceMetadataResult } from "../../types";

class MockLogRepo implements LogRepo {
  mockedNodesData: NodeMaterializationDTO[] = [];
  mockedAncestryData: NodeAncestryRecord[] = [];
  mockedEdgeAncestryData: EdgeEgressAncestryRecord[] = [];
  mockedEdgesData: EdgeMaterializationDTO[] = [];

  insertedRows: { table: string; values: any[] }[] = [];
  metadataUpdates: TraceMetadataUpdate[] = [];

  async saveContainer() {}
  async saveContainers() {}
  async saveNode() {}
  async saveNodes() {}
  async saveEdge() {}
  async saveEdges() {}
  async fetchTracePaginated(traceId: string, params: any): Promise<any> {
    return { nodes: [], edges: [], pagination: { prevTimeCursor: null, prevIdCursor: null, nextTimeCursor: null, nextIdCursor: null, hasPrev: false, hasNext: false }, isZoomReady: false, maxAvailableDepth: 0 };
  }

  async fetchTraceFull(traceId: string, depth?: number): Promise<any> {
    return { nodes: [], edges: [], isZoomReady: false, maxAvailableDepth: 0 };
  }

  async fetchTraceMetadata(traceId: string): Promise<TraceMetadataResult> { return { isZoomReady: false, maxAvailableDepth: 0 }; }

  async fetchNodesForMaterialization(traceId: string, limit: number, offset: number): Promise<NodeMaterializationDTO[]> {
    return this.mockedNodesData;
  }

  async fetchNodeAncestry(traceId: string, nodeIds: string[]): Promise<NodeAncestryRecord[]> {
    this.insertedRows.push({ table: "queries", values: [{ type: "fetchNodeAncestry" }] });
    return this.mockedAncestryData.filter(r => nodeIds.includes(r.node_id));
  }

  async fetchNodesByIds(traceId: string, nodeIds: string[]): Promise<NodeMaterializationDTO[]> {
    this.insertedRows.push({ table: "queries", values: [{ type: "fetchNodesByIds" }] });
    return this.mockedNodesData.filter(n => nodeIds.includes(n.id));
  }

  async saveNodeAncestryBatch(traceId: string, records: NodeAncestryRecord[]): Promise<void> {
    this.insertedRows.push({ table: "toco_tracer.node_ancestry", values: records });
  }

  async fetchEdgesForMaterialization(traceId: string, limit: number, offset: number): Promise<EdgeMaterializationDTO[]> {
    return this.mockedEdgesData;
  }

  async saveEdgeEgressAncestryBatch(traceId: string, records: EdgeEgressAncestryRecord[]): Promise<void> {
    this.insertedRows.push({ table: "toco_tracer.edge_egress_ancestry", values: records });
  }

  async fetchEdgeEgressAncestry(traceId: string, edgeIds: string[]): Promise<EdgeEgressAncestryRecord[]> {
    return this.mockedEdgeAncestryData.filter(r => edgeIds.includes(r.edge_id));
  }

  async saveVisualWiresBatch(traceId: string, wires: any[]): Promise<void> {
    this.insertedRows.push({ table: "toco_tracer.read_edges", values: wires });
  }

  async updateTraceMaterializationMetadata(traceId: string, updates: TraceMetadataUpdate): Promise<void> {
    this.metadataUpdates.push(updates);
    this.insertedRows.push({ table: "toco_tracer.trace_metadata", values: [updates] });
  }
}

class MockMessageBroker {
  published: { topic: string; key: string; payload: any }[] = [];
  async publish(options: { topic: string; key: string; payload: any }): Promise<void> {
    this.published.push(options);
  }
}

describe("Trace Materialization Engine - Operator Tests", () => {
  it("TraceNodeResolver - should build ancestry paths using db-backed ancestry lookup and insert them", async () => {
    const mockRepo = new MockLogRepo();
    const mockBroker = new MockMessageBroker();
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceNodeResolver(mockRepo, broker);

    mockRepo.mockedNodesData = [
      { id: "node_b", parentNodeId: "node_a", depthIndex: 0 },
      { id: "node_c", parentNodeId: "node_b", depthIndex: 0 }
    ];

    mockRepo.mockedAncestryData = [
      { node_id: "node_a", ancestryPath: ["node_root", "node_a"] }
    ];

    await resolver.resolve("trace_1", 0, 2, 1);

    const insertedAncestry = mockRepo.insertedRows.find(r => r.table === "toco_tracer.node_ancestry") as any;
    // @ts-ignore
    const nodeB_record = insertedAncestry.values.find((v: any) => v.node_id === "node_b");
    // @ts-ignore
    const nodeC_record = insertedAncestry.values.find((v: any) => v.node_id === "node_c");

    // @ts-ignore
    expect(nodeB_record.ancestryPath).toEqual(["node_root", "node_a", "node_b"]);
    // @ts-ignore
    expect(nodeC_record.ancestryPath).toEqual(["node_root", "node_a", "node_b", "node_c"]);
  });

  it("TraceNodeResolver - should resolve missing parents via upfront batch fallback fetch when not present in local batch or cache", async () => {
    const mockRepo = new MockLogRepo();
    const mockBroker = new MockMessageBroker();
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceNodeResolver(mockRepo, broker);

    mockRepo.mockedNodesData = [
      { id: "node_child", parentNodeId: "node_parent_1", depthIndex: 0 },
      { id: "node_parent_1", parentNodeId: "node_parent_2", depthIndex: 0 }
    ];

    await resolver.resolve("trace_2", 0, 0, 1);

    const insertedAncestry = mockRepo.insertedRows.find(r => r.table === "toco_tracer.node_ancestry") as any;
    // @ts-ignore
    const childRecord = insertedAncestry.values.find((v: any) => v.node_id === "node_child");
    // @ts-ignore
    expect(childRecord.ancestryPath).toEqual(["node_parent_2", "node_parent_1", "node_child"]);
  });

  it("TraceEdgeResolver - should resolve edge egress paths by querying node_ancestry and inserting to edge_egress_ancestry", async () => {
    const mockRepo = new MockLogRepo();
    const mockBroker = new MockMessageBroker();
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceEdgeResolver(mockRepo, broker);

    mockRepo.mockedEdgesData = [
      { id: "edge_1", fromNodeId: "node_b", toNodeId: "node_c", fromContainerId: "container_a", toContainerId: "container_b" }
    ];

    mockRepo.mockedAncestryData = [
      { node_id: "node_b", ancestryPath: ["node_root", "node_a", "node_b"] }
    ];

    await resolver.resolve("trace_1", 0, 3, 1);

    const insertedEdgeAncestry = mockRepo.insertedRows.find(r => r.table === "toco_tracer.edge_egress_ancestry") as any;
    // @ts-ignore
    const edge1_record = insertedEdgeAncestry.values.find((v: any) => v.edge_id === "edge_1");
    // @ts-ignore
    expect(edge1_record.egressAncestryPath).toEqual(["node_root", "node_a", "node_b"]);
  });

  it("TraceClosureBuilder - should fetch egress ancestry paths and write snapped visual wires to read_edges", async () => {
    const mockRepo = new MockLogRepo();
    const mockBroker = new MockMessageBroker();
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceClosureBuilder(mockRepo, broker);

    mockRepo.mockedEdgesData = [
      { id: "edge_1", fromNodeId: "node_b", toNodeId: "node_c", fromContainerId: "pod_front", toContainerId: "pod_back" }
    ];

    mockRepo.mockedEdgeAncestryData = [
      { edge_id: "edge_1", egressAncestryPath: ["node_root", "node_a", "node_b"] }
    ];

    await resolver.resolve("trace_1", 0, 2, 1);

    const insertedReadEdges = mockRepo.insertedRows.find(r => r.table === "toco_tracer.read_edges") as any;
    // @ts-ignore
    const depth0Wire = insertedReadEdges.values.find((v: any) => v.visual_depth === 0);
    // @ts-ignore
    const depth1Wire = insertedReadEdges.values.find((v: any) => v.visual_depth === 1);
    // @ts-ignore
    const depth2Wire = insertedReadEdges.values.find((v: any) => v.visual_depth === 2);

    // @ts-ignore
    expect(depth1Wire.from_target_id).toBe("node_root");
    // @ts-ignore
    expect(depth2Wire.from_target_id).toBe("node_a");
  });

  it("TraceClosureBuilder - should strictly enforce sparse inserts for very deep traces", async () => {
    const mockRepo = new MockLogRepo();
    const mockBroker = new MockMessageBroker();
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceClosureBuilder(mockRepo, broker);

    mockRepo.mockedEdgesData = [
      { id: "edge_deep", fromNodeId: "node_5", toNodeId: "node_c", fromContainerId: "pod_front", toContainerId: "pod_back" }
    ];

    mockRepo.mockedEdgeAncestryData = [
      { edge_id: "edge_deep", egressAncestryPath: ["node_1", "node_2", "node_3", "node_4", "node_5"] }
    ];

    await resolver.resolve("trace_deep", 0, 50, 1);

    const insertedReadEdges = mockRepo.insertedRows.find(r => r.table === "toco_tracer.read_edges") as any;
    // @ts-ignore
    expect(insertedReadEdges.values.length).toBe(6);
  });
});
