import { describe, expect, test } from "bun:test";
// @ts-ignore
import { readFileSync } from "node:fs";
// @ts-ignore
import { resolve } from "node:path";

// We use string-based source assertions to check for contract presence and absence
// without causing compilation errors before the types are actually implemented.
// We use .toBe(true/false) to stay compatible with the minimal bun-test.d.ts.

// @ts-ignore
const currentDir = import.meta.dir;

const API_TYPES_PATH = resolve(currentDir, "../../api/types.ts");
const REPO_TYPES_PATH = resolve(currentDir, "./types.ts");
const REPO_CONTRACT_PATH = resolve(currentDir, "./ILogReadRepo.ts");

describe("ILogReadRepo Contract Assertions", () => {
  describe("Public API Types (api/types.ts)", () => {
    // @ts-ignore
    const content = readFileSync(API_TYPES_PATH, "utf-8") as string;

    test("should export ReadNode", () => {
      expect(content.includes("export type ReadNode")).toBe(true);
    });

    test("should export ReadEdge", () => {
      expect(content.includes("export type ReadEdge")).toBe(true);
    });

    test("should export ReadTraceSummary", () => {
      expect(content.includes("export type ReadTraceSummary")).toBe(true);
    });

    test("should export ReadCheckpoint", () => {
      expect(content.includes("export type ReadCheckpoint")).toBe(true);
    });

    test("should export Phase 4 projection types", () => {
      expect(content.includes("export type ProjectionReadCap")).toBe(true);
      expect(content.includes("export type BoundedVisibleNodesResult")).toBe(true);
      expect(content.includes("export type BoundedVisibleEdgesResult")).toBe(true);
    });

    test("should NOT contain forbidden leakage", () => {
      const forbidden = ["ghost", "snapped", "HTTP", "ClickHouse"];
      for (const name of forbidden) {
        expect(content.includes(name)).toBe(false);
      }
    });
  });

  describe("Internal Repo Types (internal/repo/types.ts)", () => {
    // @ts-ignore
    const content = readFileSync(REPO_TYPES_PATH, "utf-8") as string;

    test("should export ReadNodeRow", () => {
      expect(content.includes("export type ReadNodeRow")).toBe(true);
    });

    test("should export ReadEdgeRow", () => {
      expect(content.includes("export type ReadEdgeRow")).toBe(true);
    });

    test("should export TraceSummaryRow", () => {
      expect(content.includes("export type TraceSummaryRow")).toBe(true);
    });

    test("should export ReadCheckpointRow", () => {
      expect(content.includes("export type ReadCheckpointRow")).toBe(true);
    });
  });

  describe("ILogReadRepo Contract (internal/repo/ILogReadRepo.ts)", () => {
    // @ts-ignore
    const content = readFileSync(REPO_CONTRACT_PATH, "utf-8") as string;

    test("should contain existing methods", () => {
      expect(content.includes("loadCheckpoint")).toBe(true);
      expect(content.includes("loadLatestReadModel")).toBe(true);
      expect(content.includes("loadRawEventsAfterCheckpoint")).toBe(true);
      expect(content.includes("saveReadModel")).toBe(true);
      expect(content.includes("saveCheckpoint")).toBe(true);
    });

    test("should export repository-level cap constants", () => {
      expect(content.includes("DEFAULT_PROJECTION_NODE_CAP = 500")).toBe(true);
      expect(content.includes("DEFAULT_PROJECTION_EDGE_CAP = 2000")).toBe(true);
    });

    test("should contain bounded projection methods with userId and traceId", () => {
      expect(content.includes("loadBoundedVisibleNodes")).toBe(true);
      expect(content.includes("loadBoundedVisibleEdges")).toBe(true);
      
      // Check for userId/traceId presence in params
      expect(content.includes("userId: string")).toBe(true);
      expect(content.includes("traceId: string")).toBe(true);
    });

    test("should NOT contain forbidden unbounded projection names", () => {
      const forbidden = [
        "loadAllNodesForProjection", 
        "loadAllEdgesForProjection", 
        "getProjectedGraph", 
        "loadGhosts"
      ];
      for (const name of forbidden) {
        expect(content.includes(name)).toBe(false);
      }
    });

    test("should NOT contain env or caller-provided limit params", () => {
      const forbidden = ["process.env", "getEnv", "limit: number"];
      for (const name of forbidden) {
        expect(content.includes(name)).toBe(false);
      }
    });
  });
});
