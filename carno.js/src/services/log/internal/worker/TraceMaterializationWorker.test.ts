import { describe, expect, it } from "bun:test";
import { TraceMaterializationWorker } from "./TraceMaterializationWorker";
import { LogServiceImpl } from "../LogServiceImpl";
import { LogRepo } from "../LogRepo";
import type {
  TraceContainer,
  TraceNode,
  TraceEdge,
  ReadContainer,
  ReadNode,
  ReadEdge,
  TraceMetadata
} from "../../types";

class MockRepo extends LogRepo {
  rawContainers: TraceContainer[] = [];
  rawNodes: TraceNode[] = [];
  rawEdges: TraceEdge[] = [];

  readContainers: ReadContainer[] = [];
  readNodes: ReadNode[] = [];
  readEdges: ReadEdge[] = [];
  traceMetadata: TraceMetadata | null = null;
  readTraces: any[] = [];

  override async saveContainers(containers: TraceContainer[]): Promise<void> {
    this.rawContainers.push(...containers);
  }
  override async saveNodes(nodes: TraceNode[]): Promise<void> {
    this.rawNodes.push(...nodes);
  }
  override async saveEdges(edges: TraceEdge[]): Promise<void> {
    this.rawEdges.push(...edges);
  }

  override async fetchContainers(traceId: string): Promise<TraceContainer[]> {
    return this.rawContainers.filter(c => c.traceId === traceId);
  }
  override async fetchNodes(traceId: string): Promise<TraceNode[]> {
    return this.rawNodes.filter(n => n.traceId === traceId);
  }
  override async fetchRawEdges(traceId: string): Promise<TraceEdge[]> {
    return this.rawEdges.filter(e => e.traceId === traceId);
  }

  override async saveReadContainers(containers: ReadContainer[]): Promise<void> {
    this.readContainers.push(...containers);
  }
  override async saveReadNodes(nodes: ReadNode[]): Promise<void> {
    this.readNodes.push(...nodes);
  }
  override async saveReadEdges(edges: ReadEdge[]): Promise<void> {
    this.readEdges.push(...edges);
  }
  override async saveTraceMetadata(metadata: TraceMetadata): Promise<void> {
    this.traceMetadata = metadata;
  }
  override async saveReadTrace(trace: any): Promise<void> {
    this.readTraces.push(trace);
  }

  override async fetchTraceMetadata(traceId: string): Promise<TraceMetadata | null> {
    return this.traceMetadata;
  }
  override async fetchReadContainers(traceId: string): Promise<ReadContainer[]> {
    return this.readContainers.filter(c => c.traceId === traceId);
  }
  override async fetchReadNodes(traceId: string): Promise<ReadNode[]> {
    return this.readNodes.filter(n => n.traceId === traceId);
  }
  override async fetchReadEdges(traceId: string): Promise<ReadEdge[]> {
    return this.readEdges.filter(e => e.traceId === traceId);
  }
}

