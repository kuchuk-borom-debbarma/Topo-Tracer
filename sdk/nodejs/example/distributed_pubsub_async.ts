import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer } from "../src";

/**
 * Distributed pub/sub async fanout.
 *
 * Intention:
 *   Order publishes event. Three consumers branch from same publish node.
 *   Analytics edge stays open to model fire-and-forget.
 */
async function main() {
  initExample();

  const order = Tracer.startTrace("OrderService: create order", {
    data: { service: "order-service" },
  });

  const publish = order.startNode("Kafka publish order.created", {
    data: { topic: "order.created" },
  });
  const publishEdge = order.connectTo(publish, { label: "publishes", endImmediately: false });
  await fakeWork(publish, 4);
  order.endEdge(publishEdge);
  order.end();

  const inventory = Tracer.continueTrace(publish.createCarrierHeaders(), "Inventory consume order.created", {
    data: { service: "inventory-service" },
  });
  const invEdge = publish.connectTo(inventory, { label: "delivers", endImmediately: false });
  await fakeWork(inventory, 15);
  publish.endEdge(invEdge);

  const email = Tracer.continueTrace(publish.createCarrierHeaders(), "EmailWorker consume order.created", {
    data: { service: "email-worker" },
  });
  const emailEdge = publish.connectTo(email, { label: "delivers", endImmediately: false });
  await fakeWork(email, 8);
  publish.endEdge(emailEdge);

  const analytics = Tracer.continueTrace(publish.createCarrierHeaders(), "Analytics buffer order.created", {
    data: { service: "analytics-pipeline" },
  });
  publish.connectTo(analytics, { label: "fire-and-forget", endImmediately: false });
  await fakeWork(analytics, 5);

  await finish(order.traceId);
}

main().catch(console.error);
