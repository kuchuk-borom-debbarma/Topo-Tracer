import { Logger } from "tslog";
import { ILogReadRepo } from "../repo/ILogReadRepo";
import {
  ReadNode,
  ReadEdge,
  ReadTraceSummary,
  ReadCheckpoint,
} from "../../api/types";
import { computeFlowOrder } from "./flowOrder";
import type {
  NodeEventRow as RawNodeEvent,
  EdgeEventRow as RawEdgeEvent,
  TraceEventRow,
} from "../repo/types";

interface MaterializationDiagnostics {
  diagMissingStarts: number;
  diagMissingEnds: number;
  diagNegativeDurations: number;
  diagInvalidImportance: number;
  diagClockSkew: number;
  diagLimitExceeded: number;
}

/**
 * Orchestrator for transforming raw append-only telemetry events into read-optimized models.
 * Following code-base.md guidelines:
 * - Business logic for trace construction and topological ordering resides here.
 * - Saves read models first and checkpoints second to ensure fault-tolerance and crash recovery.
 */
export class TraceReadModelMaterializer {
  constructor(
    private parentLogger: Logger<unknown>,
    private readRepo: ILogReadRepo,
    private now: () => number = () => Date.now(),
  ) {}

  /**
   * Run incremental materialization for a trace.
   * Performs the following steps:
   * 1. Loads the latest checkpoint tracking the processed raw event offsets.
   * 2. Loads the existing materialized read model (nodes & edges) to continue building onto them.
   * 3. Queries any raw node and edge events appended to the event log since that checkpoint.
   * 4. Iteratively processes raw start/end events to update/fold node and edge status.
   * 5. Computes topological flow ordering of the updated trace flow (detecting cycles/orphans).
   * 6. Builds the updated ReadTraceSummary stats and diagnostics.
   * 7. Saves the rebuilt read-model elements first.
   * 8. Saves the new checkpoint second to mark progress.
   */
  async materializeTrace(params: {
    userId: string;
    traceId: string;
  }): Promise<void> {
    const { userId, traceId } = params;
    const logger = this.parentLogger.getSubLogger({
      name: `Materializer:${userId}:${traceId}`,
    });
    const startedAtMs = this.now();

    // 1. Fetch current progress checkpoint
    const checkpoint = await this.readRepo.loadCheckpoint({ userId, traceId });
    
    // 2. Fetch already-processed read model components
    const {
      nodes: existingNodes,
      edges: existingEdges,
      summary: _existingSummary,
    } = await this.readRepo.loadLatestReadModel({ userId, traceId });
    let traceName = _existingSummary?.name;
    let importanceLabels = _existingSummary?.importanceLabels || {};
    
    // 3. Fetch newer raw telemetry events appended since the last checkpoint run
    const [traceEvents, { nodeEvents, edgeEvents }] = await Promise.all([
      this.readRepo.loadTraceEventsAfterCheckpoint({ userId, traceId, checkpoint }),
      this.readRepo.loadRawEventsAfterCheckpoint({ userId, traceId, checkpoint }),
    ]);

    // Update name and labels from trace events
    if (traceEvents.length > 0) {
      const latestTraceEvent = traceEvents[traceEvents.length - 1];
      if (latestTraceEvent.name) {
        traceName = latestTraceEvent.name;
      }
      if (Object.keys(latestTraceEvent.importance_labels).length > 0) {
        importanceLabels = { ...importanceLabels, ...latestTraceEvent.importance_labels };
      }
    }

    if (traceEvents.length === 0 && nodeEvents.length === 0 && edgeEvents.length === 0) {
      return;
    }

    const nodeMap = new Map<string, ReadNode>(
      existingNodes.map((n) => [n.id, { ...n }]),
    );
    const edgeMap = new Map<string, ReadEdge>(
      existingEdges.map((e) => [e.id, { ...e }]),
    );



    const diags: MaterializationDiagnostics = {
      diagMissingStarts: 0,
      diagMissingEnds: 0,
      diagNegativeDurations: 0,
      diagInvalidImportance: 0,
      diagClockSkew: 0,
      diagLimitExceeded: 0,
    };

    // 4. Process raw node events (matching start with end)
    for (const event of nodeEvents) {
      if (event.event_type === 0) {
        this.handleNodeStart(event, userId, traceId, nodeMap, diags);
      } else {
        this.handleNodeEnd(event, nodeMap, diags);
      }
    }

    // 5. Process raw edge events
    for (const event of edgeEvents) {
      if (event.event_type === 0) {
        this.handleEdgeStart(event, userId, traceId, edgeMap, diags);
      } else {
        this.handleEdgeEnd(event, edgeMap, diags);
      }
    }

    // 6. Compute topological flow sorting order
    const nodesArray = Array.from(nodeMap.values());
    const edgesArray = Array.from(edgeMap.values());
    const { flowOrderByNodeId, diagnostics: flowDiagnostics } =
      computeFlowOrder({
        nodes: nodesArray,
        edges: edgesArray,
      });

    // 7. Inject flow order positions into node and edge structures
    const { savedEdges } = this.applyFlowOrder({
      nodesArray,
      edgesArray,
      flowOrderByNodeId,
      diags,
    });

    // 8. Correct causal clock skew violations (D-07, D-08)
    this.correctClockSkew({ nodesArray, savedEdges, diags });

    // 9. Compile the aggregate diagnostics and metadata summary
    const summary = this.buildSummary({
      userId,
      traceId,
      name: traceName,
      importanceLabels,
      nodesArray,
      savedEdges,
      diags,
      flowDiagnostics,
    });

    // 10. Compute next event checkpoint offset positions
    const nextCheckpoint = this.buildNextCheckpoint({
      userId,
      traceId,
      checkpoint,
      traceEvents,
      nodeEvents,
      edgeEvents,
    });

    // 11. Persist read model first, then the checkpoint
    // Materialization follows a "write read model, then checkpoint" rule to ensure
    // that a crash during save results in a safe retry from the old checkpoint.
    await this.readRepo.saveReadModel({
      userId,
      traceId,
      nodes: nodesArray,
      edges: savedEdges,
      summary,
      materializedAt: this.now(),
    });

    await this.readRepo.saveCheckpoint({ checkpoint: nextCheckpoint });

    const durationMs = this.now() - startedAtMs;

    logger.info("Materialized trace", {
      userId,
      traceId,
      nodeCount: nodesArray.length,
      edgeCount: savedEdges.length,
      rawNodeEventCount: nodeEvents.length,
      rawEdgeEventCount: edgeEvents.length,
      durationMs,
      ...diags,
      diagCycles: flowDiagnostics.diagCycles,
      diagOrphanEdges: flowDiagnostics.diagOrphanEdges,
    });
  }

