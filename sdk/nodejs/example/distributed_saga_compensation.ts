import { endContainer, endEdge, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode } from "./_helpers";
import { Tracer } from "../src";

/**
 * Distributed saga with failure and compensation.
 *
 * Flow intention:
 *   Checkout reserves inventory, then payment fails.
 *   Saga orchestrator issues compensation to release inventory.
 *   Error status and compensation edges make non-happy-path flow visible.
 */
async function main() {
  initExample("checkout-orchestrator", "Checkout Orchestrator", "service");

  const saga = Tracer.startTrace("CheckoutSaga", {
    kind: "saga",
    metadata: { intention: "Show failure and rollback path" },
  });
  const traceId = saga.traceId;

  startContainer(traceId, "inventory-service", "Inventory Service", "service");
  startContainer(traceId, "payment-service", "Payment Service", "service");

  const reserveInventory = startNode({
    traceId,
    containerId: "inventory-service",
    name: "reserveInventory()",
    kind: "rpc_server",
  });
  startEdge({ traceId, edgeId: "edge-saga-reserve", fromId: saga.id, toId: reserveInventory.id, kind: "calls" });
  await sleep(12);
  endEdge(traceId, "edge-saga-reserve");
  reserveInventory.end();

  const chargeCard = startNode({
    traceId,
    containerId: "payment-service",
    name: "chargeCard()",
    kind: "rpc_server",
    metadata: { expected: "fail card declined" },
  });
  startEdge({ traceId, edgeId: "edge-saga-charge", fromId: reserveInventory.id, toId: chargeCard.id, kind: "calls" });
  await sleep(18);
  endEdge(traceId, "edge-saga-charge", "error");
  chargeCard.end("error");

  const releaseInventory = startNode({
    traceId,
    containerId: "inventory-service",
    name: "releaseInventory()",
    kind: "compensation",
  });
  startEdge({
    traceId,
    edgeId: "edge-charge-compensate",
    fromId: chargeCard.id,
    toId: releaseInventory.id,
    kind: "compensates",
    metadata: { reason: "Payment failed after inventory was reserved" },
  });
  await sleep(10);
  endEdge(traceId, "edge-charge-compensate");
  releaseInventory.end();

  saga.end("error");
  endContainer(traceId, "inventory-service");
  endContainer(traceId, "payment-service");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
