import { describe, expect, it } from "bun:test";
import { LogServiceImpl } from "./LogServiceImpl";
import { LogRepo } from "./LogRepo";
import type { TraceContainer, TraceEdge, TraceNode } from "../types";

class TestRepo extends LogRepo {
  containers: TraceContainer[] = [];
  nodes: TraceNode[] = [];
  edges: TraceEdge[] = [];

  override async saveContainers(containers: TraceContainer[]): Promise<void> {
    this.containers.push(...containers);
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
        parentContainerId: null,
        name: "API",
        type: "service",
        tags: ["api"],
        eventType: "started",
        timestamp: 10,
      },
    ]);

    expect(repo.containers[0]?.createdAtRemote).toBeInstanceOf(Date);
    expect(repo.containers[0]?.timestamp).toEqual(new Date(10));
  });

  it("normalizes metadata for nodes and edges", async () => {
    const repo = new TestRepo();
    const service = new LogServiceImpl(repo);

    await service.logNodes([
      {
        id: "node_a",
        traceId: "trace",
        containerId: "api",
        name: "validate",
        type: "step",
        tags: ["validation"],
        eventType: "started",
        timestamp: 11,
      },
    ]);
    await service.logEdges([
      {
        id: "edge_a_b",
        traceId: "trace",
        fromNodeId: "node_a",
        toContainerId: "container_b",
        type: "flow",
        timestamp: 13,
      },
    ]);

    expect(repo.nodes[0]?.metadata).toBeNull();
    expect(repo.nodes[0]?.ingestedAtRemote).toBeInstanceOf(Date);
    expect(repo.nodes[0]?.timestamp).toEqual(new Date(11));
    expect(repo.edges[0]?.timestamp).toEqual(new Date(13));
  });
});
