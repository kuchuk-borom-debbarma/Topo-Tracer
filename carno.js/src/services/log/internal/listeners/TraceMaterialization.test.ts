import { describe, expect, it } from "bun:test";
import { TraceNodeResolver } from "./operators/TraceNodeResolver";
import { TraceEdgeResolver } from "./operators/TraceEdgeResolver";
import { TraceClosureBuilder } from "./operators/TraceClosureBuilder";
import type { ClickHouseService } from "../../../../infra/ClickHouseService";
import type { MessageBroker } from "../../../../infra/message/MessageBroker";

class MockClickHouseClient {
  queriesRan: { query: string; query_params: any }[] = [];
  insertedRows: { table: string; values: any[] }[] = [];

  mockedNodesData: any[] = [];
  mockedAncestryData: any[] = [];
  mockedEdgeAncestryData: any[] = [];
  mockedEdgesData: any[] = [];

  async query(options: { query: string; query_params: any; format: string }): Promise<any> {
    this.queriesRan.push({ query: options.query, query_params: options.query_params });
    let data: any[] = [];

    if (options.query.includes("toco_tracer.node_ancestry")) {
      data = this.mockedAncestryData;
    } else if (options.query.includes("toco_tracer.edge_egress_ancestry")) {
      data = this.mockedEdgeAncestryData;
    } else if (options.query.includes("toco_tracer.edges")) {
      data = this.mockedEdgesData;
    } else if (options.query.includes("toco_tracer.nodes")) {
      data = this.mockedNodesData;
    }

    return {
      json: async () => ({ data })
    };
  }

  async insert(options: { table: string; values: any[]; format: string }): Promise<any> {
    this.insertedRows.push({ table: options.table, values: options.values });
    return {};
  }
}

class MockMessageBroker {
  published: { topic: string; key: string; payload: any }[] = [];

  async publish(options: { topic: string; key: string; payload: any }): Promise<void> {
    this.published.push(options);
  }
}

