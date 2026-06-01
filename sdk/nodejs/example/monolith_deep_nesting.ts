import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer, TraceNode } from "../src";

/**
 * Monolith deep nesting.
 *
 * Intention:
 *   Create 14 nested nodes so depth slider has real work.
 *   At low depth, hidden children should become ghost summary nodes.
 */
async function main() {
  initExample();

  const root = Tracer.startTrace("Monolith: generateInvoice()", {
    data: { scenario: "deep stack", expectedUi: "ghost nodes when maxDepth is low" },
  });

  const stack: TraceNode[] = [];
  let current = root;
  for (let depth = 1; depth <= 14; depth++) {
    current = current.startNode(`invoice.step${depth}()`, {
      data: { depth, intent: "Stress depth-based hiding" },
    });
    stack.push(current);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const leafDb = current.startNode("SELECT tax_rules", { data: { db: "postgres" } });
  await fakeWork(leafDb, 10);

  for (const node of stack.reverse()) node.end();
  root.end();
  await finish(root.traceId);
}

main().catch(console.error);
