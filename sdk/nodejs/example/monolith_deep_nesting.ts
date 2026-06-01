import { flushAndShutdown, initExample, sleep } from "./_helpers";
import { Tracer, TraceNode } from "../src";

/**
 * Monolith deep nesting.
 *
 * Flow intention:
 *   One process has a deeply nested function stack.
 *   Every function is its own node.
 *   This stresses local zoom/expand behavior without involving distributed systems.
 */
async function main() {
  initExample("monolith", "Billing Monolith", "monolith");

  const root = Tracer.startTrace("POST /billing/invoice", {
    kind: "http_server",
    metadata: { scenario: "deep nested synchronous function calls" },
  });

  const stack: TraceNode[] = [];
  let current = root;

  for (let depth = 1; depth <= 12; depth++) {
    current = current.startNode(`invoicePipeline.step${depth}()`, {
      kind: "function",
      metadata: {
        depth,
        intention: "Show a deep monolith call stack that should be zoomed locally",
      },
    });
    stack.push(current);
    await sleep(2);
  }

  const taxLookup = current.startNode("taxRules.selectByRegion()", {
    kind: "db_query",
    metadata: { table: "tax_rules" },
  });
  await sleep(10);
  taxLookup.end();

  for (const node of stack.reverse()) {
    node.end();
  }

  root.end();
  await flushAndShutdown(root.traceId);
}

main().catch(console.error);
