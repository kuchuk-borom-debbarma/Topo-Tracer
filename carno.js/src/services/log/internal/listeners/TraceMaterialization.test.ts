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
  it("TraceNodeResolver - should build ancestry paths using db-backed ancestry lookup and insert them", async () => {
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

    await resolver.resolve("trace_1", 0, 0, 1);

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

  it("TraceNodeResolver - should resolve missing parents via upfront batch fallback fetch when not present in local batch or cache", async () => {
    const mockClient = new MockClickHouseClient();
    const mockBroker = new MockMessageBroker();
    const clickHouse = { client: mockClient as any } as ClickHouseService;
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceNodeResolver(clickHouse, broker);

    // Mock nodes in this batch: Node C depends on Node B. 
    // Node B is NOT in the cache, and NOT in this batch.
    mockClient.mockedNodesData = [
      {
        id: "node_C",
        trace_id: "trace_2",
        parentNodeId: "node_B",
        depthIndex: 2
      }
    ];

    // Cache is empty
    mockClient.mockedAncestryData = [];

    // During the fallback batch fetch, the nodes table returns Node B which depends on Node A
    const originalQuery = mockClient.query.bind(mockClient);
    mockClient.query = async (options: any) => {
      // If it's the fallback fetch to nodes table
      if (options.query.includes("SELECT id, parentNodeId FROM toco_tracer.nodes")) {
        mockClient.queriesRan.push({ query: options.query, query_params: options.query_params });
        // Return Node B (which points to Node A) on first loop, and Node A on second loop
        if (options.query_params.missingIds.includes("node_B")) {
          return { json: async () => ({ data: [{ id: "node_B", parentNodeId: "node_A" }] }) };
        }
        if (options.query_params.missingIds.includes("node_A")) {
          return { json: async () => ({ data: [{ id: "node_A", parentNodeId: "" }] }) };
        }
      }
      return originalQuery(options);
    };

    await resolver.resolve("trace_2", 0, 0, 1);

    // Verify it fetched the missing parents from nodes table
    const fallbackQueries = mockClient.queriesRan.filter(q => q.query.includes("SELECT id, parentNodeId FROM toco_tracer.nodes"));
    expect(fallbackQueries.length).toBe(2); // One for node_B, one for node_A

    // Verify insertion to node_ancestry
    const ancestryInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.node_ancestry");
    expect(ancestryInsert).toBeDefined();
    expect(ancestryInsert?.values[0].node_id).toBe("node_C");
    // Resolved path should correctly span all the way up to A
    expect(ancestryInsert?.values[0].ancestryPath).toEqual(["node_A", "node_B", "node_C"]);
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

    await resolver.resolve("trace_1", 0, 1, 1);

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

    await resolver.resolve("trace_1", 0, 2, 1);

    // Verify query to edge_egress_ancestry
    const egressQuery = mockClient.queriesRan.find(q => q.query.includes("toco_tracer.edge_egress_ancestry"));
    expect(egressQuery).toBeDefined();
    expect(egressQuery?.query_params.edgeIds).toEqual(["edge_1"]);

    // Verify read_edges snaps inserted
    const wiresInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.read_edges");
    expect(wiresInsert).toBeDefined();
    
    // We expect wires generated for visual_depth = 0, 1 (sparse inserts skip duplicate depth 2)
    expect(wiresInsert?.values.length).toBe(2);

    // Depth 0: snaps to container
    expect(wiresInsert?.values[0].visual_depth).toBe(0);
    expect(wiresInsert?.values[0].from_target_id).toBe("con_1");
    expect(wiresInsert?.values[0].from_target_type).toBe("container");

    // Depth 1: snaps to node_B (egress path index 1 is node_B)
    expect(wiresInsert?.values[1].visual_depth).toBe(1);
    expect(wiresInsert?.values[1].from_target_id).toBe("node_B");
    expect(wiresInsert?.values[1].from_target_type).toBe("node");
  });

  it("TraceClosureBuilder - should strictly enforce sparse inserts for very deep traces", async () => {
    const mockClient = new MockClickHouseClient();
    const mockBroker = new MockMessageBroker();
    const clickHouse = { client: mockClient as any } as ClickHouseService;
    const broker = mockBroker as any as MessageBroker;

    const resolver = new TraceClosureBuilder(clickHouse, broker);

    mockClient.mockedEdgesData = [
      {
        id: "edge_deep",
        fromNodeId: "node_leaf",
        toNodeId: "node_target",
        fromContainerId: "con_1",
        toContainerId: "con_2"
      }
    ];

    // Egress path is only 3 nodes deep, but maxDepth requested is 50
    mockClient.mockedEdgeAncestryData = [
      {
        edge_id: "edge_deep",
        egressAncestryPath: ["node_root", "node_mid", "node_leaf"]
      }
    ];

    await resolver.resolve("trace_deep", 0, 50, 1);

    const wiresInsert = mockClient.insertedRows.find(r => r.table === "toco_tracer.read_edges");
    expect(wiresInsert).toBeDefined();
    
    // Instead of 51 rows (0 to 50), it should only insert exactly 4 rows:
    // depth 0: con_1
    // depth 1: node_mid
    // depth 2: node_leaf
    // depth 3..50: identical to depth 2 (node_leaf), so they are SKIPPED.
    // Note: egressAncestryPath[0] is root, but code starts at egressAncestryPath[1] for depth 1.
    expect(wiresInsert?.values.length).toBe(3);
    
    expect(wiresInsert?.values[0].visual_depth).toBe(0);
    expect(wiresInsert?.values[0].from_target_id).toBe("con_1");
    
    expect(wiresInsert?.values[1].visual_depth).toBe(1);
    expect(wiresInsert?.values[1].from_target_id).toBe("node_mid");
    
    expect(wiresInsert?.values[2].visual_depth).toBe(2);
    expect(wiresInsert?.values[2].from_target_id).toBe("node_leaf");
  });
});
