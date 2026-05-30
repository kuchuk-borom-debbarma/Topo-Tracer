import { describe, expect, it } from "bun:test";
import { LogServiceImpl } from "./LogServiceImpl";
import { LogRepo } from "./LogRepo";
import type { TraceBlock, TraceContainer, TraceEdge, TraceNode } from "../types";

class TestRepo extends LogRepo {
  containers: TraceContainer[] = [];
  blocks: TraceBlock[] = [];
  nodes: TraceNode[] = [];
  edges: TraceEdge[] = [];

  override async saveContainers(containers: TraceContainer[]): Promise<void> {
    this.containers.push(...containers);
  }

  override async saveBlocks(blocks: TraceBlock[]): Promise<void> {
    this.blocks.push(...blocks);
  }

  override async saveNodes(nodes: TraceNode[]): Promise<void> {
    this.nodes.push(...nodes);
  }

  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    this.edges.push(...edges);
  }
}

describe("LogServiceImpl", () => {
  it("enriches containers with server receive time", async () => {
    const repo = new TestRepo();
    const service = new LogServiceImpl(repo);

    await service.logContainers([
      {
        id: "api",
        traceId: "trace",
        name: "API",
        type: "service",
        createdAtLocal: new Date(10),
      },
    ]);

    expect(repo.containers[0]?.createdAtRemote).toBeInstanceOf(Date);
    expect(repo.containers[0]?.metadata).toBeNull();
  });

  it("normalizes metadata for blocks, nodes, and edges", async () => {
    const repo = new TestRepo();
    const service = new LogServiceImpl(repo);

    await service.logBlocks([
      {
        id: "block",
        traceId: "trace",
        containerId: "api",
        name: "foo()",
        type: "function",
      },
    ]);
    await service.logNodes([
      {
        id: "node_a",
        traceId: "trace",
        blockId: "block",
        name: "validate",
        type: "step",
        eventType: "started",
        eventAtLocal: new Date(11),
      },
    ]);
    await service.logEdges([
      {
        id: "edge_a_b",
        traceId: "trace",
        fromNodeId: "node_a",
        toNodeId: "node_b",
        type: "flow",
        eventType: "requested",
        eventAtLocal: new Date(13),
      },
    ]);

    expect(repo.blocks[0]?.metadata).toBeNull();
    expect(repo.nodes[0]?.metadata).toBeNull();
    expect(repo.nodes[0]?.ingestedAtRemote).toBeInstanceOf(Date);
    expect(repo.edges[0]?.metadata).toBeNull();
    expect(repo.edges[0]?.ingestedAtRemote).toBeInstanceOf(Date);
  });
});
