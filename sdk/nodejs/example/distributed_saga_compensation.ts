import { finish, fakeWork, initExample } from "./_helpers";
import { Tracer } from "../src";

/**
 * Distributed saga compensation.
 *
 * Intention:
 *   Happy path begins, payment fails, compensation releases inventory.
 *   Error node + compensation edge show rollback story.
 */
async function main() {
  initExample();

  const saga = Tracer.startTrace("CheckoutSaga", { data: { service: "saga-orchestrator" } });

  const reserve = Tracer.continueTrace(saga.createCarrierHeaders(), "Inventory.reserve()", {
    data: { service: "inventory-service" },
  });
  const reserveEdge = saga.connectTo(reserve, { label: "calls", endImmediately: false });
  await fakeWork(reserve, 12);
  saga.endEdge(reserveEdge);

  const charge = Tracer.continueTrace(saga.createCarrierHeaders(), "Payment.charge()", {
    data: { service: "payment-service", expected: "card declined" },
  });
  const chargeEdge = reserve.connectTo(charge, { label: "calls", endImmediately: false });
  await fakeWork(charge, 18, "error");
  reserve.endEdge(chargeEdge, "error");

  const release = Tracer.continueTrace(saga.createCarrierHeaders(), "Inventory.release()", {
    data: { service: "inventory-service", reason: "payment failed" },
  });
  const compEdge = charge.connectTo(release, { label: "compensates", endImmediately: false });
  await fakeWork(release, 10);
  charge.endEdge(compEdge);

  saga.end("error");
  await finish(saga.traceId);
}

main().catch(console.error);
