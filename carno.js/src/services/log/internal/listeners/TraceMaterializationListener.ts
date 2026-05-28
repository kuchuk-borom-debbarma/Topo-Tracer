import { Service, OnApplicationInit } from "@carno.js/core";
import { MessageBroker } from "../../../../infra/message/MessageBroker";
import { LogRepo } from "../LogRepo";
import { TraceNodeResolver } from "./operators/TraceNodeResolver";
import { TraceEdgeResolver } from "./operators/TraceEdgeResolver";
import { TraceClosureBuilder } from "./operators/TraceClosureBuilder";

/**
 * TraceMaterializationListener
 * The single, centralized subscriber for all background trace materialization events.
 *
 * Responsibilities:
 * - Subscribes to the "trace_materialization" broker topic on application boot.
 * - Routes each incoming job to the correct isolated operator based on the `stage` flag.
 * - Enforces a hard iteration cap (100) to prevent runaway processing loops.
 *
 * This listener is intentionally thin. All materialization logic lives in isolated operators.
 */
@Service()
export class TraceMaterializationListener {
  private nodeResolver: TraceNodeResolver;
  private edgeResolver: TraceEdgeResolver;
  private closureBuilder: TraceClosureBuilder;

  constructor(
    private messageBroker: MessageBroker,
    private logRepo: LogRepo
  ) {
    // Initialize operators with repository abstractions
    this.nodeResolver = new TraceNodeResolver(this.logRepo, this.messageBroker);
    this.edgeResolver = new TraceEdgeResolver(this.logRepo, this.messageBroker);
    this.closureBuilder = new TraceClosureBuilder(this.logRepo, this.messageBroker);
  }

  @OnApplicationInit()
  async init(): Promise<void> {
    console.log("[TraceMaterializationListener] Bootstrapping centralized materializer listener...");

    // Subscribe to unified background trace materializer topic with customized SQS-style batches
    await this.messageBroker.subscribe("trace_materialization", async (payloads: any[]) => {
      for (const payload of payloads) {
        await this.handleMaterializationJob(payload);
      }
    }, { batchSize: 5 });
  }

  // Orchestrates chronological staging loops based on target job flag, delegating to isolated operators
  private async handleMaterializationJob(payload: {
    traceId: string;
    stage: "RESOLVE_NODES" | "RESOLVE_EDGES" | "BUILD_CLOSURES";
    offset: number;
    maxDepth: number;
    maxLocalDepth?: number;
    iteration: number;
  }): Promise<void> {
    const iteration = payload.iteration || 1;

    // Hard limit to prevent infinite recursion loop in case of unexpected repeated re-publishing
    if (iteration > 100) {
      console.warn(`[TraceMaterializationListener] Aborting trace ${payload.traceId} due to exceeding max iterations (100)`);
      return;
    }

    try {
      if (payload.stage === "RESOLVE_NODES") {
        await this.nodeResolver.resolve(payload.traceId, payload.offset || 0, payload.maxDepth || 0, payload.maxLocalDepth || 0, iteration);
      } else if (payload.stage === "RESOLVE_EDGES") {
        await this.edgeResolver.resolve(payload.traceId, payload.offset || 0, payload.maxDepth || 0, payload.maxLocalDepth || 0, iteration);
      } else if (payload.stage === "BUILD_CLOSURES") {
        await this.closureBuilder.resolve(payload.traceId, payload.offset || 0, payload.maxDepth || 0, payload.maxLocalDepth || 0, iteration);
      }

    } catch (error) {
      console.error(`[TraceMaterializationListener] Failed stage "${payload.stage}" for trace ${payload.traceId} at offset ${payload.offset}:`, error);
    }
  }
}
