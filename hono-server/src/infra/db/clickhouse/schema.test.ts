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
    // Find the block between the first '(' and the ')' before 'ENGINE'
    const start = ddl.indexOf("(");
    const engineIndex = ddl.indexOf("ENGINE");
    const end = ddl.lastIndexOf(")", engineIndex);
    
    if (start === -1 || end === -1) {
      throw new Error(`Could not find column block in DDL for ${tableName}`);
    }

    const columnBlock = ddl.substring(start + 1, end);
    const lines = columnBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));

    lines.forEach((line) => {
      // Column lines in these DDLs should all have COMMENT
      // We skip lines that are just closing parens if they somehow got in, 
      // but trim() and filter() above should handle most cases.
      if (line.length > 5) { // Simple heuristic for a column line
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

  test("Read node DDL does not contain scope column", () => {
    // Phase 3 materialization does not provide a scope field, resolving Research R-03-scope
    expect(schema.CLICKHOUSE_CREATE_READ_NODES_TABLE).not.toContain("scope String");
  });

  test("Trace summary DDL includes named diagnostics and no Map", () => {
    expect(schema.CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE).not.toContain("Map(");
    // RSCH-07 mentions counts, bounds, materialization time, and named diagnostics.
    // D-07 says "Named diagnostic columns"
    expect(schema.CLICKHOUSE_CREATE_TRACE_SUMMARIES_TABLE).toContain("diagnostic_");
  });
});
