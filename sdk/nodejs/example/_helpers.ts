import { Tracer, TraceNode } from "../src";

export const BACKEND_URL = process.env.TOPO_TRACER_URL ?? "http://localhost:3000";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function initExample(containerId: string, containerName: string, containerKind: string) {
  Tracer.init({
    baseUrl: BACKEND_URL,
    containerId,
    containerName,
    containerKind,
    batchSize: 25,
    flushIntervalMs: 1000,
  });
}

export function startContainer(traceId: string, id: string, name: string, kind: string, parentId?: string) {
  Tracer.exportEvent({
    traceId,
    entityId: id,
    entityType: "container",
    eventType: "container.started",
    occurredAtUnixMs: Date.now(),
    parentId: parentId ?? null,
    name,
    kind,
    status: "open",
  });
}

export function endContainer(traceId: string, id: string) {
  Tracer.exportEvent({
    traceId,
    entityId: id,
    entityType: "container",
    eventType: "container.ended",
    occurredAtUnixMs: Date.now(),
    status: "ok",
  });
}

export function startNode(input: {
  traceId: string;
  containerId: string;
  parentId?: string | null;
  name: string;
  kind: string;
  metadata?: Record<string, unknown>;
}) {
  return new TraceNode({
    traceId: input.traceId,
    containerId: input.containerId,
    parentId: input.parentId ?? null,
    name: input.name,
    kind: input.kind,
    metadata: input.metadata,
  });
}

export function startEdge(input: {
  traceId: string;
  edgeId: string;
  fromId: string;
  toId: string;
  kind: string;
  metadata?: Record<string, unknown>;
}) {
  Tracer.exportEvent({
    traceId: input.traceId,
    entityId: input.edgeId,
    entityType: "edge",
    eventType: "edge.started",
    occurredAtUnixMs: Date.now(),
    fromId: input.fromId,
    toId: input.toId,
    kind: input.kind,
    status: "open",
    metadata: input.metadata,
  });
}

export function endEdge(traceId: string, edgeId: string, status: "ok" | "error" | "warning" = "ok") {
  Tracer.exportEvent({
    traceId,
    entityId: edgeId,
    entityType: "edge",
    eventType: "edge.ended",
    occurredAtUnixMs: Date.now(),
    status,
  });
}

export async function flushAndShutdown(traceId: string) {
  await Tracer.flush();
  await Tracer.shutdown();
  console.log(`Trace ID: ${traceId}`);
  console.log(`Open frontend and select this trace after materialization: ${traceId}`);
}
