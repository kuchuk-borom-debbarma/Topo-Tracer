import { describe, expect, it } from "bun:test";
import { LogRepoClickHouseImpl } from "./LogRepoClickHouseImpl";
import type { ClickHouseService } from "../../../../infra/ClickHouseService";
import type { Node } from "../../types";

class MockClickHouseClient {
  insertedTable = "";
  insertedValues: any[] = [];
  insertedFormat = "";

  async insert(options: { table: string; values: any[]; format: string }): Promise<any> {
    this.insertedTable = options.table;
    this.insertedValues = options.values;
    this.insertedFormat = options.format;
  }
}

describe("LogRepoClickHouseImpl - Writes Unit Tests", () => {
  it("should format Node timestamps to epoch ms and serialize metadata before ClickHouse insertion", async () => {
    // 1. Arrange
    const mockClient = new MockClickHouseClient();
    const mockService = {
      client: mockClient as any
    } as ClickHouseService;

    const repo = new LogRepoClickHouseImpl(mockService);

    const initTime = new Date("2026-05-26T12:00:00.000Z");
    const procTime = new Date("2026-05-26T12:00:00.050Z");
    const compTime = new Date("2026-05-26T12:00:00.200Z");

    const inputNodes: Node[] = [
      {
        id: "node_test_123",
        containerId: "con_1",
        parentNodeId: "node_parent",
        name: "DatabaseQuery",
        nodeType: "span",
        depthIndex: 1,
        metadata: { "db.statement": "SELECT 1" },
        initiatedAtLocal: initTime,
        processedAtLocal: procTime,
        completedAtLocal: compTime,
      }
    ];

    // 2. Act
    await repo.saveNodes(inputNodes);

    // 3. Assert
    expect(mockClient.insertedTable).toBe("toco_tracer.nodes");
    expect(mockClient.insertedFormat).toBe("JSONEachRow");
    expect(mockClient.insertedValues.length).toBe(1);

    const mapped = mockClient.insertedValues[0]!;
    expect(mapped.id).toBe("node_test_123");
    
    // Dates must be mapped to Millisecond Epoch Int64 values
    expect(mapped.initiatedAtLocal).toBe(1779796800000);
    expect(mapped.processedAtLocal).toBe(1779796800050);
    expect(mapped.completedAtLocal).toBe(1779796800200);

    // Metadata must be serialized to a JSON string for ClickHouse storage
    expect(mapped.metadata).toBe(JSON.stringify({ "db.statement": "SELECT 1" }));
  });
});
