import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer } from "../src";

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
    importanceLevel: Importance.CRITICAL,
    data: { process: "marketplace-monolith" },
  });

  const save = request.startNode("ProductRepository.save()", {
    importanceLevel: Importance.SERVICE,
    data: { module: "products", intent: "Persist upload before async work" },
  });
  request.connectTo(save, { label: "writes" });
  await fakeWork(save, 9);

  const resizeJob = request.startNode("enqueue ResizeImages", {
    importanceLevel: Importance.SERVICE,
    data: { queue: "local-jobs", intent: "Accepted async work" },
  });
  const resizeEdge = save.connectTo(resizeJob, { label: "schedules", endImmediately: false });
  await fakeWork(resizeJob, 2);
  request.endEdge(resizeEdge);

  const emailJob = request.startNode("enqueue SellerEmail", {
    importanceLevel: Importance.SERVICE,
    data: { queue: "local-jobs", intent: "Fire-and-forget async work" },
  });
  save.connectTo(emailJob, { label: "fire-and-forget", endImmediately: false });
  await fakeWork(emailJob, 2);

  request.end();

  const worker = Tracer.startTrace("Worker: ResizeImages.perform()", {
    importanceLevel: Importance.CRITICAL,
    data: { sameTraceStory: "fake worker node connected to request job" },
  });
  // Force worker into same trace for demo by using primitive event is not needed here;
  // separate trace shows independent async execution.
  worker.end();

  await finish(request.traceId);
}

main().catch(console.error);
