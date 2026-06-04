import { Logger } from "../../../../common/logger";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import { ReadNode, ReadEdge, ReadTraceSummary, ReadCheckpoint } from "../../api/types";
import { computeFlowOrder } from "./flowOrder";

export class TraceReadModelMaterializer {
  constructor(
    private parentLogger: Logger<unknown>,
    private readRepo: ILogReadRepo,
    private now: () => number = () => Date.now()
  ) {}

  async materializeTrace(params: { userId: string; traceId: string }): Promise<void> {
    const { userId, traceId } = params;
    const logger = this.parentLogger.child({ userId, traceId, component: "TraceReadModelMaterializer" });

    const checkpoint = await this.readRepo.loadCheckpoint({ userId, traceId });
    const { nodes: existingNodes, edges: existingEdges, summary: _existingSummary } = 
      await this.readRepo.loadLatestReadModel({ userId, traceId });
    const { nodeEvents, edgeEvents } = 
      await this.readRepo.loadRawEventsAfterCheckpoint({ userId, traceId, checkpoint });

    if (nodeEvents.length === 0 && edgeEvents.length === 0) {
      return;
    }

    const nodeMap = new Map<string, ReadNode>(existingNodes.map(n => [n.id, { ...n }]));
    const edgeMap = new Map<string, ReadEdge>(existingEdges.map(e => [e.id, { ...e }]));

    let diagMissingStarts = 0;
    let diagMissingEnds = 0;
    let diagNegativeDurations = 0;
    let diagInvalidImportance = 0;
    let diagClockSkew = 0;

    // Fold node events
    for (const event of nodeEvents) {
      if (event.event_type === 0) { // START
        if (event.started_at_ms === null) {
          diagInvalidImportance++; // Using as general "malformed start" diagnostic
          continue;
        }

        const importance = (event.importance_level === null || !isFinite(event.importance_level))
          ? (diagInvalidImportance++, 0)
          : event.importance_level;

        const existing = nodeMap.get(event.id);
        if (existing && existing.startedAt !== null && existing.startedAt < event.started_at_ms) {
          diagClockSkew++;
        }

        nodeMap.set(event.id, {
          ...(existing || {}),
          id: event.id,
          userId,
          traceId,
          nodeType: event.node_type ?? existing?.nodeType ?? "span",
          data: event.data ?? existing?.data ?? {},
          startedAt: event.started_at_ms,
          startMessage: event.message ?? existing?.startMessage ?? null,
          importanceLevel: importance,
          // endedAt and flowOrder will be handled later or kept from existing
          endedAt: existing?.endedAt ?? null,
          endMessage: existing?.endMessage ?? null,
          flowOrder: existing?.flowOrder ?? 0,
          materializedAt: this.now(),
        } as ReadNode);
      } else { // END
        const existing = nodeMap.get(event.id);
        if (!existing) {
          diagMissingStarts++;
          continue;
        }

        if (event.ended_at_ms === null) {
          continue;
        }

        if (existing.startedAt !== null && event.ended_at_ms < existing.startedAt) {
          diagNegativeDurations++;
        }

        if (existing.endedAt !== null && existing.endedAt < event.ended_at_ms) {
          diagClockSkew++;
        }

        existing.endedAt = event.ended_at_ms;
        existing.endMessage = event.message ?? existing.endMessage;
        existing.materializedAt = this.now();
      }
    }

    // Fold edge events
    for (const event of edgeEvents) {
      if (event.event_type === 0) { // START
        if (event.started_at_ms === null) {
          continue;
        }

        const existing = edgeMap.get(event.id);
        if (existing && existing.startedAt !== null && existing.startedAt < event.started_at_ms) {
          diagClockSkew++;
        }

        edgeMap.set(event.id, {
          ...(existing || {}),
          id: event.id,
          userId,
          traceId,
          edgeType: event.edge_type ?? existing?.edgeType ?? "child",
          fromNodeId: event.from_node_id ?? existing?.fromNodeId ?? "",
          toNodeId: event.to_node_id ?? existing?.toNodeId ?? "",
          data: event.data ?? existing?.data ?? {},
          startedAt: event.started_at_ms,
          endedAt: existing?.endedAt ?? null,
          fromFlowOrder: existing?.fromFlowOrder ?? 0,
          toFlowOrder: existing?.toFlowOrder ?? 0,
          materializedAt: this.now(),
        } as ReadEdge);
      } else { // END
        const existing = edgeMap.get(event.id);
        if (!existing) {
          diagMissingStarts++;
          continue;
        }

        if (event.ended_at_ms === null) {
          continue;
        }

        if (existing.startedAt !== null && event.ended_at_ms < existing.startedAt) {
          diagNegativeDurations++;
        }

        existing.endedAt = event.ended_at_ms;
        existing.materializedAt = this.now();
      }
    }

    // Compute flow order
    const nodesArray = Array.from(nodeMap.values());
    const edgesArray = Array.from(edgeMap.values());
    const { flowOrderByNodeId, diagnostics: flowDiagnostics } = computeFlowOrder({
      nodes: nodesArray,
      edges: edgesArray,
    });

    // Apply flow order to nodes
    for (const node of nodesArray) {
      node.flowOrder = flowOrderByNodeId.get(node.id) ?? 0;
      if (node.endedAt === null) {
        diagMissingEnds++;
      }
    }

    // Filter orphan edges and apply flow order to edges
    const savedEdges: ReadEdge[] = [];
    for (const edge of edgesArray) {
      const fromFlow = flowOrderByNodeId.get(edge.fromNodeId);
      const toFlow = flowOrderByNodeId.get(edge.toNodeId);

      if (fromFlow === undefined || toFlow === undefined) {
        // Orphan edge relative to known nodes
        continue;
      }

      edge.fromFlowOrder = fromFlow;
      edge.toFlowOrder = toFlow;
      savedEdges.push(edge);

      if (edge.endedAt === null) {
        diagMissingEnds++;
      }
    }

    // Build summary
    let minImportance = Infinity;
    let maxImportance = -Infinity;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const node of nodesArray) {
      minImportance = Math.min(minImportance, node.importanceLevel);
      maxImportance = Math.max(maxImportance, node.importanceLevel);
      minTime = Math.min(minTime, node.startedAt, node.endedAt ?? node.startedAt);
      maxTime = Math.max(maxTime, node.startedAt, node.endedAt ?? node.startedAt);
    }

