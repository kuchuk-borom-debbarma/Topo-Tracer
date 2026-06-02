import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer } from "../src";

/**
 * Basic primitive graph.
 *
 * Intention:
 *   Show smallest useful trace: request node -> validate node -> write node.
 *   `importanceLevel` is semantic importance. Lower number = more important.
 *   Slider 0 shows request only. Slider 1 adds validate/write. No container needed.
 */
async function main() {
  initExample();

  const request = Tracer.startTrace("POST /checkout", {
    data: { service: "checkout-api", route: "/checkout" },
  });

  const validate = request.startNode("validateCart()", {
    importanceLevel: Importance.SERVICE,
    data: { module: "cart", intent: "Fail fast before writes" },
  });
  request.connectTo(validate, { label: "validates" });
  await fakeWork(validate, 8);

  const write = request.startNode("INSERT order", {
    importanceLevel: Importance.SERVICE,
    data: { db: "postgres", table: "orders" },
  });
  validate.connectTo(write, { label: "writes" });
  await fakeWork(write, 14);

  await fakeWork(request, 2);
  await finish(request.traceId);
}

main().catch(console.error);
