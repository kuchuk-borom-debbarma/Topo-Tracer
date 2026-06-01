import { endContainer, endEdge, flushAndShutdown, initExample, sleep, startContainer, startEdge, startNode } from "./_helpers";
import { Tracer } from "../src";

/**
 * Distributed synchronous HTTP/RPC flow.
 *
 * Flow intention:
 *   API Gateway receives checkout.
 *   It synchronously calls Payment Service.
 *   Payment Service synchronously calls Stripe and writes Postgres.
 *   All edges have start and end, so durations show blocking time.
 */
async function main() {
  initExample("api-gateway", "API Gateway", "service");

  const gateway = Tracer.startTrace("POST /checkout", {
    kind: "http_server",
    metadata: { service: "api-gateway" },
  });
  const traceId = gateway.traceId;

  startContainer(traceId, "payment-service", "Payment Service", "service");
  startContainer(traceId, "stripe", "Stripe API", "external");
  startContainer(traceId, "payments-db", "Payments Postgres", "database");

  const authorize = gateway.startNode("authorizeRequest()", {
    kind: "function",
  });
  await sleep(5);
  authorize.end();

  const paymentServer = startNode({
    traceId,
    containerId: "payment-service",
    name: "PaymentService.Charge",
    kind: "rpc_server",
  });
  startEdge({ traceId, edgeId: "edge-gateway-payment", fromId: authorize.id, toId: paymentServer.id, kind: "calls" });
  await sleep(12);
  endEdge(traceId, "edge-gateway-payment");

  const stripeCharge = startNode({
    traceId,
    containerId: "stripe",
    name: "POST /v1/charges",
    kind: "http_client",
  });
  startEdge({ traceId, edgeId: "edge-payment-stripe", fromId: paymentServer.id, toId: stripeCharge.id, kind: "calls" });
  await sleep(35);
  endEdge(traceId, "edge-payment-stripe");
  stripeCharge.end();

  const writePayment = startNode({
    traceId,
    containerId: "payments-db",
    name: "INSERT INTO payments",
    kind: "db_write",
  });
  startEdge({ traceId, edgeId: "edge-payment-db", fromId: paymentServer.id, toId: writePayment.id, kind: "writes" });
  await sleep(15);
  endEdge(traceId, "edge-payment-db");
  writePayment.end();

  paymentServer.end();
  gateway.end();
  endContainer(traceId, "payment-service");
  endContainer(traceId, "stripe");
  endContainer(traceId, "payments-db");

  await flushAndShutdown(traceId);
}

main().catch(console.error);
