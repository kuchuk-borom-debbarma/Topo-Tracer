import { randomUUID } from "node:crypto";

const BASE_URL = process.env.TOPO_TRACER_URL ?? "http://localhost:3999";
const TRACE_ID = `node_trace_${Date.now()}_${randomUUID().slice(0, 8)}`;
const LARGE_MODE = process.argv.includes("--large");
const NODE_COUNT = LARGE_MODE ? 10_500 : 36;

type Event = {
  eventId?: string;
  traceId: string;
  entityId: string;
  entityType: "node" | "edge";
  eventType: "node.started" | "node.ended" | "edge.started" | "edge.ended";
  occurredAtUnixMs: number;
  name?: string | null;
  importanceLevel?: number | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  label?: string | null;
  status?: "ok" | "error" | "warning" | "open" | null;
  data?: Record<string, unknown>;
};

const events: Event[] = [];
let now = Date.now();

function emit(event: Omit<Event, "eventId" | "traceId">) {
  events.push({ eventId: randomUUID(), traceId: TRACE_ID, ...event });
}

function node(input: {
  id: string;
  name: string;
  importanceLevel: number;
  durationMs: number;
  status?: "ok" | "error" | "warning";
  data?: Record<string, unknown>;
}) {
  const startedAt = now;
  emit({
    entityId: input.id,
    entityType: "node",
    eventType: "node.started",
    occurredAtUnixMs: startedAt,
    name: input.name,
    importanceLevel: input.importanceLevel,
    status: "open",
    data: input.data,
  });
  now += input.durationMs;
  emit({
    entityId: input.id,
    entityType: "node",
    eventType: "node.ended",
    occurredAtUnixMs: now,
    status: input.status ?? "ok",
  });
}

function edge(input: {
  id: string;
  from: string;
  to: string;
  label: string;
  durationMs?: number;
  close?: boolean;
  status?: "ok" | "error" | "warning";
}) {
  const startedAt = now;
  emit({
    entityId: input.id,
    entityType: "edge",
    eventType: "edge.started",
    occurredAtUnixMs: startedAt,
    fromNodeId: input.from,
    toNodeId: input.to,
    label: input.label,
    status: "open",
  });
  if (input.close ?? true) {
    emit({
      entityId: input.id,
      entityType: "edge",
      eventType: "edge.ended",
      occurredAtUnixMs: startedAt + (input.durationMs ?? 1),
      status: input.status ?? "ok",
    });
  }
}

node({
  id: "root",
  name: "POST /checkout",
  importanceLevel: 0,
  durationMs: 8,
  data: { service: "api", route: "/checkout" },
});

let previous = "root";
for (let i = 1; i < NODE_COUNT; i++) {
  const importanceLevel = i === NODE_COUNT - 1 ? 0 : i % 5 === 0 ? 1 : i % 7 === 0 ? 2 : 4;
  const id = `node_${i}`;
  const label = i % 7 === 0 ? "writes" : i % 5 === 0 ? "publishes" : i % 3 === 0 ? "calls" : "then";
  node({
    id,
    name: nameFor(i, label),
    importanceLevel,
    durationMs: 3 + (i % 30),
    status: !LARGE_MODE && i === 21 ? "error" : "ok",
    data: { fakeService: serviceFor(i), label },
  });
  edge({
    id: `edge_${i}`,
    from: previous,
    to: id,
    label,
    durationMs: 2,
    close: i !== 11,
    status: !LARGE_MODE && i === 21 ? "error" : "ok",
  });
  previous = id;
}

async function main() {
  console.log(`Sending ${events.length} primitive events for ${TRACE_ID}`);
  for (let index = 0; index < events.length; index += 500) {
    const response = await fetch(`${BASE_URL}/telemetry/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events.slice(index, index + 500)),
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  }
  await fetch(`${BASE_URL}/telemetry/materialize`, { method: "POST" }).catch(() => null);
  console.log(`Trace ready: ${TRACE_ID}`);
}

function nameFor(index: number, label: string): string {
  if (label === "writes") return `SQL write ${index}`;
  if (label === "publishes") return `publish event ${index}`;
  if (label === "calls") return `remote call ${index}`;
  return `function step ${index}`;
}

function serviceFor(index: number): string {
  if (index % 7 === 0) return "postgres";
  if (index % 5 === 0) return "queue";
  if (index % 3 === 0) return "payment-service";
  return "monolith";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
