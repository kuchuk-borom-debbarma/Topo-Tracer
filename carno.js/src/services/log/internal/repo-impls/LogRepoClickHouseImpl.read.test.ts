import { describe, expect, it } from "bun:test";
import { LogRepoClickHouseImpl } from "./LogRepoClickHouseImpl";
import type { ClickHouseService } from "../../../../infra/ClickHouseService";

class MockClickHouseClient {
  queriesRan: { query: string; query_params: any }[] = [];
  mockedNodesData: any[] = [];
  mockedEdgesData: any[] = [];
  mockedMetadataData: any[] = [];
  mockedReadEdgesData: any[] = [];

  async query(options: { query: string; query_params: any; format: string }): Promise<any> {
    this.queriesRan.push({ query: options.query, query_params: options.query_params });
    
    let data: any[] = [];
    if (options.query.includes("toco_tracer.edges")) {
      data = this.mockedEdgesData;
    } else if (options.query.includes("toco_tracer.trace_metadata")) {
      data = this.mockedMetadataData;
    } else if (options.query.includes("toco_tracer.read_edges")) {
      data = this.mockedReadEdgesData;
    } else {
      data = this.mockedNodesData;
    }
    
    return {
      json: async () => data
    };
  }
}

describe("LogRepoClickHouseImpl - Reads Unit Tests", () => {
  
  it("should successfully page trace nodes using composite cursors and fetch coherent edges", async () => {
    // 1. Arrange
    const mockClient = new MockClickHouseClient();
    const mockService = {
      client: mockClient as any
    } as ClickHouseService;

    const repo = new LogRepoClickHouseImpl(mockService);

    // Mock returned rows from ClickHouse
    mockClient.mockedMetadataData = [
      {
        is_zoom_ready: 1,
        max_available_depth: 2
      }
    ];

    mockClient.mockedNodesData = [
      {
        id: "node_A",
        containerId: "con_1",
        parentNodeId: "",
        name: "GatewayAPI",
        nodeType: "handler",
        depthIndex: "0",
        metadata: JSON.stringify({ ip: "127.0.0.1" }),
        initiatedAtLocal: "1779904800000",
        processedAtLocal: "1779904800010",
        completedAtLocal: "1779904800200"
      }
    ];

    mockClient.mockedEdgesData = [
      {
        id: "edge_A_B",
        fromContainerId: "con_1",
        toContainerId: "con_2",
        fromNodeId: "node_A",
        toNodeId: "node_B",
        edgeType: "http",
        dispatchedAtLocal: "1779904800005",
        respondedAtLocal: "1779904800180"
      }
    ];

    // 2. Act
    const result = await repo.fetchTracePaginated("trace_123", {
      limit: 10,
      afterTime: 1779904700000,
      afterId: "node_start"
    });

    // 3. Assert
    expect(mockClient.queriesRan.length).toBe(3);

    // First query should check metadata
    const metaQuery = mockClient.queriesRan[0]!;
    expect(metaQuery.query).toContain("toco_tracer.trace_metadata");

    // Second query should seek nodes chronologically using composite keyset cursors
    const nodeQuery = mockClient.queriesRan[1]!;
    expect(nodeQuery.query).toContain("toco_tracer.nodes");
    expect(nodeQuery.query).toContain("initiatedAtLocal > {afterTime: Int64}");
    expect(nodeQuery.query_params.afterTime).toBe(1779904700000);
    expect(nodeQuery.query_params.afterId).toBe("node_start");

    // Third query must fetch matching edges with Strict Graph Coherence
    const edgeQuery = mockClient.queriesRan[2]!;
    expect(edgeQuery.query).toContain("toco_tracer.edges");
    expect(edgeQuery.query).toContain("fromNodeId IN {nodeIds: Array(String)}");
    expect(edgeQuery.query).toContain("toNodeId IN {nodeIds: Array(String)}");
    expect(edgeQuery.query_params.nodeIds).toEqual(["node_A"]);

    // Nodes must be parsed correctly back to Date instances
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.initiatedAtLocal).toBeInstanceOf(Date);
    expect(result.nodes[0]?.initiatedAtLocal.getTime()).toBe(1779904800000);
    expect(result.nodes[0]?.metadata).toEqual({ ip: "127.0.0.1" });

    // Edges must be parsed correctly back to Date instances
    expect(result.edges.length).toBe(1);
    expect(result.edges[0]?.id).toBe("edge_A_B");
    expect(result.edges[0]?.dispatchedAtLocal).toBeInstanceOf(Date);
    expect(result.edges[0]?.dispatchedAtLocal.getTime()).toBe(1779904800005);
  });

  it("should defensively cap and normalize limit parameters to protect ClickHouse from resource exhaustion", async () => {
    const mockClient = new MockClickHouseClient();
    const mockService = {
      client: mockClient as any
    } as ClickHouseService;

    const repo = new LogRepoClickHouseImpl(mockService);

    // Act: Request a massive, database-crashing limit of 50000
    await repo.fetchTracePaginated("trace_123", { limit: 50000 });

    // Assert: The nodes query (index 1 after metadata check) must be capped at our defensive limit of 100 (+1 fetch limit for page indicators)
    expect(mockClient.queriesRan.length).toBe(2);
    const nodeQuery = mockClient.queriesRan[1]!;
    expect(nodeQuery.query_params.fetchLimit).toBe(101);
  });
});