describe("Trace Materialization Engine - Operator Tests", () => {
  it("TraceNodeResolver - should build ancestry paths using db-backed ReplacingMergeTree lookup and insert them", async () => {
    const mockClient = new MockClickHouseClient();
    const mockBroker = new MockMessageBroker();
    const clickHouse = { client: mockClient as any } as ClickHouseService;
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceNodeResolver(clickHouse, broker);

    // Mock nodes in this batch: Node B depends on Parent Node A (A was processed previously and is in database)
    mockClient.mockedNodesData = [
      {
        id: "node_B",
        trace_id: "trace_1",
        parentNodeId: "node_A",
        depthIndex: 1
      }
    ];

    // Mock parent's path already present in node_ancestry cache table
    mockClient.mockedAncestryData = [
      {
        node_id: "node_A",
        ancestryPath: ["node_A"]
      }
    ];

    await resolver.resolve("trace_1", 0, {}, 0, 1);

    // Verify query to node_ancestry table
    const ancestryQuery = mockClient.queriesRan.find(q => q.query.includes("toco_tracer.node_ancestry"));
    expect(ancestryQuery).toBeDefined();
    expect(ancestryQuery?.query_params.parentIds).toEqual(["node_A"]);

    // Verify insertion to node_ancestry
    const ancestryInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.node_ancestry");
    expect(ancestryInsert).toBeDefined();
    expect(ancestryInsert?.values[0].node_id).toBe("node_B");
    expect(ancestryInsert?.values[0].ancestryPath).toEqual(["node_A", "node_B"]);

    // Verify metadata was updated
    const metaInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.trace_metadata");
    expect(metaInsert).toBeDefined();
    expect(metaInsert?.values[0].max_available_depth).toBe(1);

    // Verify next stage (RESOLVE_EDGES) was triggered
    expect(mockBroker.published.length).toBe(1);
    expect(mockBroker.published[0].payload.stage).toBe("RESOLVE_EDGES");
  });

  it("TraceEdgeResolver - should resolve edge egress paths by querying node_ancestry and inserting to edge_egress_ancestry", async () => {
    const mockClient = new MockClickHouseClient();
    const mockBroker = new MockMessageBroker();
    const clickHouse = { client: mockClient as any } as ClickHouseService;
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceEdgeResolver(clickHouse, broker);

    // Mock edges in batch
    mockClient.mockedEdgesData = [
      {
        id: "edge_1",
        fromNodeId: "node_B",
        toNodeId: "node_C",
        fromContainerId: "con_1",
        toContainerId: "con_2"
      }
    ];

    // Mock parent's ancestry path in cache table
    mockClient.mockedAncestryData = [
      {
        node_id: "node_B",
        ancestryPath: ["node_A", "node_B"]
      }
    ];

    await resolver.resolve("trace_1", 0, {}, 1, 1);

    // Verify queried node ancestry for the edge fromNodeId
    const ancestryQuery = mockClient.queriesRan.find(q => q.query.includes("toco_tracer.node_ancestry"));
    expect(ancestryQuery).toBeDefined();
    expect(ancestryQuery?.query_params.nodeIds).toEqual(["node_B"]);

    // Verify insert into edge_egress_ancestry
    const egressInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.edge_egress_ancestry");
    expect(egressInsert).toBeDefined();
    expect(egressInsert?.values[0].edge_id).toBe("edge_1");
    expect(egressInsert?.values[0].egressAncestryPath).toEqual(["node_A", "node_B"]);

    // Verify transition to stage BUILD_CLOSURES
    expect(mockBroker.published.length).toBe(1);
    expect(mockBroker.published[0].payload.stage).toBe("BUILD_CLOSURES");
  });

  it("TraceClosureBuilder - should fetch egress ancestry paths and write snapped visual wires to read_edges", async () => {
    const mockClient = new MockClickHouseClient();
    const mockBroker = new MockMessageBroker();
    const clickHouse = { client: mockClient as any } as ClickHouseService;
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceClosureBuilder(clickHouse, broker);

    // Mock edge
    mockClient.mockedEdgesData = [
      {
        id: "edge_1",
        fromNodeId: "node_B",
        toNodeId: "node_C",
        fromContainerId: "con_1",
        toContainerId: "con_2"
      }
    ];

    // Mock edge egress path
    mockClient.mockedEdgeAncestryData = [
      {
        edge_id: "edge_1",
        egressAncestryPath: ["node_A", "node_B"]
      }
    ];

    await resolver.resolve("trace_1", 0, {}, 2, 1);

    // Verify query to edge_egress_ancestry
    const egressQuery = mockClient.queriesRan.find(q => q.query.includes("toco_tracer.edge_egress_ancestry"));
    expect(egressQuery).toBeDefined();
    expect(egressQuery?.query_params.edgeIds).toEqual(["edge_1"]);

    // Verify read_edges snaps inserted
    const wiresInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.read_edges");
    expect(wiresInsert).toBeDefined();
    
    // We expect wires generated for visual_depth = 0, 1, 2
    expect(wiresInsert?.values.length).toBe(3);

    // Depth 0: snaps to container
    expect(wiresInsert?.values[0].visual_depth).toBe(0);
    expect(wiresInsert?.values[0].from_target_id).toBe("con_1");
    expect(wiresInsert?.values[0].from_target_type).toBe("container");

    // Depth 1: snaps to node_B (egress path index 1 is node_B)
    expect(wiresInsert?.values[1].visual_depth).toBe(1);
    expect(wiresInsert?.values[1].from_target_id).toBe("node_B");
    expect(wiresInsert?.values[1].from_target_type).toBe("node");

    // Depth 2: snaps to node_B
    expect(wiresInsert?.values[2].visual_depth).toBe(2);
    expect(wiresInsert?.values[2].from_target_id).toBe("node_B");
    expect(wiresInsert?.values[2].from_target_type).toBe("node");
  });
});
