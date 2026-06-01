import { randomUUID } from "node:crypto";

const BASE_URL = process.env.TOPO_TRACER_URL ?? "http://localhost:3000";
const TRACE_ID = `trace_${Date.now()}`;
const LARGE_MODE = process.argv.includes("--large");
const NODE_COUNT = LARGE_MODE ? 10_500 : 18;

type Event = {
  eventId?: string;
  traceId: string;
  entityId: string;
  entityType: "container" | "node" | "edge";
  eventType:
    | "container.started"
    | "container.ended"
    | "node.started"
    | "node.ended"
    | "edge.started"
    | "edge.ended";
  occurredAtUnixMs: number;
  parentId?: string | null;
  containerId?: string | null;
  fromId?: string | null;
  toId?: string | null;
  kind?: string | null;
  name?: string | null;
  status?: "ok" | "error" | "warning" | "open" | null;
  metadata?: Record<string, unknown>;
};

const events: Event[] = [];
let now = Date.now();

function push(event: Omit<Event, "eventId" | "traceId">) {
  events.push({
    eventId: randomUUID(),
    traceId: TRACE_ID,
    ...event,
  });
}

function container(id: string, name: string, kind: string) {
  push({
    entityId: id,
    entityType: "container",
    eventType: "container.started",
    occurredAtUnixMs: now,
    name,
    kind,
    status: "open",
  });
}

function endContainer(id: string) {
  push({
    entityId: id,
    entityType: "container",
    eventType: "container.ended",
    occurredAtUnixMs: now + 20,
    status: "ok",
  });
}

function node(input: {
  id: string;
  containerId: string;
  parentId?: string | null;
  name: string;
  kind: string;
  durationMs: number;
  status?: "ok" | "error";
}) {
  const start = now;
  push({
    entityId: input.id,
    entityType: "node",
    eventType: "node.started",
    occurredAtUnixMs: start,
    containerId: input.containerId,
    parentId: input.parentId ?? null,
    name: input.name,
    kind: input.kind,
    status: "open",
  });
  now += input.durationMs;
  push({
    entityId: input.id,
    entityType: "node",
    eventType: "node.ended",
    occurredAtUnixMs: now,
    status: input.status ?? "ok",
  });
}

function edge(id: string, fromId: string, toId: string, kind: string, durationMs: number, end = true) {
  const start = now;
  push({
    entityId: id,
    entityType: "edge",
    eventType: "edge.started",
    occurredAtUnixMs: start,
    fromId,
    toId,
    kind,
    status: end ? "open" : "open",
  });
  if (end) {
    push({
      entityId: id,
      entityType: "edge",
      eventType: "edge.ended",
      occurredAtUnixMs: start + durationMs,
      status: "ok",
    });
  }
}

container("api", "API Service", "service");
container("payments", "Payment Module", "module");
container("db", "Postgres", "database");
container("external", "Stripe", "external");

let previous = "checkout";
node({ id: previous, containerId: "api", name: "POST /checkout", kind: "http", durationMs: 12 });

for (let i = 1; i < NODE_COUNT; i++) {
  const containerId = i % 7 === 0 ? "db" : i % 5 === 0 ? "external" : i % 3 === 0 ? "payments" : "api";
  const id = `node_${i}`;
  const status = !LARGE_MODE && i === 12 ? "error" : "ok";
  node({
    id,
    containerId,
    parentId: i < 8 ? previous : null,
    name: labelFor(containerId, i),
    kind: kindFor(containerId),
    durationMs: 4 + (i % 35),
    status,
  });
  edge(`edge_${i}`, previous, id, containerId === "db" ? "writes" : containerId === "external" ? "calls" : "continues", 2, i !== 14);
  previous = id;
}

endContainer("api");
endContainer("payments");
endContainer("db");
endContainer("external");

async function main() {
  console.log(`Sending ${events.length} events for ${TRACE_ID}`);
  for (let i = 0; i < events.length; i += 500) {
    const response = await fetch(`${BASE_URL}/telemetry/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events.slice(i, i + 500)),
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
    }
  }
  console.log(`Trace ready after worker materializes: ${TRACE_ID}`);
}

function labelFor(containerId: string, index: number): string {
  if (containerId === "db") return `SQL write ${index}`;
  if (containerId === "external") return `Stripe request ${index}`;
  if (containerId === "payments") return `Payment step ${index}`;
  return `Checkout step ${index}`;
}

function kindFor(containerId: string): string {
  if (containerId === "db") return "db";
  if (containerId === "external") return "external_call";
  return "operation";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
