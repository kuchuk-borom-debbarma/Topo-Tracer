import { expect, test, describe } from "bun:test";
import { TraceReadModelMaterializer } from "./TraceReadModelMaterializer";
import { TraceGenerator } from "./TraceGenerator";
import { FakeReadRepo, mockLogger } from "./test-helpers";
import { appendFile, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

describe("TraceReadModelMaterializer Performance", () => {
  const gen = new TraceGenerator("user-perf", "trace-perf");
  const repo = new FakeReadRepo();
  const materializer = new TraceReadModelMaterializer(mockLogger, repo);

  test("D-12 & D-13: 50k node materialization performance", async () => {
    const nodeCount = 50000;
    const { nodeEvents, edgeEvents } = gen.generateRawFanOut(nodeCount - 1, Date.now());

    repo.loadCheckpoint.mockResolvedValue(null);
    repo.loadLatestReadModel.mockResolvedValue({ nodes: [], edges: [], summary: null });
    repo.loadRawEventsAfterCheckpoint.mockResolvedValue({ nodeEvents, edgeEvents });

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    await materializer.materializeTrace({ userId: "user-perf", traceId: "trace-perf" });

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const durationMs = endTime - startTime;
    const memoryUsedMb = (endMemory - startMemory) / 1024 / 1024;

    console.log(`Materialized ${nodeCount} nodes in ${durationMs.toFixed(2)}ms`);
    console.log(`Heap usage change: ${memoryUsedMb.toFixed(2)}MB`);
    console.log(`Peak heap used: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // D-12: Ensure it doesn't crash or exceed 512MB (roughly)
    // process.memoryUsage().heapUsed is a snapshot, not peak, but it gives an idea.
    expect(process.memoryUsage().heapUsed).toBeLessThan(512 * 1024 * 1024);

    // D-13: Latency requirement < 250ms for 50k nodes for the correctClockSkew pass.
    // Since we measured the WHOLE materialization, it should definitely be higher,
    // but the task says "Measure the time taken by the correctClockSkew pass".
    // I will add a separate test for the pass specifically if needed, 
    // or just ensure the whole thing is reasonable.
    // However, I'll log the results to performance.json.

    const result = {
      timestamp: new Date().toISOString(),
      nodeCount,
      durationMs,
      memoryUsedMb,
      heapUsedMb: process.memoryUsage().heapUsed / 1024 / 1024
    };

    const perfFilePath = join(process.cwd(), "hono-server", "performance.json");
    let history = [];
    try {
      const content = await readFile(perfFilePath, "utf-8");
      history = JSON.parse(content);
    } catch (e) {
      // ignore
    }
    history.push(result);
    await writeFile(perfFilePath, JSON.stringify(history, null, 2));
  });

  test("D-13: correctClockSkew pass latency specifically", async () => {
    const nodeCount = 50000;
    const { nodes, edges } = gen.generateFanOut(nodeCount - 1, Date.now());
    
    // Inject some skew to make it work
    for (let i = 1; i < nodes.length; i++) {
        nodes[i].startedAt -= 100; // child starts before parent
    }

    // Access private method via casting to any
    const m = materializer as any;
    const diags = { diagClockSkew: 0 };
    
    const startTime = performance.now();
    m.correctClockSkew({ nodesArray: nodes, savedEdges: edges, diags });
    const durationMs = performance.now() - startTime;

    console.log(`correctClockSkew pass for ${nodeCount} nodes: ${durationMs.toFixed(2)}ms`);
    
    // D-13: < 5ms per 1k nodes => < 250ms for 50k nodes.
    expect(durationMs).toBeLessThan(250);
  });
});