describe("V3 Telemetry compilation and read path integration", () => {
  it("compiles nested container-node relationships with correct parentage and local sequence", async () => {
    const repo = new MockRepo();
    const service = new LogServiceImpl(repo);
    const worker = new TraceMaterializationWorker(repo);

    const traceId = "test-trace-id";

    // 1. Ingest container lifecycles via service
    await service.logContainers([
      {
        id: "container_root",
        traceId,
        parentContainerId: null,
        name: "Order API",
        type: "service",
        tags: ["checkout", "web"],
        eventType: "started",
        timestamp: 1000,
      },
      {
        id: "container_child",
        traceId,
        parentContainerId: "container_root",
        name: "Payment API",
        type: "service",
        tags: ["payment", "internal"],
        eventType: "started",
        timestamp: 3000,
      },
      {
        id: "container_child",
        traceId,
        parentContainerId: "container_root",
        name: "Payment API",
        type: "service",
        tags: ["payment", "internal"],
        eventType: "ended",
        timestamp: 8000,
      },
      {
        id: "container_root",
        traceId,
        parentContainerId: null,
        name: "Order API",
        type: "service",
        tags: ["checkout", "web"],
        eventType: "ended",
        timestamp: 9000,
      }
    ]);

    // 2. Ingest leaf chronological nodes via service
    await service.logNodes([
      {
        id: "node_validate",
        traceId,
        containerId: "container_root",
        name: "Validate Order",
        type: "step",
        tags: ["checkout"],
        eventType: "started",
        timestamp: 1500,
      },
      {
        id: "node_validate",
        traceId,
        containerId: "container_root",
        name: "Validate Order",
        type: "step",
        tags: ["checkout"],
        eventType: "ended",
        timestamp: 2500,
      },
      {
        id: "node_call_payment",
        traceId,
        containerId: "container_root",
        name: "Call Payment Gateway",
        type: "http_client",
        tags: ["network"],
        eventType: "started",
        timestamp: 2800,
      },
      {
        id: "node_call_payment",
        traceId,
        containerId: "container_root",
        name: "Call Payment Gateway",
        type: "http_client",
        tags: ["network"],
        eventType: "ended",
        timestamp: 8200,
      },
      {
        id: "node_charge",
        traceId,
        containerId: "container_child",
        name: "Charge Credit Card",
        type: "database",
        tags: ["payment", "stripe"],
        eventType: "started",
        timestamp: 4000,
      },
      {
        id: "node_charge",
        traceId,
        containerId: "container_child",
        name: "Charge Credit Card",
        type: "database",
        tags: ["payment", "stripe"],
        eventType: "ended",
        timestamp: 7000,
      }
    ]);

    // 3. Ingest connection edge representing network crossing
    await service.logEdges([
      {
        id: "edge_payment_rpc",
        traceId,
        fromNodeId: "node_call_payment",
        toNodeId: "node_charge",
        type: "http_request",
        timestamp: 2900,
      }
    ]);

    // 4. Run the materializer compiler manually
    await worker.materialize(traceId);

    // 5. Query layout using getTraceLayout
    const layout = await service.getTraceLayout(traceId);
    expect(layout).not.toBeNull();

    // Verify metadata
    expect(layout!.metadata.traceId).toBe(traceId);
    expect(layout!.metadata.isZoomReady).toBe(true);
    expect(layout!.metadata.tags).toContain("checkout");
    expect(layout!.metadata.tags).toContain("payment");
    expect(layout!.metadata.tags).toContain("network");

    // Verify Compiled Containers
    expect(layout!.containers.length).toBe(2);
    const rootC = layout!.containers.find(c => c.id === "container_root")!;
    const childC = layout!.containers.find(c => c.id === "container_child")!;
    expect(rootC.name).toBe("Order API");
    expect(rootC.parentContainerId).toBeNull();
    expect(rootC.startTimeUs).toBe(1000 * 1000);
    expect(rootC.durationUs).toBe(8000 * 1000); // 9000 - 1000
    expect(rootC.parentage).toEqual(["container_root"]);

    expect(childC.name).toBe("Payment API");
    expect(childC.parentContainerId).toBe("container_root");
    expect(childC.startTimeUs).toBe(3000 * 1000);
    expect(childC.durationUs).toBe(5000 * 1000); // 8000 - 3000
    expect(childC.parentage).toEqual(["container_root", "node_call_payment", "container_child"]);

    // Verify Compiled Nodes
    expect(layout!.nodes.length).toBe(3);
    const nodeVal = layout!.nodes.find(n => n.id === "node_validate")!;
    const nodeCall = layout!.nodes.find(n => n.id === "node_call_payment")!;
    const nodeChg = layout!.nodes.find(n => n.id === "node_charge")!;

    // localSequence indexes chronologically sorted inside containers
    expect(nodeVal.containerId).toBe("container_root");
    expect(nodeVal.localSequence).toBe(0);
    expect(nodeCall.containerId).toBe("container_root");
    expect(nodeCall.localSequence).toBe(1);

    expect(nodeChg.containerId).toBe("container_child");
    expect(nodeChg.localSequence).toBe(0);

    // Verify Lineage Ancestry Snapping parentage paths
    expect(nodeVal.parentage).toEqual(["container_root", "node_validate"]);
    // parentage path includes trigger node "node_call_payment" that connected to child container!
    expect(nodeChg.parentage).toEqual([
      "container_root",
      "node_call_payment",
      "container_child",
      "node_charge"
    ]);

    // Verify Compiled Edges
    expect(layout!.edges.length).toBe(1);
    const edge = layout!.edges[0]!;
    expect(edge.id).toBe("edge_payment_rpc");
    expect(edge.fromNodeId).toBe("node_call_payment");
    expect(edge.toNodeId).toBe("node_charge");
    expect(edge.distance).toBe(1);
  });
});
