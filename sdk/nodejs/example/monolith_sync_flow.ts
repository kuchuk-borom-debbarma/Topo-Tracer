import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer } from "../src";

/**
 * Monolith synchronous flow.
 *
 * Intention:
 *   One process. No service/container grouping.
 *   Node names/data reveal modules. Edges show synchronous call story.
 */
async function main() {
  initExample();

  const http = Tracer.startTrace("Monolith: POST /orders", {
    importanceLevel: Importance.CRITICAL,
    data: {
      process: "commerce-monolith",
      importanceMeaning: "controller/domain/repository are visible before noisy internals",
    },
  });

  const controller = http.startNode("OrdersController#create", {
    importanceLevel: Importance.SERVICE,
    data: { module: "controller", intent: "Entry into application code" },
  });
  await fakeWork(controller, 4);

  const domain = controller.startNode("OrderWorkflow.createOrder()", {
    importanceLevel: Importance.SERVICE,
    data: { module: "domain", intent: "Main business step" },
  });
  await fakeWork(domain, 9);

  const pricing = domain.startNode("Pricing.calculateTotal()", {
    importanceLevel: Importance.DETAIL,
    data: { module: "pricing", intent: "Useful detail, hide at low importance" },
  });
  await fakeWork(pricing, 7);

  const repository = domain.startNode("OrderRepository.save()", {
    importanceLevel: Importance.SERVICE,
    data: { module: "repository", intent: "Persistence boundary" },
  });
  pricing.connectTo(repository, { label: "passes total" });
  await fakeWork(repository, 12);

  await fakeWork(http, 1);
  await finish(http.traceId);
}

main().catch(console.error);
