import { createTracer, sleep } from "../_helpers";

const tracer = createTracer("orders-service");

export type FakeRpcRequest = {
  context: {
    traceId: string;
    spanId: string;
  };
  body: {
    orderId: string;
    amount: number;
  };
};

export async function handleOrderRequest(request: FakeRpcRequest): Promise<{ status: string; orderId: string }> {
  const parentSpan = tracer.injectContext(request.context);

  return tracer.run(parentSpan, () =>
    tracer.trace(
      "orders-service.handle-order",
      async (span) => {
        span.setAttribute("order.id", request.body.orderId);
        span.setAttribute("order.amount", request.body.amount);

        await tracer.trace("orders-service.reserve-inventory", async (childSpan) => {
          childSpan.setAttribute("remote.kind", "simulated");
          await sleep(20);
        });

        await tracer.trace("orders-service.persist-order", async (childSpan) => {
          childSpan.setAttribute("db.system", "fake-postgres");
          await sleep(15);
        });

        return {
          status: "accepted",
          orderId: request.body.orderId,
        };
      },
    ),
  );
}

export async function flushDistributedServerTracer(): Promise<void> {
  await tracer.flush();
}
