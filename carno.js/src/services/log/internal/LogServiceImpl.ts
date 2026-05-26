import { Service } from "@carno.js/core";
import { LogService } from "../LogService";
import { LogRepo } from "./LogRepo";
import type { Container, Node, Edge, ContainerInput, NodeInput, EdgeInput } from "../types";

@Service()
export class LogServiceImpl extends LogService {
  constructor(private logRepo: LogRepo) {
    super();
  }

  override async logContainer(container: ContainerInput): Promise<void> {
    await this.logContainers([container]);
  }

  override async logContainers(containers: ContainerInput[]): Promise<void> {
    console.log(`[LogService] Logging ${containers.length} containers`);
    
    // Enrich with server-side remote timestamp
    const enrichedContainers: Container[] = containers.map(c => ({
      ...c,
      createdAtRemote: new Date()
    }));

    await this.clickHouseLogRepoOverride(enrichedContainers);
  }

  override async logNode(node: NodeInput): Promise<void> {
    await this.logNodes([node]);
  }

  override async logNodes(nodes: NodeInput[]): Promise<void> {
    console.log(`[LogService] Logging ${nodes.length} nodes`);

    // Enrich optional fields to ensure compatibility
    const enrichedNodes: Node[] = nodes.map(n => ({
      ...n,
      parentNodeId: n.parentNodeId || "",
      metadata: n.metadata ?? null
    }));

    await this.logRepo.saveNodes(enrichedNodes);
  }

  override async logEdge(edge: EdgeInput): Promise<void> {
    await this.logEdges([edge]);
  }

  override async logEdges(edges: EdgeInput[]): Promise<void> {
    console.log(`[LogService] Logging ${edges.length} edges`);
    await this.logRepo.saveEdges(edges);
  }

  // Private helper to wrap and delegate
  private async clickHouseLogRepoOverride(containers: Container[]): Promise<void> {
    await this.logRepo.saveContainers(containers);
  }

  override async updateContainerLocalTimes(containers: ContainerInput[], newTime: Date = new Date()): Promise<ContainerInput[]> {
    // Note on Columnar Storage: Since ClickHouse is an append-only columnar database, 
    // database mutations (updates) are extremely slow and should be avoided. 
    // We shift timestamps in-memory before ingestion to keep the database purely append-only.
    return containers.map(c => ({
      ...c,
      createdAtLocal: newTime
    }));
  }

  override async updateNodeLocalTimes(nodes: NodeInput[], newTime: Date = new Date()): Promise<NodeInput[]> {
    // Note on Columnar Storage: Modifying timestamps inside ClickHouse requires expensive 
    // I/O part rewrites. Shifting timescales relative to a new base time is done entirely 
    // in-memory to preserve execution offsets and maintain high ingestion performance.
    return nodes.map(n => {
      const baseMs = n.initiatedAtLocal.getTime();
      const newBaseMs = newTime.getTime();
      const offsetProcessed = n.processedAtLocal.getTime() - baseMs;
      const offsetCompleted = n.completedAtLocal 
        ? n.completedAtLocal.getTime() - baseMs 
        : null;

      return {
        ...n,
        initiatedAtLocal: newTime,
        processedAtLocal: new Date(newBaseMs + offsetProcessed),
        completedAtLocal: offsetCompleted !== null 
          ? new Date(newBaseMs + offsetCompleted) 
          : undefined
      };
    });
  }

  override async updateEdgeLocalTimes(edges: EdgeInput[], newTime: Date = new Date()): Promise<EdgeInput[]> {
    // Note on Columnar Storage: Timelines are shifted here in the service layer before 
    // dispatching to ClickHouse to ensure that latency metrics remain accurate and 
    // database writes stay immutable and append-only.
    return edges.map(e => {
      const baseMs = e.dispatchedAtLocal.getTime();
      const newBaseMs = newTime.getTime();
      const offsetResponded = e.respondedAtLocal 
        ? e.respondedAtLocal.getTime() - baseMs 
        : null;

      return {
        ...e,
        dispatchedAtLocal: newTime,
        respondedAtLocal: offsetResponded !== null 
          ? new Date(newBaseMs + offsetResponded) 
          : undefined
      };
    });
  }
}


