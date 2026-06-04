import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// We use string-based source assertions to check for contract presence and absence
// without causing compilation errors before the types are actually implemented.

const API_TYPES_PATH = path.resolve(__dirname, "../../api/types.ts");
const REPO_TYPES_PATH = path.resolve(__dirname, "./types.ts");
const REPO_CONTRACT_PATH = path.resolve(__dirname, "./ILogReadRepo.ts");

describe("ILogReadRepo Contract Assertions", () => {
  describe("Public API Types (api/types.ts)", () => {
    const content = fs.readFileSync(API_TYPES_PATH, "utf-8");

    it("should export ReadNode", () => {
      expect(content).toContain("export type ReadNode");
    });

    it("should export ReadEdge", () => {
      expect(content).toContain("export type ReadEdge");
    });

    it("should export ReadTraceSummary", () => {
      expect(content).toContain("export type ReadTraceSummary");
    });

    it("should export ReadCheckpoint", () => {
      expect(content).toContain("export type ReadCheckpoint");
    });
  });

  describe("Internal Repo Types (internal/repo/types.ts)", () => {
    const content = fs.readFileSync(REPO_TYPES_PATH, "utf-8");

    it("should export ReadNodeRow", () => {
      expect(content).toContain("export type ReadNodeRow");
    });

    it("should export ReadEdgeRow", () => {
      expect(content).toContain("export type ReadEdgeRow");
    });

    it("should export TraceSummaryRow", () => {
      expect(content).toContain("export type TraceSummaryRow");
    });

    it("should export ReadCheckpointRow", () => {
      expect(content).toContain("export type ReadCheckpointRow");
    });
  });

  describe("ILogReadRepo Contract (internal/repo/ILogReadRepo.ts)", () => {
    const content = fs.readFileSync(REPO_CONTRACT_PATH, "utf-8");

    it("should contain loadCheckpoint method", () => {
      expect(content).toContain("loadCheckpoint");
    });

    it("should contain saveReadModel method", () => {
      expect(content).toContain("saveReadModel");
    });

    it("should contain saveCheckpoint method", () => {
      expect(content).toContain("saveCheckpoint");
    });

    it("should NOT contain projection-facing names", () => {
      const forbidden = ["threshold", "visible", "window", "ghost", "projected"];
      for (const name of forbidden) {
        expect(content).not.toContain(name);
      }
    });
  });
});
