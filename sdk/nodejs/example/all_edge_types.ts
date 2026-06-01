import { endContainer, endEdge, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode } from "./_helpers";
import { Tracer } from "../src";

/**
 * Edge type catalog.
 *
 * Flow intention:
 *   One trace demonstrates every edge kind the UI should understand.
 *   Sync edges end because caller waited.
 *   Async edges may end later or remain open when fire-and-forget.
 */
async function main() {
  initExample("edge-lab", "Edge Type Lab", "service");

  const root = Tracer.startTrace("edge type catalog", {
    kind: "demo",
    metadata: { intention: "Exercise sync and async edge rendering" },
  });
  const traceId = root.traceId;

  startContainer(traceId, "cache", "Redis", "cache");
  startContainer(traceId, "db", "Postgres", "database");
  startContainer(traceId, "queue", "Queue", "queue");
  startContainer(traceId, "worker", "Worker", "worker");
  startContainer(traceId, "external", "External API", "external");

  const readCache = startNode({ traceId, containerId: "cache", name: "GET session", kind: "cache_read" });
  startEdge({ traceId, edgeId: "edge-reads", fromId: root.id, toId: readCache.id, kind: "reads" });
  await sleep(4);
  endEdge(traceId, "edge-reads");
  readCache.end();

  const callExternal = startNode({ traceId, containerId: "external", name: "POST /risk-score", kind: "http_client" });
  startEdge({ traceId, edgeId: "edge-calls", fromId: readCache.id, toId: callExternal.id, kind: "calls" });
  await sleep(15);
  endEdge(traceId, "edge-calls");
  callExternal.end();

  const writeDb = startNode({ traceId, containerId: "db", name: "INSERT audit_log", kind: "db_write" });
  startEdge({ traceId, edgeId: "edge-writes", fromId: callExternal.id, toId: writeDb.id, kind: "writes" });
  await sleep(7);
  endEdge(traceId, "edge-writes");
  writeDb.end();

  const publishJob = startNode({ traceId, containerId: "queue", name: "publish RecomputeRisk", kind: "message_publish" });
  startEdge({ traceId, edgeId: "edge-publishes", fromId: writeDb.id, toId: publishJob.id, kind: "publishes" });
  await sleep(3);
  endEdge(traceId, "edge-publishes");
  publishJob.end();

  const workerConsume = startNode({ traceId, containerId: "worker", name: "consume RecomputeRisk", kind: "message_consume" });
  startEdge({ traceId, edgeId: "edge-delivers", fromId: publishJob.id, toId: workerConsume.id, kind: "delivers" });
  await sleep(9);
  endEdge(traceId, "edge-delivers");
  workerConsume.end();

  const scheduledJob = startNode({ traceId, containerId: "queue", name: "schedule RetryRiskScore", kind: "scheduled_job" });
  startEdge({ traceId, edgeId: "edge-schedules", fromId: workerConsume.id, toId: scheduledJob.id, kind: "schedules" });
  await sleep(2);
  endEdge(traceId, "edge-schedules");
  scheduledJob.end();

  const openTelemetry = startNode({ traceId, containerId: "external", name: "send telemetry beacon", kind: "beacon" });
  startEdge({
    traceId,
    edgeId: "edge-fire-and-forget",
    fromId: scheduledJob.id,
    toId: openTelemetry.id,
    kind: "fire_and_forget",
    metadata: { note: "No edge.ended: caller never waits for confirmation" },
  });
  await sleep(2);
  openTelemetry.end();

  root.end();
  endContainer(traceId, "cache");
  endContainer(traceId, "db");
  endContainer(traceId, "queue");
  endContainer(traceId, "worker");
  endContainer(traceId, "external");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
