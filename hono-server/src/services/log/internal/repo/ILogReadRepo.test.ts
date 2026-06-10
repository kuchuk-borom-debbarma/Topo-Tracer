import { describe, expect, test } from "bun:test";
// @ts-ignore
import { readFileSync, readdirSync, statSync } from "node:fs";
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
const LOG_DIR = resolve(currentDir, "../../");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const entryPath = resolve(dir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
      continue;
    }

    if (entryPath.endsWith(".ts") && !entryPath.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

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

    test("should export Phase 5 projection types", () => {
      expect(content.includes("export type ProjectedNormalNode")).toBe(true);
      expect(content.includes("export type ProjectedGhostNode")).toBe(true);
      expect(content.includes("export type ProjectedFlowNode")).toBe(true);
      expect(content.includes("export type ProjectedFlowEdge")).toBe(true);
      expect(content.includes("export type ProjectedFlowMetadata")).toBe(true);
      expect(content.includes("export type ProjectedFlowResult")).toBe(true);
      expect(content.includes("export type BoundedProjectionNodesResult")).toBe(true);
    });

    test("ProjectedGhostNode should have ghost shape fields", () => {
      const fields = [
        "hiddenNodeCount",
        "hiddenEdgeCount",
        "nodeTypeCounts",
        "minImportanceLevel",
        "maxImportanceLevel",
        "startedAt",
        "endedAt",
        "flowOrderStart",
        "flowOrderEnd"
      ];
      for (const field of fields) {
        expect(content.includes(field)).toBe(true);
      }
    });

    test("ProjectedFlowMetadata should have projection metadata fields", () => {
      const fields = [
        "threshold",
        "returnedNodeCount",
        "returnedEdgeCount",
        "visibleNodeCount",
        "ghostNodeCount",
        "materializedAt",
        "nodeCap",
        "edgeCap",
        "omittedEdgeCount"
      ];
      for (const field of fields) {
        expect(content.includes(field)).toBe(true);
      }
    });

    test("should NOT contain forbidden leakage", () => {
      const forbidden = ["snapped", "HTTP", "ClickHouse"];
      for (const name of forbidden) {
        expect(content.includes(name)).toBe(false);
      }
    });

    test("should NOT contain forbidden ancestry or database names in projection", () => {
      const forbidden = ["ancestorPath", "ancestryPath", "parentPath", "ClickHouse", "Row"];
      // We check for these specifically in the context of projection types
      // so we don't trip over legitimate uses of "Row" in internal repo types.
      const projectionTypesSection = content.split("export type ProjectedNormalNode")[1] || "";
      for (const name of forbidden) {
        expect(projectionTypesSection.includes(name)).toBe(false);
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
      expect(content.includes("loadBoundedProjectionNodes")).toBe(true);
      
      // Check for userId/traceId presence in params
      expect(content.includes("userId: string")).toBe(true);
      expect(content.includes("traceId: string")).toBe(true);
    });

    test("should NOT contain forbidden unbounded projection names", () => {
      const forbidden = [
        "loadAllNodesForProjection", 
        "loadAllEdgesForProjection", 
        "getProjectedFlow", 
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

  describe("Source Boundary Assertions (Phase 5/6)", () => {
    const forbiddenPatterns = [
      "ancestorPath",
      "ancestryPath",
      "parentPath",
      "frontend/src",
      "sdk/nodejs",
      "carno.js",
      "/telemetry/traces",
      "cursor",
      "drill",
      "ghost_nodes",
      "storedGhost",
      "materializedGhost",
      "loadGhosts",
      "pagination",
      "windowing",
      "broker repair",
      "repair ordering",
      "sort raw events"
    ];

    test("Hono log service files should not contain forbidden patterns", () => {
      const filesToCheck = listSourceFiles(LOG_DIR);

      for (const filePath of filesToCheck) {
        const content = readFileSync(filePath, "utf-8");
        for (const pattern of forbiddenPatterns) {
          if (pattern === "cursor" && (
            filePath.endsWith("CursorCodec.ts") || 
            filePath.endsWith("LogServiceImpl.ts") ||
            filePath.endsWith("ILogService.ts")
          )) {
            continue;
          }
          expect(content.includes(pattern)).toBe(false);
        }
      }
    });
  });
});
