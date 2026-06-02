import { finish, fakeWork, initExample } from "./_helpers";
import { Importance, Tracer } from "../src";

/**
 * Distributed synchronous HTTP/RPC.
 *
 * Intention:
 *   API node calls Payment node, Payment calls Stripe node, Payment writes DB.
 *   All edges end because caller waits for response.
 *   API, Payment, Stripe, and DB are all service-boundary nodes at importance 0.
 */
async function main() {
  initExample();

  const api = Tracer.startTrace("API Gateway: POST /checkout", {
    importanceLevel: Importance.CRITICAL,
    data: { service: "api-gateway", protocol: "http" },
  });

  const payment = Tracer.continueTrace(api.createCarrierHeaders(), "PaymentService.Charge", {
    importanceLevel: Importance.CRITICAL,
    data: { service: "payment-service", protocol: "grpc" },
  });
  const apiToPayment = api.connectTo(payment, { label: "grpc call", endImmediately: false });
  await fakeWork(payment, 10);
  api.endEdge(apiToPayment);

  const stripe = payment.startNode("Stripe POST /charges", {
    importanceLevel: Importance.CRITICAL,
    data: { service: "stripe", protocol: "https" },
  });
  const stripeEdge = payment.connectTo(stripe, { label: "https call", endImmediately: false });
  await fakeWork(stripe, 35);
  payment.endEdge(stripeEdge);

  const db = payment.startNode("INSERT payment", {
    importanceLevel: Importance.CRITICAL,
    data: { db: "payments-postgres" },
  });
  payment.connectTo(db, { label: "writes" });
  await fakeWork(db, 13);

  api.end();
  await finish(api.traceId);
}

main().catch(console.error);
