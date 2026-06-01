import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer } from "../src";

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
    data: { process: "commerce-monolith", depthMeaning: "function nesting" },
  });

  const controller = http.startNode("OrdersController#create", { data: { module: "controller" } });
  await fakeWork(controller, 4);

  const domain = controller.startNode("OrderWorkflow.createOrder()", { data: { module: "domain" } });
  await fakeWork(domain, 9);

  const pricing = domain.startNode("Pricing.calculateTotal()", { data: { module: "pricing" } });
  await fakeWork(pricing, 7);

  const repository = domain.startNode("OrderRepository.save()", { data: { module: "repository" } });
  pricing.connectTo(repository, { label: "passes total" });
  await fakeWork(repository, 12);

  await fakeWork(http, 1);
  await finish(http.traceId);
}

main().catch(console.error);
