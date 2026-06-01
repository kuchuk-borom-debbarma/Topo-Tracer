import { endContainer, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode, endEdge } from "./_helpers";
import { Tracer } from "../src";

/**
 * Monolith synchronous flow with modules as containers.
 *
 * Flow intention:
 *   One deployable process contains multiple internal modules.
 *   The request moves synchronously from controller -> domain -> repository -> database.
 *   Containers make the monolith understandable without pretending it is distributed.
 */
async function main() {
  initExample("web", "Rails-like Web App", "monolith");

  const root = Tracer.startTrace("POST /orders", {
    kind: "http_server",
    metadata: { intention: "Synchronous monolith request" },
  });
  const traceId = root.traceId;

  startContainer(traceId, "orders-controller", "OrdersController", "module", "web");
  startContainer(traceId, "pricing-domain", "Pricing Domain", "module", "web");
  startContainer(traceId, "order-repository", "Order Repository", "module", "web");
  startContainer(traceId, "postgres", "Primary Postgres", "database");

  const parseRequest = startNode({
    traceId,
    containerId: "orders-controller",
    parentId: root.id,
    name: "parseAndAuthorize()",
    kind: "function",
  });
  await sleep(5);
  parseRequest.end();

  const priceOrder = startNode({
    traceId,
    containerId: "pricing-domain",
    parentId: root.id,
    name: "calculateOrderTotal()",
    kind: "function",
  });
  startEdge({ traceId, edgeId: "edge-parse-price", fromId: parseRequest.id, toId: priceOrder.id, kind: "calls" });
  await sleep(10);
  endEdge(traceId, "edge-parse-price");
  priceOrder.end();

  const saveOrder = startNode({
    traceId,
    containerId: "order-repository",
    parentId: root.id,
    name: "OrderRepository.save()",
    kind: "function",
  });
  startEdge({ traceId, edgeId: "edge-price-save", fromId: priceOrder.id, toId: saveOrder.id, kind: "calls" });
  await sleep(6);
  endEdge(traceId, "edge-price-save");

  const insertOrder = startNode({
    traceId,
    containerId: "postgres",
    name: "INSERT INTO orders",
    kind: "db_write",
  });
  startEdge({ traceId, edgeId: "edge-save-insert", fromId: saveOrder.id, toId: insertOrder.id, kind: "writes" });
  await sleep(15);
  endEdge(traceId, "edge-save-insert");
  insertOrder.end();
  saveOrder.end();

  root.end();
  endContainer(traceId, "orders-controller");
  endContainer(traceId, "pricing-domain");
  endContainer(traceId, "order-repository");
  endContainer(traceId, "postgres");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