    const summary: ReadTraceSummary = {
      userId,
      traceId,
      nodeCount: nodesArray.length,
      edgeCount: savedEdges.length,
      minImportance: nodesArray.length ? minImportance : 0,
      maxImportance: nodesArray.length ? maxImportance : 0,
      minTime: nodesArray.length ? minTime : 0,
      maxTime: nodesArray.length ? maxTime : 0,
      materializedAt: this.now(),
      diagMissingStarts,
      diagMissingEnds,
      diagNegativeDurations,
      diagCycles: flowDiagnostics.diagCycles,
      diagOrphanEdges: flowDiagnostics.diagOrphanEdges,
      diagInvalidImportance,
      diagClockSkew,
    };

    // Build next checkpoint
    const nextCheckpoint: ReadCheckpoint = {
      userId,
      traceId,
      lastNodeEventTime: checkpoint?.lastNodeEventTime ?? 0,
      lastNodeEventId: checkpoint?.lastNodeEventId ?? "",
      lastNodeEventType: checkpoint?.lastNodeEventType ?? 0,
      lastEdgeEventTime: checkpoint?.lastEdgeEventTime ?? 0,
      lastEdgeEventId: checkpoint?.lastEdgeEventId ?? "",
      lastEdgeEventType: checkpoint?.lastEdgeEventType ?? 0,
      checkpointedAt: this.now(),
    };

    if (nodeEvents.length > 0) {
      const lastNodeEvent = nodeEvents[nodeEvents.length - 1];
      nextCheckpoint.lastNodeEventTime = lastNodeEvent.event_type === 0 
        ? (lastNodeEvent.started_at_ms ?? nextCheckpoint.lastNodeEventTime)
        : (lastNodeEvent.ended_at_ms ?? nextCheckpoint.lastNodeEventTime);
      nextCheckpoint.lastNodeEventId = lastNodeEvent.id;
      nextCheckpoint.lastNodeEventType = lastNodeEvent.event_type;
    }

    if (edgeEvents.length > 0) {
      const lastEdgeEvent = edgeEvents[edgeEvents.length - 1];
      nextCheckpoint.lastEdgeEventTime = lastEdgeEvent.event_type === 0
        ? (lastEdgeEvent.started_at_ms ?? nextCheckpoint.lastEdgeEventTime)
        : (lastEdgeEvent.ended_at_ms ?? nextCheckpoint.lastEdgeEventTime);
      nextCheckpoint.lastEdgeEventId = lastEdgeEvent.id;
      nextCheckpoint.lastEdgeEventType = lastEdgeEvent.event_type;
    }

    // Save
    await this.readRepo.saveReadModel({
      userId,
      traceId,
      nodes: nodesArray,
      edges: savedEdges,
      summary,
      materializedAt: this.now(),
    });

    await this.readRepo.saveCheckpoint({ checkpoint: nextCheckpoint });
    
    logger.info("Materialized trace", { 
      nodes: nodesArray.length, 
      edges: savedEdges.length, 
      diagnostics: summary 
    });
  }
}
