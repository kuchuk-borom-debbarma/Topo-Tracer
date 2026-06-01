import { endContainer, endEdge, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode } from "./_helpers";
import { Tracer } from "../src";

/**
 * Monolith async job flow.
 *
 * Flow intention:
 *   One monolith handles a request and enqueues local background jobs.
 *   Some async work completes later. One notification is fire-and-forget, so its edge has no end event.
 *   This shows why edge.started and optional edge.ended matter.
 */
async function main() {
  initExample("monolith", "Marketplace Monolith", "monolith");

  const root = Tracer.startTrace("POST /seller/products", {
    kind: "http_server",
    metadata: { intention: "Request schedules async jobs inside same monolith" },
  });
  const traceId = root.traceId;

  startContainer(traceId, "job-queue", "In-process Job Queue", "queue");
  startContainer(traceId, "image-worker", "Image Worker", "worker");
  startContainer(traceId, "notification-worker", "Notification Worker", "worker");

  const saveProduct = root.startNode("ProductRepository.save()", {
    kind: "db_write",
  });
  await sleep(10);
  saveProduct.end();

  const enqueueImageJob = startNode({
    traceId,
    containerId: "job-queue",
    name: "enqueue ResizeProductImages",
    kind: "job_enqueue",
  });
  startEdge({ traceId, edgeId: "edge-product-enqueue-image", fromId: saveProduct.id, toId: enqueueImageJob.id, kind: "schedules" });
  await sleep(3);
  endEdge(traceId, "edge-product-enqueue-image");
  enqueueImageJob.end();

  const enqueueEmailJob = startNode({
    traceId,
    containerId: "job-queue",
    name: "enqueue SellerNotification",
    kind: "job_enqueue",
  });
  startEdge({ traceId, edgeId: "edge-product-enqueue-email", fromId: saveProduct.id, toId: enqueueEmailJob.id, kind: "publishes" });
  await sleep(2);
  // No end event on purpose: notification is fire-and-forget from request perspective.
  enqueueEmailJob.end();

  root.end();

  const resizeImages = startNode({
    traceId,
    containerId: "image-worker",
    name: "ResizeProductImages.perform()",
    kind: "job_worker",
  });
  startEdge({ traceId, edgeId: "edge-image-delivery", fromId: enqueueImageJob.id, toId: resizeImages.id, kind: "delivers" });
  await sleep(20);
  endEdge(traceId, "edge-image-delivery");
  resizeImages.end();

  const sendEmail = startNode({
    traceId,
    containerId: "notification-worker",
    name: "SellerNotification.perform()",
    kind: "job_worker",
  });
  startEdge({ traceId, edgeId: "edge-email-delivery-open", fromId: enqueueEmailJob.id, toId: sendEmail.id, kind: "delivers" });
  await sleep(8);
  sendEmail.end();

  endContainer(traceId, "job-queue");
  endContainer(traceId, "image-worker");
  endContainer(traceId, "notification-worker");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
