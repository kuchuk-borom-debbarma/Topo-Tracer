import { flushAndShutdown, initExample, sleep } from "./_helpers";
import { Tracer } from "../src";

/**
 * Basic v2 usage.
 *
 * Flow intention:
 *   HTTP request enters one service.
 *   The handler calls two nested operations.
 *   Parent/child links plus automatic "continues" edges show simple synchronous flow.
 */
async function main() {
  initExample("api", "Checkout API", "service");

  const root = Tracer.startTrace("POST /checkout", {
    kind: "http_server",
    metadata: { route: "/checkout", method: "POST" },
  });

  const validateCart = root.startNode("validateCart()", {
    kind: "function",
    metadata: { intention: "Reject invalid cart before doing expensive work" },
  });
  await sleep(8);
  validateCart.end();

  const saveOrder = root.startNode("orders.insert()", {
    kind: "db_query",
    metadata: { sql: "INSERT INTO orders ..." },
  });
  await sleep(12);
  saveOrder.end();

  root.end();
  await flushAndShutdown(root.traceId);
}

main().catch(console.error);
