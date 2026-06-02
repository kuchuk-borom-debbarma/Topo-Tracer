import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer, TraceNode } from "../src";

/**
 * Edge type catalog.
 *
 * Intention:
 *   Demonstrate labels UI should render on arrows.
 *   Labels are user-defined: backend stores label exactly.
 */
async function main() {
  initExample();

  const root = Tracer.startTrace("Edge label catalog", {
    importanceLevel: Importance.CRITICAL,
    data: { expectedUi: "Every arrow label should be readable" },
  });
  let previous: TraceNode = root;

  for (const label of ["calls", "reads", "writes", "publishes", "delivers", "schedules", "awaits"]) {
    const node = root.startNode(`${label} target`, {
      importanceLevel: Importance.SERVICE,
      data: { label, intent: "Visible at slider 1 to inspect edge labels" },
    });
    const edgeId = previous.connectTo(node, { label, endImmediately: false });
    await fakeWork(node, 4);
    previous.endEdge(edgeId);
    previous = node;
  }

  const beacon = root.startNode("telemetry beacon", {
    importanceLevel: Importance.SERVICE,
    data: { kind: "fire-and-forget" },
  });
  previous.connectTo(beacon, { label: "fire-and-forget", endImmediately: false });
  await fakeWork(beacon, 2);

  root.end();
  await finish(root.traceId);
}

main().catch(console.error);
