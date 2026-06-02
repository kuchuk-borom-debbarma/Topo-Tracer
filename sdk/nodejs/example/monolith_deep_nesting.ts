import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer, TraceNode } from "../src";

/**
 * Monolith importance hiding.
 *
 * Intention:
 *   Create 14 nested calls where only a few are important.
 *   At low slider values, noisy nested calls collapse into ghost nodes.
 *   This proves importance is not call depth. SDK chooses meaning.
 */
async function main() {
  initExample();

  const root = Tracer.startTrace("Monolith: generateInvoice()", {
    importanceLevel: Importance.CRITICAL,
    data: { scenario: "importance hiding", expectedUi: "ghost nodes when slider is low" },
  });

  const stack: TraceNode[] = [];
  let current = root;
  for (let step = 1; step <= 14; step++) {
    const previous = current;
    const importanceLevel = step === 4 || step === 10 ? Importance.SERVICE : Importance.NOISE;
    current = current.startNode(`invoice.step${step}()`, {
      importanceLevel,
      data: {
        step,
        intent: importanceLevel === Importance.SERVICE
          ? "Business checkpoint stays visible at slider 1"
          : "Nested implementation detail hides as ghost",
      },
    });
    previous.connectTo(current, { label: "calls" });
    stack.push(current);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const leafDb = current.startNode("SELECT tax_rules", {
    importanceLevel: Importance.SERVICE,
    data: { db: "postgres", intent: "Important boundary even though it is deeply nested" },
  });
  current.connectTo(leafDb, { label: "reads" });
  await fakeWork(leafDb, 10);

  for (const node of stack.reverse()) node.end();
  root.end();
  await finish(root.traceId);
}

main().catch(console.error);
