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
  it("writes blocks to ClickHouse", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveBlocks([
      {
        id: "block",
        traceId: "trace",
        containerId: "api",
        name: "foo()",
        type: "function",
        metadata: { route: "/orders" },
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.blocks");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      containerId: "api",
      type: "function",
      metadata: JSON.stringify({ route: "/orders" }),
    });
  });

  it("writes edges as primitive node connections", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveEdges([
      {
        id: "edge_a_b",
        traceId: "trace",
        fromNodeId: "node_a",
        toNodeId: "node_b",
        type: "call",
        metadata: { sync: true },
        eventType: "requested",
        eventAtLocal: new Date(30),
        ingestedAtRemote: new Date(40),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.edges");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      fromNodeId: "node_a",
      toNodeId: "node_b",
      type: "call",
      metadata: JSON.stringify({ sync: true }),
      eventType: "requested",
      eventAtLocal: 30,
      ingestedAtRemote: 40,
    });
  });

  it("writes nodes as append-only lifecycle events", async () => {
    const client = new MockClickHouseClient();
    const repo = new LogRepoClickHouseImpl({ client } as unknown as ClickHouseService);

    await repo.saveNodes([
      {
        id: "node_a",
        traceId: "trace",
        blockId: "block",
        name: "validate",
        type: "step",
        metadata: { ok: true },
        eventType: "ended",
        eventAtLocal: new Date(60),
        ingestedAtRemote: new Date(70),
      },
    ]);

    expect(client.insertedTable).toBe("toco_tracer.nodes");
    expect(client.insertedValues[0]).toMatchObject({
      trace_id: "trace",
      blockId: "block",
      eventType: "ended",
      eventAtLocal: 60,
      ingestedAtRemote: 70,
    });
  });
});