  private correctClockSkew(params: {
    nodesArray: ReadNode[];
    savedEdges: ReadEdge[];
    diags: MaterializationDiagnostics;
  }): void {
    const { nodesArray, savedEdges, diags } = params;

    // D-12: Capacity check
    if (nodesArray.length > 50000) {
      diags.diagLimitExceeded = 1;
    }

    // 1. Pre-map children to their parents using savedEdges for O(1) parent lookup (D-04)
    const parentsByChildId = new Map<string, ReadNode[]>();
    const nodeById = new Map<string, ReadNode>(nodesArray.map((n) => [n.id, n]));

    for (const edge of savedEdges) {
      const parent = nodeById.get(edge.fromNodeId);
      if (parent) {
        const parents = parentsByChildId.get(edge.toNodeId) || [];
        parents.push(parent);
        parentsByChildId.set(edge.toNodeId, parents);
      }
    }

    // 2. Sort nodesArray by flowOrder (TR1, D-08) for single-pass cascading propagation
    nodesArray.sort((a, b) => a.flowOrder - b.flowOrder);

    // Track depth to detect D-14 limits
    const depthById = new Map<string, number>();

    // 3. Iterate through sorted nodes to detect and heal causal violations
    for (const node of nodesArray) {
      // D-10: Reset to raw state before applying fresh correction pass
      node.startedAt = node.originalStartedAt;
      node.clockSkewMs = 0;

      const parents = parentsByChildId.get(node.id);
      
      // Calculate depth (D-14)
      let currentDepth = 0;
      if (parents && parents.length > 0) {
        for (const p of parents) {
          currentDepth = Math.max(currentDepth, (depthById.get(p.id) || 0) + 1);
        }
      }
      depthById.set(node.id, currentDepth);
      if (currentDepth > 5000) {
        diags.diagLimitExceeded = 1;
      }

      if (!parents || parents.length === 0) continue;

      // Determine the earliest parent start time (per D-04)
      let minParentStart = Infinity;
      for (const parent of parents) {
        minParentStart = Math.min(minParentStart, parent.startedAt);
      }

      if (minParentStart === Infinity) continue;

      // If node.startedAt < minParentStart (violation detected)
      if (node.startedAt < minParentStart) {
        // Calculate delta = minParentStart + 1 - node.startedAt (per D-01, D-02)
        const delta = minParentStart + 1 - node.startedAt;

        // Update node.startedAt and node.endedAt (preserving duration per D-03)
        node.startedAt += delta;
        if (node.endedAt !== null) {
          node.endedAt += delta;
        }

        // Set node.clockSkewMs = delta (D-10)
        node.clockSkewMs = delta;

        // Increment diags.diagClockSkew (per FR5)
        diags.diagClockSkew++;
      }
    }

    // 4. Align savedEdges with their corrected fromNode
    for (const edge of savedEdges) {
      const parent = nodeById.get(edge.fromNodeId);
      if (parent) {
        // Reset edge correction to raw
        edge.startedAt = edge.originalStartedAt;
        edge.clockSkewMs = 0;

        // Shift to align with parent if necessary (ensuring causal consistency for edges)
        if (edge.startedAt < parent.startedAt) {
          const delta = parent.startedAt - edge.originalStartedAt;
          edge.startedAt = parent.startedAt;
          if (edge.endedAt !== null) {
            edge.endedAt += delta;
          }
          edge.clockSkewMs = delta;
        }
      }
    }
  }

