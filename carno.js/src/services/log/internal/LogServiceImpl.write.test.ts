import { describe, expect, it } from "bun:test";
import { LogServiceImpl } from "./LogServiceImpl";
import { MockLogRepo } from "./repo-impls/MockLogRepo";
import type { NodeInput, EdgeInput, ContainerInput, Node, Edge, Container } from "../types";

describe("LogServiceImpl - Writes Unit Tests", () => {
  
  it("should successfully enrich missing optional fields on node ingestion", async () => {
    const mockRepo = new MockLogRepo();
    const service = new LogServiceImpl(mockRepo);

    const inputNode: NodeInput = {
      id: "node_1",
      traceId: "t_1",
      containerId: "con_1",
      name: "GatewayAPI",
      nodeType: "handler",
      depthIndex: 0,
      initiatedAtLocal: new Date(),
      processedAtLocal: new Date(),
    };

    await service.logNode(inputNode);

    expect(mockRepo.savedNodes.length).toBe(1);
    const saved = mockRepo.savedNodes[0]!;
    expect(saved.parentNodeId).toBe(""); // Enriched missing optional parentNodeId
    expect(saved.metadata).toBeNull();   // Enriched missing optional metadata to null
  });

  it("should shift container timestamps in-memory without database mutations", async () => {
    const mockRepo = new MockLogRepo();
    const service = new LogServiceImpl(mockRepo);

    const baseDate = new Date("2026-05-26T12:00:00.000Z");
    const newBaseDate = new Date("2026-05-26T18:00:00.000Z");

    const containers: ContainerInput[] = [
      { id: "c_1", name: "pod_a", containerType: "pod", createdAtLocal: baseDate }
    ];

    const shifted = await service.updateContainerLocalTimes(containers, newBaseDate);

    expect(shifted[0]?.createdAtLocal.getTime()).toBe(newBaseDate.getTime());
    expect(containers[0]?.createdAtLocal.getTime()).toBe(baseDate.getTime()); // Immutability test
  });

  it("should accurately conserve processed/completed relative offsets during in-memory node time shifting", async () => {
    const mockRepo = new MockLogRepo();
    const service = new LogServiceImpl(mockRepo);

    const originalInit = new Date(1000);
    const originalProc = new Date(1050); // +50ms
    const originalComp = new Date(1200); // +200ms

    const nodes: NodeInput[] = [
      {
        id: "n_1",
        traceId: "t_1",
        containerId: "c_1",
        name: "test_node_1",
        nodeType: "handler",
        depthIndex: 0,
        initiatedAtLocal: originalInit,
        processedAtLocal: originalProc,
        completedAtLocal: originalComp,
      }
    ];

    const targetBase = new Date(5000);
    const shifted = await service.updateNodeLocalTimes(nodes, targetBase);
    const resultNode = shifted[0]!;

    expect(resultNode.initiatedAtLocal.getTime()).toBe(5000);
    expect(resultNode.processedAtLocal.getTime()).toBe(5050); // Preserved offset of +50ms
    expect(resultNode.completedAtLocal?.getTime()).toBe(5200); // Preserved offset of +200ms
  });

  it("should handle logging empty lists without failures or repo invokes", async () => {
    const mockRepo = new MockLogRepo();
    const service = new LogServiceImpl(mockRepo);

    await service.logContainers([]);
    await service.logNodes([]);
    await service.logEdges([]);

    expect(mockRepo.savedContainers.length).toBe(0);
    expect(mockRepo.savedNodes.length).toBe(0);
    expect(mockRepo.savedEdges.length).toBe(0);
  });
});
