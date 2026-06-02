import { Tracer, TraceNode } from "../src";

export const BACKEND_URL = process.env.TOPO_TRACER_URL ?? "http://localhost:3999";

export function initExample() {
  Tracer.init({
    baseUrl: BACKEND_URL,
    batchSize: 50,
    flushIntervalMs: 1000,
    maxRetries: 5,
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fakeWork(node: TraceNode, ms: number, status: "ok" | "error" | "warning" = "ok") {
  await sleep(ms);
  node.end(status);
}

export async function finish(traceId: string) {
  await Tracer.flush();
  await Tracer.shutdown();
  await fetch(`${BACKEND_URL}/telemetry/materialize`, { method: "POST" }).catch(() => null);
  console.log(`Trace ID: ${traceId}`);
  console.log("Open frontend and select trace.");
}
