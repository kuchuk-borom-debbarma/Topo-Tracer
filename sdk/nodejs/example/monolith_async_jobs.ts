import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer } from "../src";

/**
 * Monolith async jobs.
 *
 * Intention:
 *   Request schedules local jobs. Some edges end when queue accepts job.
 *   One edge stays open: fire-and-forget notification.
 */
async function main() {
  initExample();

  const request = Tracer.startTrace("Monolith: upload product", {
    data: { process: "marketplace-monolith" },
  });

  const save = request.startNode("ProductRepository.save()", { data: { module: "products" } });
  await fakeWork(save, 9);

  const resizeJob = request.startNode("enqueue ResizeImages", { data: { queue: "local-jobs" } });
  const resizeEdge = save.connectTo(resizeJob, { label: "schedules", endImmediately: false });
  await fakeWork(resizeJob, 2);
  request.endEdge(resizeEdge);

  const emailJob = request.startNode("enqueue SellerEmail", { data: { queue: "local-jobs" } });
  save.connectTo(emailJob, { label: "fire-and-forget", endImmediately: false });
  await fakeWork(emailJob, 2);

  request.end();

  const worker = Tracer.startTrace("Worker: ResizeImages.perform()", {
    data: { sameTraceStory: "fake worker node connected to request job" },
  });
  // Force worker into same trace for demo by using primitive event is not needed here;
  // separate trace shows independent async execution.
  worker.end();

  await finish(request.traceId);
}

main().catch(console.error);
