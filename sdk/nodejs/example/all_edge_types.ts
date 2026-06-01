import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer, TraceNode } from "../src";

/**
 * Edge type catalog.
 *
 * Intention:
 *   Demonstrate labels UI should render on arrows.
 *   Labels are user-defined: backend stores label exactly.
 */
async function main() {
  initExample();

  const root = Tracer.startTrace("Edge label catalog");
  let previous: TraceNode = root;

  for (const label of ["calls", "reads", "writes", "publishes", "delivers", "schedules", "awaits"]) {
    const node = root.startNode(`${label} target`, { data: { label } });
    const edgeId = previous.connectTo(node, { label, endImmediately: false });
    await fakeWork(node, 4);
    previous.endEdge(edgeId);
    previous = node;
  }

  const beacon = root.startNode("telemetry beacon", { data: { kind: "fire-and-forget" } });
  previous.connectTo(beacon, { label: "fire-and-forget", endImmediately: false });
  await fakeWork(beacon, 2);

  root.end();
  await finish(root.traceId);
}

main().catch(console.error);
