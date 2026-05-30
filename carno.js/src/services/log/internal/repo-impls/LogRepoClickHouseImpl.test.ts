import { describe, expect, it } from "bun:test";
import type { ClickHouseService } from "../../../../infra/ClickHouseService";
import { LogRepoClickHouseImpl } from "./LogRepoClickHouseImpl";

class MockClickHouseClient {
  insertedTable = "";
  insertedValues: any[] = [];

  async insert(options: { table: string; values: any[] }): Promise<void> {
    this.insertedTable = options.table;
    this.insertedValues = options.values;
  }
}

describe("LogRepoClickHouseImpl", () => {
  it("writes containers to ClickHouse", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveContainers([
      {
        id: "container_a",
        traceId: "trace",
        parentContainerId: null,
        name: "service-a",
        type: "service",
        tags: ["api"],
        eventType: "started",
        timestamp: new Date(10),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.raw_containers");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      parent_container_id: "",
      name: "service-a",
      tags: ["api"],
      event_type: "started",
      timestamp: 10,
    });
  });

  it("writes nodes to ClickHouse", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveNodes([
      {
        id: "node_a",
        traceId: "trace",
        containerId: "container_a",
        name: "step-a",
        type: "step",
        tags: ["validation"],
        eventType: "started",
        timestamp: new Date(20),
        metadata: { key: "val" },
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.raw_nodes");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      container_id: "container_a",
      name: "step-a",
      tags: ["validation"],
      event_type: "started",
      timestamp: 20,
      metadata: JSON.stringify({ key: "val" }),
    });
  });

  it("writes edges to ClickHouse", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveEdges([
      {
        id: "edge_a",
        traceId: "trace",
        fromNodeId: "node_a",
        toId: "node_b",
        toType: "node",
        type: "call",
        timestamp: new Date(30),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.raw_edges");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      from_node_id: "node_a",
      to_id: "node_b",
      to_type: "node",
      type: "call",
      timestamp: 30,
    });
  });
});