  private handleNodeStart(
    event: RawNodeEvent,
    userId: string,
    traceId: string,
    nodeMap: Map<string, ReadNode>,
    diags: MaterializationDiagnostics,
    
  ): void {
    if (event.started_at_ms === null) {
      diags.diagInvalidImportance++;
      return;
    }

    const importance =
      event.importance_level === null || !isFinite(event.importance_level)
        ? (diags.diagInvalidImportance++, 0)
        : event.importance_level;

    const existing = nodeMap.get(event.id);
    if (
      existing?.startedAt !== null &&
      existing &&
      existing.startedAt < event.started_at_ms
    ) {
      // Clock skew detected: a newer 'start' event has an older timestamp than existing state.
      diags.diagClockSkew++;
    }

    nodeMap.set(event.id, {
      ...(existing || {}),
      id: event.id,
      userId,
      traceId,
      nodeType: event.node_type ?? existing?.nodeType ?? "span",
      data: event.data ?? existing?.data ?? {},
      name: event.name ?? existing?.name ?? null,
      startedAt: event.started_at_ms,
      originalStartedAt: event.started_at_ms,
      clockSkewMs: existing?.clockSkewMs ?? 0,
      startMessage: event.message ?? existing?.startMessage ?? null,
      importanceLevel: importance,
      endedAt: existing?.endedAt ?? null,
      endMessage: existing?.endMessage ?? null,
      flowOrder: existing?.flowOrder ?? 0,
      materializedAt: this.now(),
    } as ReadNode);


  }

  private handleNodeEnd(
    event: RawNodeEvent,
    nodeMap: Map<string, ReadNode>,
    diags: MaterializationDiagnostics,
  ): void {
    const existing = nodeMap.get(event.id);
    if (!existing) {
      diags.diagMissingStarts++;
      return;
    }

    if (event.ended_at_ms === null) return;

    if (existing.startedAt !== null && event.ended_at_ms < existing.startedAt) {
      // Negative duration: node ended before it started.
      diags.diagNegativeDurations++;
    }

    if (existing.endedAt !== null && existing.endedAt < event.ended_at_ms) {
      diags.diagClockSkew++;
    }

    existing.endedAt = event.ended_at_ms;
    existing.endMessage = event.message ?? existing.endMessage;
    existing.materializedAt = this.now();
  }

