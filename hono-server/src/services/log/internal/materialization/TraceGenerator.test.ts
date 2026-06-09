import { expect, test, describe } from "bun:test";
import { TraceGenerator } from "./TraceGenerator";

describe("TraceGenerator", () => {
  const gen = new TraceGenerator("user-1", "trace-1");

  test("generateChain creates correct number of nodes and edges", () => {
    const { nodes, edges } = gen.generateChain(5, 1000);
    expect(nodes.length).toBe(5);
    expect(edges.length).toBe(4);
    expect(nodes[0].id).toBe("node-0");
    expect(nodes[4].id).toBe("node-4");
    expect(edges[0].fromNodeId).toBe("node-0");
    expect(edges[0].toNodeId).toBe("node-1");
  });

  test("generateFanOut creates correct number of nodes and edges", () => {
    const { nodes, edges } = gen.generateFanOut(5, 1000);
    expect(nodes.length).toBe(6); // 1 parent + 5 children
    expect(edges.length).toBe(5);
    expect(nodes[0].id).toBe("parent");
    expect(nodes[1].id).toBe("child-0");
    expect(edges[0].fromNodeId).toBe("parent");
    expect(edges[0].toNodeId).toBe("child-0");
  });

  test("injectSkew modifies node timestamp", () => {
    const { nodes } = gen.generateChain(1, 1000);
    const originalTs = nodes[0].startedAt;
    gen.injectSkew(nodes, 0, 500);
    expect(nodes[0].startedAt).toBe(originalTs + 500);
    expect(nodes[0].originalStartedAt).toBe(originalTs + 500);
  });
});
