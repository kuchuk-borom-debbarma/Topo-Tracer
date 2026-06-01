import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer } from "../src";

/**
 * Basic primitive graph.
 *
 * Intention:
 *   Show smallest useful trace: request node -> validate node -> write node.
 *   `depth` is nesting. Frontend slider hides nodes deeper than chosen depth.
 */
async function main() {
  initExample();

  const request = Tracer.startTrace("POST /checkout", {
    data: { service: "checkout-api", route: "/checkout" },
  });

  const validate = request.startNode("validateCart()", {
    data: { module: "cart", intent: "Fail fast before writes" },
  });
  await fakeWork(validate, 8);

  const write = request.startNode("INSERT order", {
    data: { db: "postgres", table: "orders" },
  });
  validate.connectTo(write, { label: "writes" });
  await fakeWork(write, 14);

  await fakeWork(request, 2);
  await finish(request.traceId);
}

main().catch(console.error);