  private handleEdgeStart(
    event: RawEdgeEvent,
    userId: string,
    traceId: string,
    edgeMap: Map<string, ReadEdge>,
    diags: MaterializationDiagnostics,
  ): void {
    if (event.started_at_ms === null) return;

    const existing = edgeMap.get(event.id);
    if (
      existing?.startedAt !== null &&
      existing &&
      existing.startedAt < event.started_at_ms
    ) {
      diags.diagClockSkew++;
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
      originalStartedAt: event.started_at_ms,
      clockSkewMs: existing?.clockSkewMs ?? 0,
      endedAt: existing?.endedAt ?? null,
      fromFlowOrder: existing?.fromFlowOrder ?? 0,
      toFlowOrder: existing?.toFlowOrder ?? 0,
      materializedAt: this.now(),
    } as ReadEdge);
  }

  private handleEdgeEnd(
    event: RawEdgeEvent,
    edgeMap: Map<string, ReadEdge>,
    diags: MaterializationDiagnostics,
  ): void {
    const existing = edgeMap.get(event.id);
    if (!existing) {
      diags.diagMissingStarts++;
      return;
    }

    if (event.ended_at_ms === null) return;

    if (existing.startedAt !== null && event.ended_at_ms < existing.startedAt) {
      diags.diagNegativeDurations++;
    }

    existing.endedAt = event.ended_at_ms;
    existing.materializedAt = this.now();
  }

  private applyFlowOrder(params: {
    nodesArray: ReadNode[];
    edgesArray: ReadEdge[];
    flowOrderByNodeId: Map<string, number>;
    diags: MaterializationDiagnostics;
  }): { savedEdges: ReadEdge[] } {
    const { nodesArray, edgesArray, flowOrderByNodeId, diags } = params;

    for (const node of nodesArray) {
      node.flowOrder = flowOrderByNodeId.get(node.id) ?? 0;
      if (node.endedAt === null) diags.diagMissingEnds++;
    }

    const savedEdges: ReadEdge[] = [];
    for (const edge of edgesArray) {
      const fromFlow = flowOrderByNodeId.get(edge.fromNodeId);
      const toFlow = flowOrderByNodeId.get(edge.toNodeId);

      if (fromFlow === undefined || toFlow === undefined) {
        // Orphan edge: refers to nodes not found in the current trace.
        continue;
      }

      edge.fromFlowOrder = fromFlow;
      edge.toFlowOrder = toFlow;
      savedEdges.push(edge);

      if (edge.endedAt === null) diags.diagMissingEnds++;
    }

    return { savedEdges };
  }

  private buildSummary(params: {
    userId: string;
    traceId: string;
    nodesArray: ReadNode[];
    savedEdges: ReadEdge[];
    diags: MaterializationDiagnostics;
    flowDiagnostics: { diagCycles: number; diagOrphanEdges: number };
    name?: string;
    importanceLabels: Record<number, string>;  }): ReadTraceSummary {
    const { userId, traceId, nodesArray, savedEdges, diags, flowDiagnostics } =
      params;

    let minImportanceLevel = Infinity;
    let maxImportanceLevel = -Infinity;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const node of nodesArray) {
      minImportanceLevel = Math.min(minImportanceLevel, node.importanceLevel);
      maxImportanceLevel = Math.max(maxImportanceLevel, node.importanceLevel);

      const startTime = node.startedAt;
      const endTime = node.endedAt ?? startTime;
      minTime = Math.min(minTime, startTime, endTime);
      maxTime = Math.max(maxTime, startTime, endTime);
    }

    return {
      userId,
      traceId,
      name: params.name || traceId,
      importanceLabels: params.importanceLabels,
      nodeCount: nodesArray.length,
      edgeCount: savedEdges.length,
      minImportanceLevel: nodesArray.length ? minImportanceLevel : 0,
      maxImportanceLevel: nodesArray.length ? maxImportanceLevel : 0,
      startedAt: nodesArray.length ? minTime : 0,
      endedAt: nodesArray.length ? maxTime : 0,
      materializedAt: this.now(),
      ...diags,
      diagCycles: flowDiagnostics.diagCycles,
      diagOrphanEdges: flowDiagnostics.diagOrphanEdges,
    };
  }

  private buildNextCheckpoint(params: {
    userId: string;
    traceId: string;
    checkpoint: ReadCheckpoint | null;
    traceEvents: TraceEventRow[];
    nodeEvents: RawNodeEvent[];
    edgeEvents: RawEdgeEvent[];
  }): ReadCheckpoint {
    const { userId, traceId, checkpoint, traceEvents, nodeEvents, edgeEvents } = params;

    const next = {
      userId,
      traceId,
      lastTraceEventTime: checkpoint?.lastTraceEventTime ?? 0,
      lastNodeEventTime: checkpoint?.lastNodeEventTime ?? 0,
      lastNodeEventId: checkpoint?.lastNodeEventId ?? "",
      lastNodeEventType: checkpoint?.lastNodeEventType ?? 0,
      lastEdgeEventTime: checkpoint?.lastEdgeEventTime ?? 0,
      lastEdgeEventId: checkpoint?.lastEdgeEventId ?? "",
      lastEdgeEventType: checkpoint?.lastEdgeEventType ?? 0,
      checkpointedAt: this.now(),
    };

    if (traceEvents.length > 0) {
      next.lastTraceEventTime = traceEvents[traceEvents.length - 1].timestamp_ms;
    }

    if (nodeEvents.length > 0) {
      const last = nodeEvents[nodeEvents.length - 1];
      next.lastNodeEventTime =
        last.event_type === 0
          ? (last.started_at_ms ?? next.lastNodeEventTime)
          : (last.ended_at_ms ?? next.lastNodeEventTime);
      next.lastNodeEventId = last.id;
      next.lastNodeEventType = last.event_type;
    }

    if (edgeEvents.length > 0) {
      const last = edgeEvents[edgeEvents.length - 1];
      next.lastEdgeEventTime =
        last.event_type === 0
          ? (last.started_at_ms ?? next.lastEdgeEventTime)
          : (last.ended_at_ms ?? next.lastEdgeEventTime);
      next.lastEdgeEventId = last.id;
      next.lastEdgeEventType = last.event_type;
    }

    return next;
  }
}
