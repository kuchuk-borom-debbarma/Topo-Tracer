import { expect, test, describe } from "bun:test";
import * as schema from "./schema";

describe("ClickHouse Read Model Schema", () => {
  const readTableConstants = [
    "CLICKHOUSE_CREATE_READ_NODES_TABLE",
    "CLICKHOUSE_CREATE_READ_EDGES_TABLE",
    "CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE",
    "CLICKHOUSE_CREATE_MATERIALIZATION_CHECKPOINTS_TABLE",
  ] as const;

  test("Read model DDL constants are exported", () => {
    readTableConstants.forEach((constant) => {
      expect((schema as any)[constant]).toBeDefined();
      expect(typeof (schema as any)[constant]).toBe("string");
    });
  });

  test("All read model tables are registered in CLICKHOUSE_SCHEMA_STATEMENTS", () => {
    readTableConstants.forEach((constant) => {
      const ddl = (schema as any)[constant];
      expect(schema.CLICKHOUSE_SCHEMA_STATEMENTS).toContain(ddl);
    });
  });

  function assertEveryColumnHasComment(ddl: string, tableName: string) {
    // Find the block between the first '(' and the last ')'
    const start = ddl.indexOf("(");
    const end = ddl.lastIndexOf(")");
    if (start === -1 || end === -1) {
      throw new Error(`Could not find column block in DDL for ${tableName}`);
    }

    const columnBlock = ddl.substring(start + 1, end);
    const lines = columnBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));

    lines.forEach((line) => {
      // Ignore constraints or special lines if they don't look like column definitions
      // For ClickHouse CREATE TABLE, columns usually look like: name Type [other] COMMENT '...'
      if (line.includes(",") || lines.indexOf(line) === lines.length - 1) {
        expect(line).toContain("COMMENT");
      }
    });
  }

  readTableConstants.forEach((constant) => {
    test(`Every column in ${constant} has a ClickHouse COMMENT`, () => {
      const ddl = (schema as any)[constant];
      assertEveryColumnHasComment(ddl, constant);
    });
  });

  test("Read tables use materialization versioning fields", () => {
    expect(schema.CLICKHOUSE_CREATE_READ_NODES_TABLE).toContain("materialized_at_ms");
    expect(schema.CLICKHOUSE_CREATE_READ_EDGES_TABLE).toContain("materialized_at_ms");
    expect(schema.CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE).toContain("materialized_at_ms");
    // Checkpoints use version fields but might name them differently as per plan
    expect(schema.CLICKHOUSE_CREATE_MATERIALIZATION_CHECKPOINTS_TABLE).toMatch(/node_progress|edge_progress/);
  });

  test("Read edge DDL includes flow order columns", () => {
    expect(schema.CLICKHOUSE_CREATE_READ_EDGES_TABLE).toContain("from_flow_order");
    expect(schema.CLICKHOUSE_CREATE_READ_EDGES_TABLE).toContain("to_flow_order");
  });

  test("Trace summary DDL includes named diagnostics and no Map", () => {
    expect(schema.CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE).not.toContain("Map(");
    // RSCH-07 mentions counts, bounds, materialization time, and named diagnostics.
    // D-07 says "Named diagnostic columns"
    expect(schema.CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE).toContain("diagnostic_");
  });
});
