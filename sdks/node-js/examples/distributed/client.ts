import { createTracer, flushTracer, requireContext, sleep } from "../_helpers";
import { flushDistributedServerTracer, handleOrderRequest } from "./server";

const tracer = createTracer("web-frontend");

export async function runDistributedClientExample(): Promise<void> {
  await tracer.trace(
    "web.place-order",
    async (span) => {
      span.setAttribute("ui.screen", "checkout");
      span.setAttribute("order.id", "ord_demo_001");

      await tracer.trace("web.prepare-request", async (childSpan) => {
        childSpan.setAttribute("serialization", "json");
        await sleep(10);
      });

      const response = await handleOrderRequest({
        context: requireContext(tracer.extractContext()),
        body: {
          orderId: "ord_demo_001",
          amount: 1499,
        },
      });

      span.setAttribute("remote.status", response.status);
    },
    {
      traceName: "Distributed Order Demo",
      importanceLabels: {
        0: "request",
        1: "service-hop",
        2: "detail",
      },
    },
  );

  await flushTracer(tracer);
  await flushDistributedServerTracer();
}

if (import.meta.main) {
  runDistributedClientExample().catch(async (error) => {
    console.error("[distributed client example] failed", error);
    await flushTracer(tracer);
    await flushDistributedServerTracer();
  });
}
