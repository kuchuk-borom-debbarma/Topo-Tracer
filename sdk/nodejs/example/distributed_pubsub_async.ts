import { endContainer, endEdge, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode } from "./_helpers";
import { Tracer } from "../src";

/**
 * Distributed async pub/sub flow.
 *
 * Flow intention:
 *   Order Service publishes OrderCreated to a topic.
 *   Inventory, Email, and Analytics consume independently.
 *   Publish edge ends quickly. Delivery edges end when each consumer receives.
 *   Analytics has an open edge to show fire-and-forget telemetry.
 */
async function main() {
  initExample("order-service", "Order Service", "service");

  const orderRequest = Tracer.startTrace("POST /orders", {
    kind: "http_server",
    metadata: { scenario: "distributed pub/sub fanout" },
  });
  const traceId = orderRequest.traceId;

  startContainer(traceId, "topic-order-created", "Kafka topic: order.created", "topic");
  startContainer(traceId, "inventory-service", "Inventory Service", "service");
  startContainer(traceId, "email-worker", "Email Worker", "worker");
  startContainer(traceId, "analytics-pipeline", "Analytics Pipeline", "pipeline");

  const saveOrder = orderRequest.startNode("OrderRepository.save()", {
    kind: "db_write",
  });
  await sleep(10);
  saveOrder.end();

  const publish = startNode({
    traceId,
    containerId: "topic-order-created",
    name: "publish OrderCreated",
    kind: "message_publish",
  });
  startEdge({ traceId, edgeId: "edge-save-publish", fromId: saveOrder.id, toId: publish.id, kind: "publishes" });
  await sleep(4);
  endEdge(traceId, "edge-save-publish");
  publish.end();
  orderRequest.end();

  const inventoryConsume = startNode({
    traceId,
    containerId: "inventory-service",
    name: "consume OrderCreated",
    kind: "message_consume",
  });
  startEdge({ traceId, edgeId: "edge-topic-inventory", fromId: publish.id, toId: inventoryConsume.id, kind: "delivers" });
  await sleep(12);
  endEdge(traceId, "edge-topic-inventory");
  inventoryConsume.end();

  const emailConsume = startNode({
    traceId,
    containerId: "email-worker",
    name: "consume OrderCreated",
    kind: "message_consume",
  });
  startEdge({ traceId, edgeId: "edge-topic-email", fromId: publish.id, toId: emailConsume.id, kind: "delivers" });
  await sleep(8);
  endEdge(traceId, "edge-topic-email");
  emailConsume.end();

  const analyticsConsume = startNode({
    traceId,
    containerId: "analytics-pipeline",
    name: "buffer OrderCreated for warehouse",
    kind: "message_consume",
  });
  startEdge({
    traceId,
    edgeId: "edge-topic-analytics-open",
    fromId: publish.id,
    toId: analyticsConsume.id,
    kind: "fire_and_forget",
    metadata: { intention: "No producer wait; delivery confirmation is intentionally absent" },
  });
  await sleep(5);
  analyticsConsume.end();

  endContainer(traceId, "topic-order-created");
  endContainer(traceId, "inventory-service");
  endContainer(traceId, "email-worker");
  endContainer(traceId, "analytics-pipeline");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
