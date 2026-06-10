import { describe, expect, it } from "bun:test";
// @ts-ignore
import { readFileSync } from "fs";
// @ts-ignore
import { join } from "path";

describe("TraceReadModelMaterializer - Source Boundary Assertions", () => {
  it("source assertion: materializer does not log a full summary as diagnostics", () => {
    // @ts-ignore
    const currentDir = import.meta.dir;
    const filePath = join(currentDir, "TraceReadModelMaterializer.ts");
    const content = readFileSync(filePath, "utf-8");
    const logMatch = content.match(/logger\.info\("Materialized trace", \{([\s\S]*?)\n    \}\);/);

    expect(logMatch).not.toBeNull();
    const logMetadata = logMatch![1];
    expect(logMetadata).not.toContain("nodes:");
    expect(logMetadata).not.toContain("edges:");
    expect(logMetadata).not.toContain("events:");
    expect(logMetadata).not.toContain("summary:");
    expect(content).not.toContain("diagnostics: summary");
    expect(logMetadata).not.toContain("data:");
  });
});
